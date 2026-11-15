import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isOfficeDiagnosticQuery,inspectN8nExecutions,runOfficeReadOnlyDiagnostics} from '../server/office-diagnostics.ts';
import {prepareOfficeNaturalChat} from '../server/telegram-natural.ts';

const now=Date.parse('2026-11-15T09:18:00Z'); // Sunday 16:18 WIB.
const state={
  now,worker:false,workerLastSeenAt:Date.parse('2026-11-13T09:40:00Z'),phase:'work',
  counts:{paused:2,queued:0,running:0,blocked:0,failed:0},
  tasks:[{division:'operations',status:'paused',description:'private IT task'},
    {division:'research',status:'paused',description:'private research task'}],
};
const tokens={management:'222999:'+('a'.repeat(35)),operations:'222998:'+('b'.repeat(35))};
const env={TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens)};
const events=[];
const fakeTelegram=async(url,options)=>{
  events.push({url,data:JSON.parse(options.body)});
  return new Response(JSON.stringify({ok:true,result:{message_id:100+events.length}}),{status:200});
};
const message=(updateId,text,userId=env.TELEGRAM_USER_ID)=>({
  chatId:env.TELEGRAM_CHAT_ID,userId,isBot:false,text,updateId:String(updateId),
});

test('diagnosis request recognizer is scoped to Bima operational questions only',()=>{
  assert.equal(isOfficeDiagnosticQuery('Bima, jelaskan kondisi operasional Anshel hari ini dan apa yang perlu diperiksa berikutnya.'),true);
  assert.equal(isOfficeDiagnosticQuery('Bima, cek status server dan workflow n8n sekarang'),true);
  assert.equal(isOfficeDiagnosticQuery('Bima, buatkan ide konten tentang API'),false);
  assert.equal(isOfficeDiagnosticQuery('Citra, cek tugas IT hari ini'),false);
  assert.equal(isOfficeDiagnosticQuery('Alya dan Bima, diskusikan status pemeriksaan API terbaru'),false);
  assert.equal(isOfficeDiagnosticQuery('Bima dan Citra, bahas status IT'),false);
});

test('Bima actually reads database and last dispatcher pulse and never pretends n8n is connected',async()=>{
  let reads=0,pulses=0;
  const store={state:async()=>{reads++;return state;},
    officeDispatchPulse:async()=>{pulses++;return now-57*60_000;}};
  const result=await runOfficeReadOnlyDiagnostics(store,env,async()=>{throw new Error('network must not be touched');});
  assert.equal(reads,1);
  assert.equal(pulses,1);
  assert.equal(result.n8n.state,'unconfigured');
  assert.match(result.text,/API Anshel dan database: pembacaan saat ini berhasil/);
  assert.match(result.text,/2 dijeda \(1 di IT\)/);
  assert.match(result.text,/57 menit sejak \/dispatch/);
  assert.match(result.text,/13 November 2026/);
  assert.match(result.text,/API n8n belum terhubung/);
  assert.match(result.text,/Diagnosis baca-saja/);
  assert.doesNotMatch(result.text,/private IT|private research|n8n sehat|sudah berhasil cek semua/i);
});

test('n8n public API read-only metadata is verifiable without reading credentials or node payloads',async()=>{
  const requests=[];
  const cfg={...env,N8N_MONITOR_BASE_URL:'https://anshel.app.n8n.cloud',
    N8N_MONITOR_API_KEY:'test-secret-do-not-display',N8N_MONITOR_WORKFLOW_ID:'abc-123'};
  const transport=async(url,options)=>{
    requests.push({url,method:options.method,redirect:options.redirect,headers:options.headers});
    if(url.endsWith('/workflows/abc-123'))
      return new Response(JSON.stringify({id:'abc-123',active:true,activeVersionId:'ver-8'}),{status:200});
    if(url.includes('/executions?'))
      return new Response(JSON.stringify({data:[
        {id:'8795',status:'error',startedAt:'2026-11-15T08:30:37Z'},
        {id:'8794',status:'success',startedAt:'2026-11-15T07:59:00Z'},
      ]}),{status:200});
    throw new Error('Unexpected endpoint');
  };
  const result=await inspectN8nExecutions(cfg,transport);
  assert.equal(result.state,'verified');
  assert.equal(result.published,true);
  assert.equal(result.latest.id,'8795');
  assert.equal(result.failed.id,'8795');
  assert.match(result.text,/execution 8795 error/i);
  assert.equal(requests.length,2);
  assert.ok(requests.every(r=>r.method==='GET'&&r.redirect==='error'));
  assert.ok(requests.every(r=>r.headers['X-N8N-API-KEY']==='test-secret-do-not-display'));
  assert.doesNotMatch(result.text,/test-secret-do-not-display/);
});

test('n8n connection failure is unknown, not a fabricated zero-error status',async()=>{
  const cfg={...env,N8N_MONITOR_BASE_URL:'https://anshel.app.n8n.cloud',
    N8N_MONITOR_API_KEY:'dummy',N8N_MONITOR_WORKFLOW_ID:'abc-123'};
  const bad=await inspectN8nExecutions(cfg,async()=>new Response('{}',{status:401}));
  assert.equal(bad.state,'unavailable');
  assert.match(bad.text,/akses API ditolak/);
  const unsafe=await inspectN8nExecutions({...cfg,N8N_MONITOR_BASE_URL:'http://127.0.0.1:3000'},async()=>{
    throw new Error('Should not reach private host');
  });
  assert.equal(unsafe.state,'incomplete');
  assert.doesNotMatch(unsafe.text,/dummy/);
});

test('natural Bima diagnostics and /diagnosa execute live read-only path, one Telegram message per update',async()=>{
  const seen=new Set(),readCalls=[];
  const store={
    reserveOfficeGroupUpdate:async id=>{if(seen.has(id))return false;seen.add(id);return true;},
    state:async()=>{readCalls.push('db');return state;},
    officeDispatchPulse:async()=>now-5*60_000,
  };
  events.length=0;
  const q='Bima, jelaskan kondisi operasional Anshel hari ini dan apa yang perlu diperiksa berikutnya.';
  const reply=await prepareOfficeNaturalChat(store,env,message(5001,q),fakeTelegram);
  assert.equal(reply.mode,'handled');
  assert.equal(reply.kind,'read-only-diagnosis');
  assert.equal(reply.division,'operations');
  assert.equal(reply.n8n,'unconfigured');
  assert.equal(events.length,1);
  assert.ok(events[0].url.includes(tokens.operations));
  assert.match(events[0].data.text,/Hasil pemeriksaan langsung/);
  assert.equal(readCalls.length,1);
  assert.deepEqual(await prepareOfficeNaturalChat(store,env,message(5001,q),fakeTelegram),
    {mode:'handled',duplicate:true});
  assert.equal(events.length,1);
  const direct=await prepareOfficeNaturalChat(store,env,message(5002,'/diagnosa'),fakeTelegram);
  assert.equal(direct.kind,'read-only-diagnosis');
  assert.equal(events.length,2);
  assert.equal(readCalls.length,2);
  await assert.rejects(prepareOfficeNaturalChat(store,env,message(5003,'/diagnosa','untrusted'),fakeTelegram),
    e=>e.status===403);
  assert.equal(events.length,2);
});
