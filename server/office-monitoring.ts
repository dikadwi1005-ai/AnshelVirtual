import { activities,divisions } from '../public/catalog.js';
import { scheduledDraftDay } from './schedule.ts';

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

export function officeEmployeeOverview(state,configured=pilotDivisions) {
  const enabled=new Set(configured);
  return pilotDivisions.filter(id=>enabled.has(id)).map(id=>{
    const person=state.people?.[id]||{};
    const jobs=(state.tasks||[]).filter(t=>t.division===id);
    const task=jobs.find(t=>t.status==='running')||jobs.find(t=>t.status==='queued')||jobs[0];
    return {id,name:labels[id],avatar:activities[person.activity]||'Belum tercatat',
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
    '; avatar virtual '+p.avatar.toLowerCase()+
    (p.task?' ('+p.project+', '+(status[p.task.status]||'status belum diketahui')+')':''));
  return 'Aktivitas empat pegawai Anshel (berdasarkan catatan kantor, bukan pengamatan nyata):\n'+
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

export function officeDailySummary(state) {
  const day=scheduledDraftDay(new Date(state.now));
  const audit=(state.audit||[]).filter(item=>Number.isFinite(Number(item.at)) &&
    scheduledDraftDay(new Date(Number(item.at)))===day);
  const count=action=>new Set(audit.filter(a=>a.action===action).map(a=>a.task||a.id)).size;
  const recent=(state.tasks||[]).filter(t=>pilotDivisions.includes(t.division) &&
    t.status==='completed' && Number(t.ended)>0 &&
    scheduledDraftDay(new Date(t.ended))===day).slice(0,3);
  const detail=recent.map(t=>labels[t.division]+' ('+safeProject(t.project)+')').join('; ');
  const c=state.counts||{};
  return 'Alya · Ringkasan kantor '+day+' WIB (hingga laporan dibuat):\n'+
    'Aktivitas audit hari ini: '+count('completed')+' penyelesaian tugas, '+
    count('blocked')+' terhambat, '+count('failed')+' gagal.\n'+
    'Status seluruh antrean saat ini: '+(Number(c.queued)||0)+' antre, '+
    (Number(c.running)||0)+' diproses, '+(Number(c.awaiting_approval)||0)+' menunggu persetujuan.\n'+
    (detail?'Contoh hasil draf hari ini: '+detail+'.\n':'Belum ada hasil draf baru dari empat bot aktif yang terlihat di daftar terbaru.\n')+
    'Ini ringkasan catatan sistem, bukan bukti hasil sudah ditinjau atau dipublikasikan.';
}

export function officeQueueDelayAlert(state) {
  const now=Number(state.now);
  if(!Number.isFinite(now)||state.worker||!['work','review','open'].includes(state.phase))return null;
  const stale=(state.tasks||[]).filter(t=>pilotDivisions.includes(t.division) &&
    t.status==='queued' && Number.isFinite(Number(t.created))&&
    now-Number(t.created)>=2*60*60_000 && now-Number(t.created)<=48*60*60_000);
  if(!stale.length)return null;
  const names=[...new Set(stale.map(t=>labels[t.division]))];
  return 'Bima · Peringatan antrean: '+stale.length+' tugas pada '+names.join(', ')+
    ' telah menunggu sedikitnya dua jam. Worker belum terlihat aktif dalam 40 detik terakhir. '+
    'Ini indikasi antrean perlu dicek, BUKAN bukti layanan mati. Periksa dashboard Anshel atau /kendala.';
}
