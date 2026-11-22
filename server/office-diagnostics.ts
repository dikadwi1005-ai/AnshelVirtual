import {workerPulseEvidence,overdueOfficeQueueSummary} from './office-monitoring.ts';

// A deterministic, bounded, read-only diagnosis. It reads the real office
// database and the last observed dispatcher pulse; it never claims that a
// successful API request proves the rest of the infrastructure is healthy.
// Optional n8n checks use the n8n public API only after the owner connects it.
const localTime=value=>new Intl.DateTimeFormat('id-ID',{
  timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',
}).format(new Date(value))+' WIB';
const count=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0?Number(x):0;

export function isOfficeDiagnosticQuery(text) {
  if(typeof text!=='string'||text.length>1500)return false;
  return /^\s*@?Bima\b\s*[,：:]?\s*/i.test(text)&&
    !/^\s*@?Bima\s+dan\b/i.test(text)&&
    !/\b(?:diskusikan|diskusi|bahas bersama|ajak\s+(?:Alya|Citra|Dara))\b/i.test(text)&&
    /\b(?:cek|periksa|periksa ulang|audit|diagnosa|diagnosis|kesehatan|status|kondisi|operasional|kendala)\b/i.test(text)&&
    /\b(?:Anshel|IT|server|sistem|API|n8n|worker|workflow|operasional|endpoint|layanan)\b/i.test(text);
}

export function gmailFlightHealth(automation) {
  const mail=automation?.flightEmail;
  return mail?'Gmail Price Alerts: '+mail.connection+' · '+mail.status+' · Telegram '+
    (mail.delivery ?? 'menunggu alert')+'.':'';
}

/** The instance origin comes from trusted Vercel Production environment
 * settings, never from Telegram content. Limit outbound calls to known n8n
 * hosting domains so user text cannot turn monitoring into an SSRF proxy.
 * Sumopod is pinned to the owner's exact n8n hostname; no arbitrary hosts. */
function n8nOrigin(env) {
  const raw=String(env.N8N_MONITOR_BASE_URL||'').trim();
  if(!raw)return null;
  try {
    const u=new URL(raw);
    const isN8nCloud=/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.n8n\.cloud$/i.test(u.hostname);
    const isOwnerSumopod=u.hostname==='n8n-s75gjxx8g8lx.jkt6.sumopod.my.id';
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
      u.port||(u.pathname!=='/'&&u.pathname!=='')||
      !(isN8nCloud||isOwnerSumopod))
      return null;
    return u.origin;
  }catch{return null;}
}
function smallExecution(value) {
  if(!value||typeof value!=='object')return null;
  const id=/^[A-Za-z0-9_-]{1,36}$/.test(String(value.id??''))?String(value.id):'tidak diketahui';
  const status=String(value.status||'unknown').toLowerCase();
  const at=Date.parse(value.startedAt||value.stoppedAt||'');
  return {id,status:['success','error','crashed','canceled','running','waiting','unknown'].includes(status)?status:'unknown',
    at:Number.isFinite(at)?at:null};
}
async function n8nFetchJson(fetchImpl,url,key) {
  const r=await fetchImpl(url,{
    method:'GET',headers:{'X-N8N-API-KEY':key,Accept:'application/json'},
    redirect:'error',signal:AbortSignal.timeout(3500),
  });
  if(!r.ok)throw new Error('HTTP '+r.status);
  const body=await r.json();
  if(!body||typeof body!=='object')throw new Error('Respons tidak sesuai format JSON');
  return body;
}
export async function inspectN8nExecutions(env,fetchImpl=fetch) {
  const base=n8nOrigin(env);
  const rawBase=Boolean(String(env.N8N_MONITOR_BASE_URL||'').trim());
  const apiKey=String(env.N8N_MONITOR_API_KEY||'').trim();
  const workflowId=String(env.N8N_MONITOR_WORKFLOW_ID||'').trim();
  if(!rawBase&&!apiKey&&!workflowId)
    return {state:'unconfigured',text:'API n8n belum terhubung; riwayat execution belum diperiksa.'};
  if(!base||!apiKey||!/^[A-Za-z0-9_-]{1,100}$/.test(workflowId))
    return {state:'incomplete',text:'Konfigurasi pembacaan n8n belum lengkap atau origin bukan alamat n8n HTTPS yang diizinkan.'};
  try {
    const root=base+'/api/v1';
    const [wf,ex]=await Promise.all([
      n8nFetchJson(fetchImpl,root+'/workflows/'+encodeURIComponent(workflowId),apiKey),
      n8nFetchJson(fetchImpl,root+'/executions?workflowId='+encodeURIComponent(workflowId)+'&limit=5',apiKey),
    ]);
    const list=Array.isArray(ex.data)?ex.data:[];
    const executions=list.map(smallExecution).filter(Boolean).sort((a,b)=>(b.at||0)-(a.at||0));
    const latest=executions[0]||null;
    const failed=executions.find(x=>x.status==='error'||x.status==='crashed')||null;
    const published=typeof wf.activeVersionId==='string'?true:
      wf.activeVersionId===null?false:
      typeof wf.active==='boolean'?wf.active:null;
    const publishedText=published===true?'aktif menurut API':
      published===false?'tidak aktif menurut API':'status Published tidak tersedia di API';
    const lastText=latest?('Execution '+latest.id+' '+latest.status+
      (latest.at?' ('+localTime(latest.at)+')':'')):'belum ada execution tersimpan yang terlihat';
    const failureText=failed&&latest?.id!==failed.id
      ?'; kegagalan dalam 5 terakhir: '+failed.id:'';
    return {state:'verified',published,latest,failed,
      text:publishedText+'; '+lastText+failureText+
        '. Status berdasarkan metadata execution yang tersedia (bukan isi node).'};
  }catch(error){
    const kind=/^HTTP (401|403)$/.test(error?.message||'')?
      'akses API ditolak':/^HTTP \d{3}$/.test(error?.message||'')?
        'API merespons '+error.message: 'permintaan API gagal atau melewati batas waktu';
    return {state:'unavailable',text:'Pemeriksaan n8n tidak berhasil: '+kind+'. Status workflow belum dapat dipastikan.'};
  }
}

