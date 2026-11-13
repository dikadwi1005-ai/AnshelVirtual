/** Owner-controlled group workspace, never a trusted record of completed work. */
const clean=s=>String(s||'').replace(/[\u0000-\u001f<>]/g,' ').trim();
export const emptyGroupWorkspace=()=>({
  mode:'normal',quiet:false,notifications:'all',notes:[],meeting:null,minutes:[],events:[],reminders:[],
});
export function parseGroupWorkspaceCommand(text) {
  if(typeof text!=='string'||text.length>1500)return null;
  const q=text.trim();
  const m=/^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(q);
  if(!m)return null;
  const command=m[1].toLowerCase(),body=(m[2]||'').trim();
  if(['pengaturan','memori','acara','rapat','pengingat'].includes(command)&&!body)return {type:'view',section:command};
  if(command==='hening'&&/^(on|off)$/i.test(body))return {type:'quiet',enabled:body.toLowerCase()==='on'};
  if(command==='mode'&&/^(normal|diskusi)$/i.test(body))return {type:'mode',mode:body.toLowerCase()};
  if(command==='notifikasi'&&/^(semua|penting)$/i.test(body))
    return {type:'notifications',mode:body.toLowerCase()==='penting'?'important':'all'};
  if(command==='ingat') {
    const pair=/^(.{2,45})\s*\|\s*(.{3,220})$/.exec(body);
    if(pair)return {type:'remember',key:clean(pair[1]),value:clean(pair[2])};
  }
  if(command==='lupakan'&&body.length>=2&&body.length<=45)return {type:'forget',key:clean(body)};
  if(command==='rapat'){
    const r=/^(mulai|catat|putuskan|selesai|status)(?:\s+([\s\S]*))?$/i.exec(body);
    if(r){
      const mode=r[1].toLowerCase(),value=clean(r[2]).slice(0,300);
      if(['mulai','catat','putuskan'].includes(mode)&&value.length>=5)
        return {type:'meeting-'+mode,value};
      if(['selesai','status'].includes(mode)&&!value)return {type:'meeting-'+mode};
    }
  }
  if(command==='acara'){
    const r=/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.{3,100})$/.exec(body);
    if(r)return {type:'event',date:r[1],label:clean(r[2])};
  }
  if(command==='ingatkan'){
    const r=/^(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)\s*\|\s*(.{3,180})$/.exec(body);
    if(r)return {type:'reminder',date:r[1],time:r[2]+':'+r[3],text:clean(r[4])};
  }
  return null;
}
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const fail=message=>{const e=new Error(message);e.status=400;throw e;};
const fmt=record=>[record.topic,...record.decisions.map(x=>'Keputusan: '+x),
  ...record.notes.map(x=>'Catatan: '+x)].join('\n').slice(0,1800);
