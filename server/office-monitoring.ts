import { activities,divisions } from '../public/catalog.js';
import { scheduledDraftDay } from './schedule.ts';
import { observedAvatar } from './office-avatar-status.ts';

export const pilotDivisions=['management','operations','administration','hr'];
const labels=Object.fromEntries(divisions.map(x=>[x.id,x.employee]));
const status={queued:'antre',running:'dikerjakan',completed:'hasil draf tercatat',
  awaiting_approval:'menunggu persetujuan',blocked:'terhambat',failed:'gagal',
  paused:'dijeda',cancelled:'dibatalkan'};
const localParts=time=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23',
}).formatToParts(new Date(time)).map(item=>[item.type,item.value]));
const minutes=value=>{const [h,m]=String(value||'').split(':').map(Number);return h*60+m;};
const safeProject=s=>String(s||'tanpa nama proyek').replace(/[\r\n\t@<>]/g,' ').trim().slice(0,45);

/**
 * A recent claim/heartbeat is evidence that the draft worker contacted the API,
 * not evidence of successful Gemini execution or a healthy deployment.
 * n8n's repository schedule is Mon-Fri, every 20 minutes 09.00-16.40 WIB.
 * The Published schedule may differ and is deliberately not asserted as verified.
 */
export function workerPulseEvidence(state) {
  const now=Number(state.now);
  const validNow=Number.isFinite(now)&&now>0;
  const parts=validNow?localParts(now):null;
  const weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const day=parts?weekdays[parts.weekday]:null;
  const moment=parts?Number(parts.hour)*60+Number(parts.minute):NaN;
  const scheduledDay=day!==null&&day>=1&&day<=5;
  const inSchedule=scheduledDay&&moment>=9*60&&moment<=16*60+40;
  // Allow an initial 45-minute window after 09.00 for the 20-minute scheduler.
  const shouldHavePulse=scheduledDay&&moment>=9*60+45&&moment<=16*60+40;
  const observed=Number(state.workerLastSeenAt);
  const validSeen=Number.isFinite(observed)&&observed>0&&validNow&&observed<=now;
  const lastSeenText='Heartbeat worker terakhir: '+(validSeen
    ?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',year:'numeric',
      month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
      .format(new Date(observed))+' WIB'
    :'belum ada waktu yang terverifikasi');
  const missedScheduledPulse=shouldHavePulse&&state.worker!==true&&
    (!validSeen||now-observed>45*60_000);
  const verdict=!validNow?'Waktu pemeriksaan tidak tersedia.':
    missedScheduledPulse?'Perlu diperiksa: tidak ada heartbeat sesuai interval terjadwal (>45 menit) saat jam worker.':
    inSchedule?'Sedang dalam jam worker terjadwal; jeda heartbeat 40 detik saja bukan bukti gangguan.':
    'Sekarang di luar jadwal worker draf di repo; heartbeat yang tidak baru bukan bukti gangguan.';
  return {missedScheduledPulse,inSchedule,lastSeenText,verdict,
    scheduleText:'Acuan jadwal worker draf di repo: Senin-Jumat, 09.00-16.40 WIB tiap 20 menit (status n8n Published belum diverifikasi).'};
}

export function officeEmployeeOverview(state,configured=pilotDivisions) {
  const enabled=new Set(configured);
  return [...pilotDivisions,'marketing','research','social'].filter(id=>enabled.has(id)).map(id=>{
    const person=state.people?.[id]||{};
    const jobs=(state.tasks||[]).filter(t=>t.division===id);
    const task=jobs.find(t=>t.status==='running')||jobs.find(t=>t.status==='queued')||jobs[0];
    const avatar=observedAvatar(state,id);
    return {id,name:labels[id],avatar:avatar?.activity??'Belum terverifikasi',
      lokasi:avatar?.location??null,
      executing:person.executing===true||jobs.some(t=>t.status==='running'),
      task:task?{status:task.status,project:safeProject(task.project),
        hasResult:task.status==='completed'&&!!task.sha256}:null};
  });
}

export function officeActivityReply(state,configured=pilotDivisions) {
  const employees=officeEmployeeOverview(state,configured);
  if(!employees.length)return 'Belum ada bot aktif untuk laporan aktivitas.';
  const lines=employees.map(p=>p.name+': '+(p.executing?'sedang memproses tugas':
    p.task?.status==='queued'?'ada tugas menunggu di antrean':
    'tidak sedang mengeksekusi tugas')+
    '; avatar virtual '+(p.lokasi?p.lokasi.toLowerCase()+' ('+p.avatar.toLowerCase()+')':'belum ada update lokasi terbaru')+
    (p.task?' ('+p.task.project+', '+(status[p.task.status]||'status belum diketahui')+')':''));
  return (employees.length===4?'Aktivitas empat pegawai Anshel':'Aktivitas pegawai Telegram aktif Anshel')+
    ' (berdasarkan catatan kantor, bukan pengamatan nyata):\n'+
    lines.join('\n')+'\nWorker: '+(state.worker?'terlihat aktif baru-baru ini':'belum terlihat aktif dalam 40 detik terakhir')+
    '. Hasil tugas tersedia di panel Tugas setelah benar-benar tersimpan.';
}