export async function runOfficeReadOnlyDiagnostics(store,env,fetchImpl=fetch) {
  const state=await store.state(); // Successful real DB round trip.
  const automation=typeof store.automation==='function'?await Promise.resolve().then(()=>store.automation()).catch(()=>null):null;
  const [dispatch,n8n]=await Promise.all([
    typeof store.officeDispatchPulse==='function'?store.officeDispatchPulse():null,
    inspectN8nExecutions(env,fetchImpl),
  ]);
  const now=Number(state.now);
  const counts=state.counts||{};
  const blocked=count(counts.blocked),failed=count(counts.failed),paused=count(counts.paused);
  const queued=count(counts.queued);
  const oldQueue=overdueOfficeQueueSummary(state);
  const opsPaused=(state.tasks||[]).filter(t=>t.division==='operations'&&t.status==='paused').length;
  const pulse=workerPulseEvidence(state);
  const validDispatch=typeof dispatch==='number'&&Number.isFinite(dispatch)&&
    dispatch>0&&dispatch<=now;
  const dispatchText=validDispatch
    ?Math.floor((now-dispatch)/60000)+' menit sejak /dispatch terakhir ('+localTime(dispatch)+')'
    :'belum ada pemanggilan /dispatch terverifikasi';
  const priority=blocked||failed
    ?'Tinjau penyebab tugas gagal/terhambat di panel Tugas, tanpa retry otomatis.'
    :opsPaused
      ?'Periksa alasan '+opsPaused+' tugas Bima dijeda di panel Tugas, lalu putuskan apakah layak dilanjutkan.'
      :oldQueue.count
        ?'Tinjau '+oldQueue.count+' antrean lebih dari dua jam di panel Tugas.'
        :'Belum ada kegagalan tugas tercatat; tinjau pekerjaan yang dijeda atau menunggu jika perlu.';
  const n8nPriority=n8n.state==='verified'&&n8n.failed
    ?'n8n mencatat execution gagal '+n8n.failed.id+'; periksa detail node tanpa mengulang otomatis.'
    :n8n.state==='verified'?
      'Cocokkan metadata execution n8n terbaru dengan pesan Telegram; ini belum membuktikan Gemini selalu berhasil.'
      :'Hubungkan akses baca-saja n8n agar Bima dapat memeriksa execution langsung.';
  const text=[
    'Bima · Hasil pemeriksaan langsung ('+localTime(now)+'):',
    'API Anshel dan database: pembacaan saat ini berhasil.',
    'Tugas: '+queued+' antre, '+blocked+' terhambat, '+failed+' gagal, '+paused+
      ' dijeda ('+opsPaused+' di IT); '+oldQueue.count+' antre lebih dari 2 jam.',
    'Worker: '+pulse.lastSeenText+'. '+pulse.verdict,
    'Auto Office: '+dispatchText+'; ini hanya bukti panggilan endpoint.',
    'n8n: '+n8n.text,
    ...(automation?['Automation 24 jam: '+(automation.lastSchedulerAt?
      Math.floor((now-automation.lastSchedulerAt)/60000)+' menit sejak tick terakhir':'belum ada tick terverifikasi')+
      '. Lead Hunter '+(automation.leadSettings.enabled?'aktif':'berhenti')+'; tiket aktif '+
      automation.watches.filter(watch=>watch.status==='active').length+'.',
      gmailFlightHealth(automation),
      ...Object.entries(automation.sources).filter(([,source])=>source.state!=='connected')
        .map(([name,source])=>'Provider '+name+': '+source.state+' · '+(source.error ?? ''))]:[]),
    'Prioritas: 1) '+priority+' 2) '+n8nPriority,
    'Diagnosis baca-saja: tidak menjalankan ulang, membuka tugas dijeda, atau memperbaiki layanan otomatis.',
  ].join('\n');
  return {text,state:{now,queued,blocked,failed,paused,opsPaused,overdue:oldQueue.count,
    workerLastSeenAt:state.workerLastSeenAt,workerPulseMissed:pulse.missedScheduledPulse,
    dispatchAt:validDispatch?dispatch:null},n8n};
}