export function applyGroupWorkspaceCommand(previous,command,now) {
  const state={...emptyGroupWorkspace(),...(previous&&typeof previous==='object'?previous:{})};
  const stamp=Number(now);
  if(!Number.isFinite(stamp))fail('Jam sistem tidak valid.');
  state.notes=Array.isArray(state.notes)?state.notes.slice(-20):[];
  state.minutes=Array.isArray(state.minutes)?state.minutes.slice(-8):[];
  state.events=Array.isArray(state.events)?state.events.slice(-24):[];
  state.reminders=Array.isArray(state.reminders)?state.reminders.slice(-30):[];
  let answer='';
  switch(command.type) {
    case 'view':{
      if(command.section==='pengaturan')answer='Mode grup: '+state.mode+'. Notifikasi hening: '+(state.quiet?'aktif':'nonaktif')+'. Tingkat notifikasi: '+state.notifications+'. Rapat: '+(state.meeting?.topic||'tidak ada')+'.';
      if(command.section==='memori')answer=state.notes.length?'Catatan yang disimpan pemilik:\n'+state.notes.map(n=>n.key+': '+n.value).join('\n'):'Belum ada catatan jangka panjang.';
      if(command.section==='acara')answer=state.events.length?'Acara internal tercatat:\n'+state.events.map(e=>e.date+' · '+e.label).join('\n'):'Belum ada acara internal yang terdaftar.';
      if(command.section==='rapat')answer=state.meeting?'Rapat aktif: '+state.meeting.topic+'. Keputusan '+state.meeting.decisions.length+', catatan '+state.meeting.notes.length+'.':'Belum ada rapat aktif.';
      if(command.section==='pengingat')answer=state.reminders.length?'Pengingat:\n'+state.reminders.slice(-8).map(r=>r.date+' '+r.time+' WIB · '+r.text+' ('+(r.sent?'terkirim':r.uncertain?'periksa pengiriman di Telegram':'menunggu')+')').join('\n'):'Belum ada pengingat tersimpan.';
      break;
    }
    case 'quiet':state.quiet=command.enabled;answer='Mode hening '+(state.quiet?'aktif: pesan tetap ada tanpa notifikasi suara.':'nonaktif: notifikasi normal.') ;break;
    case 'mode':state.mode=command.mode;answer='Mode grup sekarang '+state.mode+'. Aku tidak akan membuat bot saling membalas tanpa perintah pemilik.';break;
    case 'notifications':state.notifications=command.mode;answer='Notifikasi '+(state.notifications==='important'?'penting saja':'semua pemberitahuan')+'. Status tugas tetap tercatat di dashboard.';break;
    case 'remember':{
      if(/password|token|api.?key|secret|credential|kata sandi|sandi/i.test(command.key+' '+command.value))
        fail('Jangan menyimpan kredensial atau kata sandi dalam memori grup.');
      state.notes=state.notes.filter(n=>n.key.toLowerCase()!==command.key.toLowerCase());
      state.notes.push({key:command.key,value:command.value,at:stamp});
      state.notes=state.notes.slice(-20);
      answer='Catatan "'+command.key+'" tersimpan di memori grup. Ini preferensi/konteks, bukan bukti pekerjaan sudah selesai.';
      break;
    }
    case 'forget':{
      const before=state.notes.length;
      state.notes=state.notes.filter(n=>n.key.toLowerCase()!==command.key.toLowerCase());
      answer=before!==state.notes.length?'Catatan "'+command.key+'" dihapus dari memori grup.':'Catatan dengan nama itu tidak ditemukan.';
      break;
    }
    case 'meeting-mulai':{
      if(state.meeting)fail('Masih ada rapat aktif. Selesaikan dulu dengan /rapat selesai.');
      state.meeting={topic:command.value,startedAt:stamp,notes:[],decisions:[]};
      answer='Rapat dimulai: '+command.value+'. Pakai /rapat catat ... atau /rapat putuskan ..., lalu /rapat selesai untuk menyimpan notulen.';
      break;
    }
    case 'meeting-link':{
      if(!state.meeting)fail('Rapat sudah tidak aktif.');
      const who={management:'Alya',operations:'Bima',administration:'Citra',hr:'Dara'}[command.division];
      if(!who||!/^[a-f0-9-]{36}$/i.test(String(command.taskId||'')))
        fail('Tindak lanjut rapat tidak valid.');
      state.meeting={...state.meeting,notes:[
        ...state.meeting.notes,'Tindak lanjut '+who+' dibuat sebagai tugas '+command.taskId+
        ' (masih antre, bukan hasil final).'].slice(-12)};
      answer='Tindak lanjut tugas '+command.taskId+' telah ditautkan ke catatan rapat.';
      break;
    }
    case 'meeting-catat':{
      if(!state.meeting)fail('Belum ada rapat aktif. Mulai dengan /rapat mulai topik.');
      if(state.meeting.notes.length>=12)fail('Catatan rapat mencapai batas 12 poin.');
      state.meeting={...state.meeting,notes:[...state.meeting.notes,command.value]};
      answer='Catatan rapat tersimpan. Ini adalah catatan pemilik, bukan hasil kerja yang sudah diverifikasi.';
      break;
    }
    case 'meeting-putuskan':{
      if(!state.meeting)fail('Belum ada rapat aktif. Mulai dengan /rapat mulai topik.');
      if(state.meeting.decisions.length>=8)fail('Keputusan rapat mencapai batas 8 poin.');
      state.meeting={...state.meeting,decisions:[...state.meeting.decisions,command.value]};
      answer='Keputusan tercatat. Belum otomatis menjadi tugas; buat tugas eksplisit dengan /tugas Nama | instruksi.';
      break;
    }
    case 'meeting-status':answer=state.meeting?fmt(state.meeting):'Tidak ada rapat aktif.';break;
    case 'meeting-selesai':{
      if(!state.meeting)fail('Tidak ada rapat aktif.');
      const record={...state.meeting,endedAt:stamp};
      state.minutes=[...state.minutes,record].slice(-8);
      state.meeting=null;
      answer='Rapat selesai, notulen disimpan:\n'+fmt(record);
      break;
    }
    case 'event':{
      if(!validDate(command.date))fail('Tanggal acara tidak valid.');
      state.events=[...state.events.filter(e=>e.date!==command.date||e.label!==command.label),
        {date:command.date,label:command.label}].sort((a,b)=>a.date.localeCompare(b.date)).slice(-24);
      answer='Acara internal "'+command.label+'" tanggal '+command.date+' tersimpan. Tidak otomatis membuat kantor tutup.';
      break;
    }
    case 'reminder':{
      if(!validDate(command.date))fail('Tanggal pengingat tidak valid.');
      const due=Date.parse(command.date+'T'+command.time+':00+07:00');
      if(!Number.isFinite(due)||due<stamp+60_000||due>stamp+366*86400_000)
        fail('Pengingat harus untuk waktu mendatang, paling jauh satu tahun.');
      if(state.reminders.filter(x=>!x.sent).length>=20)fail('Batas pengingat aktif tercapai.');
      const id=String(stamp)+'-'+String(state.reminders.length);
      state.reminders.push({id,date:command.date,time:command.time,text:command.text,due,sent:false});
      answer='Pengingat "'+command.text+'" dijadwalkan '+command.date+' '+command.time+
        ' WIB. Akan diperiksa pada pemicu Auto Office berikutnya (tidak selalu tepat menitnya).';
      break;
    }
    default:fail('Perintah grup tidak dikenali.');
  }
  return {workspace:state,text:answer.slice(0,3500)};
}
export function workspacePromptContext(state,now) {
  const source={...emptyGroupWorkspace(),...(state||{})};
  const notes=Array.isArray(source.notes)?source.notes.slice(-10).map(n=>({name:n.key,value:n.value})): [];
  const current=source.meeting?{topic:source.meeting.topic,
    decisions:source.meeting.decisions.slice(-5),notes:source.meeting.notes.slice(-6)}:null;
  const last=Array.isArray(source.minutes)?source.minutes.slice(-2).map(m=>({
    topic:m.topic,decisions:m.decisions.slice(-4)})):[];
  const events=Array.isArray(source.events)?source.events.filter(e=>
    e.date>=new Date(Number(now)+7*3600_000).toISOString().slice(0,10)).slice(0,5):[];
  return {mode:source.mode,notes,meeting:current,previousMeetings:last,upcomingInternalEvents:events,
    disclaimer:'Catatan dan keputusan adalah konteks yang dinyatakan pemilik, BUKAN bukti pelaksanaan pekerjaan.'};
}