export function officeSummaryDue(state) {
  const now=Number(state.now);
  if(!Number.isFinite(now)||!state.schedule||!Array.isArray(state.schedule.days)||
    !Array.isArray(state.schedule.holidays))return false;
  const p=localParts(now);
  const weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const day=weekdays[p.weekday];
  const date=[p.year,p.month,p.day].join('-');
  if(!state.schedule.days.includes(day)||state.schedule.holidays.includes(date))return false;
  const moment=Number(p.hour)*60+Number(p.minute);
  const close=minutes(state.schedule.close);
  // Dispatch cron includes 17:00 WIB. Start at configured close,
  // and allow late polls for at most two hours.
  return Number.isFinite(close)&&moment>=close&&moment<=Math.min(close+120,23*60+59);
}

export function officeDailySummary(state,allowed=pilotDivisions) {
  const day=scheduledDraftDay(new Date(state.now));
  const audit=(state.audit||[]).filter(item=>Number.isFinite(Number(item.at)) &&
    scheduledDraftDay(new Date(Number(item.at)))===day);
  const count=action=>new Set(audit.filter(a=>a.action===action).map(a=>a.task||a.id)).size;
  const recent=(state.tasks||[]).filter(t=>allowed.includes(t.division) &&
    t.status==='completed' && Number(t.ended)>0 &&
    scheduledDraftDay(new Date(t.ended))===day).slice(0,3);
  const detail=recent.map(t=>labels[t.division]+' ('+safeProject(t.project)+')').join('; ');
  const c=state.counts||{};
  return 'Alya · Ringkasan kantor '+day+' WIB (hingga laporan dibuat):\n'+
    'Aktivitas audit hari ini: '+count('completed')+' penyelesaian tugas, '+
    count('blocked')+' terhambat, '+count('failed')+' gagal.\n'+
    'Status seluruh antrean saat ini: '+(Number(c.queued)||0)+' antre, '+
    (Number(c.running)||0)+' diproses, '+(Number(c.awaiting_approval)||0)+' menunggu persetujuan.\n'+
    (detail?'Contoh hasil draf hari ini: '+detail+'.\n':'Belum ada hasil draf baru dari bot Telegram aktif yang terlihat di daftar terbaru.\n')+
    'Ini ringkasan catatan sistem, bukan bukti hasil sudah ditinjau atau dipublikasikan.';
}

export function overdueOfficeQueue(state,allowed=divisions.map(person=>person.id)) {
  const now=Number(state.now);
  if(!Number.isFinite(now))return [];
  return (state.tasks||[]).filter(task=>allowed.includes(task.division) &&
    task.status==='queued' && Number.isFinite(Number(task.created)) &&
    Number(task.created)>0 && now-Number(task.created)>=2*60*60_000);
}

export function overdueOfficeQueueSummary(state,allowed=divisions.map(person=>person.id)) {
  if(state.overdueQueueByDivision && typeof state.overdueQueueByDivision==='object' &&
    !Array.isArray(state.overdueQueueByDivision)) {
    const entries=Object.entries(state.overdueQueueByDivision).filter(([id,count])=>
      allowed.includes(id) && Number.isSafeInteger(Number(count)) && Number(count)>0);
    return {count:entries.reduce((total,[,count])=>total+Number(count),0),
      divisions:entries.map(([id])=>id)};
  }
  const stale=overdueOfficeQueue(state,allowed);
  return {count:stale.length,divisions:[...new Set(stale.map(task=>task.division))]};
}

export function officeQueueDelayAlert(state,allowed=pilotDivisions) {
  const now=Number(state.now);
  if(!Number.isFinite(now)||!['work','review','open'].includes(state.phase))return null;
  const stale=overdueOfficeQueueSummary(state,allowed);
  if(!stale.count||!workerPulseEvidence(state).missedScheduledPulse)return null;
  const names=stale.divisions.map(id=>labels[id]||id);
  return 'Bima · Peringatan antrean: '+stale.count+' tugas pada '+names.join(', ')+
    ' telah menunggu sedikitnya dua jam. Heartbeat worker terjadwal tidak terlihat dalam lebih dari 45 menit. '+
    'Ini indikasi antrean dan worker perlu dicek di n8n Executions, BUKAN bukti layanan mati. Periksa dashboard Anshel atau /kendala.';
}
