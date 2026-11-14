import { Fault } from './store.ts';
import { canDispatch } from './schedule.ts';
import { officeIndonesiaDay } from './office-calendar.ts';

export const automationKey='studio_schedule_v1';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function updateAutomation(current=[],input,now) {
  if (input===undefined) return current;
  const {id,action}=input;
  if (typeof id!=='string' || !uuid.test(id)) throw new Fault(400,'ID jadwal tidak valid.');
  if (action==='add') {
    const {label,kind,when}=input;
    if (current.length>=60 || typeof label!=='string'||!label.trim() || label.length>120 ||
      !['task','report'].includes(kind) || !Number.isSafeInteger(when) || when<now-86400_000 || when>now+366*86400_000)
      throw new Fault(400,'Jadwal tidak valid atau penyimpanan penuh.');
    if (current.some(item=>item.id===id || item.label===label.trim() && item.kind===kind && item.when===when &&
      !['cancelled','failed'].includes(item.status))) throw new Fault(409,'Jadwal sudah ada.');
    return [...current,{id,label:label.trim(),kind,when,status:'disabled',attempts:0,created:now}];
  }
  let found=false;
  const next=current.flatMap(plan=>{
    if (plan.id!==id) return [plan];
    found=true;
    if (action==='remove' && ['cancelled','completed','failed','disabled'].includes(plan.status)) return [];
    if (action==='enable' && plan.status==='disabled') return [{...plan,status:'planned',enabledAt:now,actor:'Dika'}];
    if (action==='cancel' && ['planned','disabled'].includes(plan.status)) return [{...plan,status:'cancelled',ended:now,actor:'Dika'}];
    if (action==='claim' && plan.status==='planned' && plan.when<=now && (plan.retryAt ?? 0)<=now)
      return [{...plan,status:'leased',attempts:plan.attempts+1,lease:now+60_000}];
    if (action==='recover' && plan.status==='leased' && plan.lease<=now)
      return [{...plan,status:plan.attempts<3?'planned':'failed',ended:now,lease:0,result:'Sewa scheduler kedaluwarsa.'}];
    if (action==='notify-claim' && ['completed','failed'].includes(plan.status) && !plan.notification)
      return [{...plan,notification:'uncertain',notificationAt:now}];
    if (action==='notify-confirm' && plan.notification==='uncertain')
      return [{...plan,notification:'sent',notificationAt:now}];
    if (['complete','retry'].includes(action) && plan.status==='leased' && plan.lease===input.lease && now<plan.lease) {
      return [{...plan,status:action==='complete'?'completed':plan.attempts<3?'planned':'failed',
        result:input.result,ended:now,retryAt:now+5*60_000,lease:0}];
    }
    throw new Fault(409,'Perubahan jadwal bertentangan dengan status saat ini.');
  });
  if (!found) throw new Fault(404,'Jadwal tidak ditemukan.');
  return next;
}

export async function runAutomation(store,now=Date.now()) {
  const change=async input=>{try { return await store.studioSchedule(input); } catch (error) { return conflict(error); }};
  const state=await store.state();
  const schedules=await store.studioSchedule();
  for (const plan of schedules.filter(plan=>plan.status==='leased'&&plan.lease<=now))
    await change({id:plan.id,action:'recover'});
  const calendar=officeIndonesiaDay(now,0,state.schedule);
  if (!canDispatch(state.phase) || calendar?.officeScheduledClosed || calendar?.event?.type==='libur nasional')
    return {processed:0,phase:state.phase};
  let processed=0;
  for (const plan of schedules.filter(plan=>plan.status==='planned' && plan.when<=now && (plan.retryAt ?? 0)<=now).slice(0,3)) {
    const claimed=await change({id:plan.id,action:'claim'});
    const lease=claimed?.find(item=>item.id===plan.id)?.lease;
    if (!lease) continue;
    try {
      const result=plan.kind==='task'?
        (await store.create({division:'operations',kind:'diagnostic',description:plan.label,project:'Studio'},
          'Studio Scheduler','studio-schedule:'+plan.id)).id:
        {queued:state.counts.queued ?? 0,running:state.counts.running ?? 0,completed:state.counts.completed ?? 0,
          blocked:state.counts.blocked ?? 0,failed:state.counts.failed ?? 0,worker:state.worker};
      await store.studioSchedule({id:plan.id,action:'complete',lease,result});
      processed++;
    } catch {
      await change({id:plan.id,action:'retry',lease,result:'Eksekusi gagal. Periksa layanan kantor.'});
    }
  }
  return {processed,phase:state.phase};
}

export async function notifyAutomation(store,send,now=Date.now()) {
  let delivered=0;
  const candidates=(await store.studioSchedule()).filter(plan=>['completed','failed'].includes(plan.status) && !plan.notification &&
    (!plan.ended || plan.ended>=now-7*86400_000)).slice(0,3);
  for (const plan of candidates) {
    try { await store.studioSchedule({id:plan.id,action:'notify-claim'}); }
    catch (error) { conflict(error); continue; }
    const report=plan.kind==='report' && plan.status==='completed' && typeof plan.result==='object'?plan.result:null;
    const message=plan.status==='failed'?'Jadwal Studio gagal setelah '+plan.attempts+' percobaan.':
      report?'Laporan Studio · '+report.queued+' antre, '+report.running+' berjalan, '+report.completed+
        ' selesai, '+report.blocked+' terhambat, '+report.failed+' gagal. Worker '+(report.worker?'terhubung.':'offline.'):
        'Jadwal Studio membuat tugas diagnostik dalam antrean. ID '+plan.result+'.';
    try {
      await send(message);
      await store.studioSchedule({id:plan.id,action:'notify-confirm'});
      delivered++;
    } catch { /* An unknown delivery is held for owner review to prevent duplicates. */ }
  }
  return delivered;
}

function conflict(error) {
  if (!(error instanceof Fault) || ![404,409].includes(error.status)) throw error;
  return null;
}

export function ownerAutomation(input) {
  if (!['add','enable','cancel','remove'].includes(input.action)) throw new Fault(400,'Aksi jadwal tidak valid.');
  return input;
}
