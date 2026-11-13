import { divisions, activities } from '../public/catalog.js';
import { Fault } from './store.ts';
import { officeIndonesiaCalendarContext } from './office-calendar.ts';
import { officeActivityReply,officeDailySummary,officeSummaryDue,officeQueueDelayAlert } from './office-monitoring.ts';
import { parseGroupWorkspaceCommand } from './telegram-workspace.ts';

const statusLabels={completed:'Selesai',blocked:'Terhambat',failed:'Gagal'};
// Pilot automation uses the four connected bots only. More workers remain opt-in.
export const automaticOfficeDivisions=['management','operations','administration','hr'];
const activeAuto=new Set(automaticOfficeDivisions);
const reactions={
  management:{division:'administration',text:'Siap, Alya. Hasil drafnya sudah tercatat. Kalau perlu dirapikan nanti, kita cek setelah ditinjau.'},
  operations:{division:'management',text:'Oke, Bima. Makasih updatenya. Drafnya kita tinjau dulu sebelum digunakan, ya.'},
  administration:{division:'hr',text:'Makasih, Citra. Catatan drafnya sudah ada; kalau ada kebutuhan koordinasi tim nanti dibahas.'},
  hr:{division:'management',text:'Sip, Dara. Drafnya sudah tersedia. Kita lihat hasilnya dulu sebelum ada keputusan.'},
};
const workerReport={
  management:{
    completed:['Update manajemen: draf {subject} sudah dibuat. Hasilnya tinggal kita tinjau.',
      'Ada kabar kerjaan: hasil draf {subject} sudah tersedia di Anshel untuk direview.'],
    blocked:['Draf {subject} masih terhambat. Belum ada hasil final yang bisa dipastikan.',
      'Ada hambatan untuk draf {subject}. Kita perlu cek penyebabnya sebelum lanjut.'],
    failed:['Draf {subject} gagal diproses. Aku belum menganggapnya selesai.'],
  },
  operations:{
    completed:['Draf teknis {subject} sudah dibuat. Ini belum berarti sistemnya sudah lolos pemeriksaan, ya.',
      'Hasil draf {subject} sudah masuk Anshel. Nanti kalau mau dipakai, tetap perlu ditinjau.'],
    blocked:['Draf {subject} tertahan. Belum ada hasil pemeriksaan atau perbaikan yang bisa kupastikan.'],
    failed:['Pemrosesan draf {subject} gagal. Kita perlu cek kendalanya, belum ada hasil final.'],
  },
  administration:{
    completed:['Draf administrasi {subject} sudah tersedia. Tinggal dicek isinya dulu sebelum dipakai.',
      'Catatan untuk {subject} sudah selesai dibuat dalam bentuk draf. Belum dianggap final, ya.'],
    blocked:['Draf administrasi {subject} masih terhambat. Jadi belum ada berkas final yang bisa digunakan.'],
    failed:['Draf administrasi {subject} gagal diproses. Belum ada hasil siap pakai.'],
  },
  hr:{
    completed:['Draf SDM {subject} sudah dibuat. Kita bisa meninjau isinya sebelum mengambil keputusan.',
      'Hasil draf terkait {subject} sudah ada. Masih perlu ditinjau sebelum dipakai untuk tim.'],
    blocked:['Draf SDM {subject} sedang terhambat. Aku belum punya hasil final yang bisa dipastikan.'],
    failed:['Draf SDM {subject} gagal dibuat. Belum ada hasil final untuk dibahas bersama.'],
  },
};
const clean=value=>String(value||'').replace(/[\r\n\t@]/g,' ').replace(/[<>]/g,'').trim().slice(0,75);
const divisionByName=new Map();
for(const d of divisions) {
  for(const name of [d.id,d.name.toLowerCase(),d.employee.toLowerCase()]) divisionByName.set(name.toLowerCase(),d.id);
}
const common={it:'operations',dev:'development',developer:'development',seo:'marketing',marketing:'marketing',
  keuangan:'finance',finance:'finance',riset:'research',desain:'creative',kreatif:'creative',
  sdm:'hr',admin:'administration',medsos:'social',sosmed:'social',
  video:'video',manajemen:'management',qa:'qa',operasional:'operations'};
for(const [name,id] of Object.entries(common)) divisionByName.set(name,id);

function mapJson(value,mandatory) {
  if (!value && !mandatory) return {};
  let parsed;
  try {parsed=JSON.parse(value);} catch {throw new Fault(503,'Konfigurasi bot kantor belum berupa JSON valid.');}
  if (!parsed || Array.isArray(parsed) || typeof parsed!=='object') {
    throw new Fault(503,'Konfigurasi bot kantor tidak valid.');
  }
  return parsed;
}
export function officeGroupConfig(env) {
  const chatId=String(env.TELEGRAM_CHAT_ID||'');
  if (!/^-[0-9]{5,20}$/.test(chatId)) throw new Fault(503,'TELEGRAM_CHAT_ID harus ID grup Telegram negatif.');
  const userId=String(env.TELEGRAM_USER_ID||'');
  if (!/^[0-9]{1,20}$/.test(userId)) throw new Fault(503,'TELEGRAM_USER_ID pemilik harus diisi.');
  return {chatId,userId};
}
export function configuredOfficeBots(env) {
  const parsed=mapJson(env.TELEGRAM_BOT_TOKENS_JSON,true);
  const configured=divisions.filter(item=>typeof parsed[item.id]==='string'
    && /^[0-9]{5,15}:[A-Za-z0-9_-]{20,}$/.test(parsed[item.id])).map(item=>item.id);
  return {parsed,configured,missing:divisions.filter(item=>!configured.includes(item.id)).map(item=>item.id)};
}
/** Optional Telegram typing hint, never a second message and never a proof of work. */
export async function sendOfficeBotTyping(env,division,fetchImpl=fetch) {
  const token=configuredOfficeBots(env).parsed[division];
  if(!token)return false;
  try{
    const response=await fetchImpl('https://api.telegram.org/bot'+token+'/sendChatAction',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,action:'typing'}),
      signal:AbortSignal.timeout(900),
    });
    return response.ok;
  }catch{return false;}
}

export async function sendOfficeBotMessage(env,division,text,options={}) {
  officeGroupConfig(env);
  if (!divisions.some(item=>item.id===division)) throw new Fault(400,'Divisi pegawai AI tidak valid.');
  const config=configuredOfficeBots(env);
  if (!config.configured.includes(division)) throw new Fault(503,'Token bot divisi '+division+' belum dikonfigurasi.');
  if (typeof text!=='string'||!text.trim()||text.length>3800) throw new Fault(400,'Pesan bot tidak valid.');
  const token=config.parsed[division];
  const payload={chat_id:env.TELEGRAM_CHAT_ID,text,disable_notification:options.silent===true};
  if (Number.isSafeInteger(options.replyTo)&&options.replyTo>0) {
    payload.reply_parameters={message_id:options.replyTo,allow_sending_without_reply:true};
  }
  let res;
  try {
    res=await (options.fetchImpl ?? fetch)('https://api.telegram.org/bot'+token+'/sendMessage',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
      signal:AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error('Telegram HTTP request failed');
    const data=await res.json();
    if (data?.ok!==true || !Number.isSafeInteger(data?.result?.message_id)) throw new Error('Telegram API rejected request');
    return data.result.message_id;
  } catch {
    // Never include Telegram URL, bot token, request body or raw Telegram errors in logs.
    throw new Fault(502,'Telegram belum menerima pesan. Periksa token bot dan izin mengirim ke grup.');
  }
}

function context(event) {
  return clean(event.project) ? 'proyek '+clean(event.project) : 'tugas terbaru';
}
export function officeTaskConversation(event) {
  const worker=divisions.find(d=>d.id===event.division);
  if (!worker || !Object.hasOwn(statusLabels,event.action)) return null;
  const subject=context(event);
  if (activeAuto.has(worker.id)) {
    const variants=workerReport[worker.id][event.action];
    const text=variants[event.eventId%variants.length].replace('{subject}',subject);
    let followUp=null;
    if (event.action==='completed') followUp={...reactions[worker.id]};
    else if(worker.id!=='management') followUp={division:'management',
      text:'Aku catat kendala '+worker.employee+'. Kita cek status tugasnya dulu sebelum menentukan langkah berikutnya.'};
    return {division:worker.id,text,followUp};
  }
  // Other eight divisions are deferred, but keep their event formatter available
  // for future opt-in rather than pretending a configured bot exists.
  const variants={
    completed:['Draf '+subject+' sudah tersedia di Anshel dan masih perlu ditinjau.'],
    blocked:['Draf '+subject+' terhambat. Belum ada hasil final yang bisa dipastikan.'],
    failed:['Draf '+subject+' gagal diproses. Belum ada hasil final.'],
  };
  return {division:worker.id,text:variants[event.action][0],followUp:null};
}

function getUsernames(env) {
  const usernames=mapJson(env.TELEGRAM_BOT_USERNAMES_JSON,false);
  return new Map(Object.entries(usernames).filter(([id,value])=>divisions.some(d=>d.id===id)
    && typeof value==='string' && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value))
    .map(([id,value])=>[value.toLowerCase(),id]));
}
const personFrom=input=>divisionByName.get(input.toLowerCase()) ?? null;
// Only match complete employee names, never substrings inside unrelated words.
// Match names anywhere in a message so the owner can speak naturally.
const employeeNamePattern=new RegExp('(^|[^A-Za-z0-9_])('+divisions.map(d=>d.employee).join('|')+')(?=$|[^A-Za-z0-9_])','ig');
function getAddressedDivision(input,env) {
  const fromCommand=/^\/(?:tanya|ask)\s+([a-zA-Z0-9_]+)\s*\|\s*(.*)$/is.exec(input);
  if (fromCommand) return {division:personFrom(fromCommand[1]),text:fromCommand[2],explicit:true};
  const usernames=getUsernames(env);
  const leadingMention=/^@([A-Za-z][A-Za-z0-9_]{4,31})[\s,:]*(.*)$/s.exec(input);
  if (leadingMention) return {division:usernames.get(leadingMention[1].toLowerCase()) ?? null,
    text:leadingMention[2],explicit:true};
  // When a recognized employee is explicitly addressed at the start, they win
  // even if another employee is also discussed later in the same message.
  const prefix=/^([a-zA-Z]+)[,:]\s*(.*)$/s.exec(input);
  if (prefix) {
    const addressed=personFrom(prefix[1]);
    if (addressed) return {division:addressed,text:prefix[2],explicit:true};
  }
  // Telegram usernames may appear mid-sentence, but only configured usernames
  // can route: do not guess identities from arbitrary @mentions.
  const mentions=input.matchAll(/(^|[^A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_]{4,31})(?=$|[^A-Za-z0-9_])/g);
  for(const match of mentions) {
    const id=usernames.get(match[2].toLowerCase());
    if(id) return {division:id,text:input,explicit:true};
  }
  // Ignore URLs and @mentions while scanning names to avoid accidental matches.
  const prose=input.replace(/https?:\/\/\S+/gi,' ').replace(/@[A-Za-z][A-Za-z0-9_]{4,31}/g,' ');
  employeeNamePattern.lastIndex=0;
  const found=employeeNamePattern.exec(prose);
  if(found) return {division:personFrom(found[2]),text:input,explicit:true};
  return {division:'management',text:input,explicit:false};
}
function latestTask(state,division) {
  const tasks=(state.tasks||[]).filter(t=>t.division===division);
  const priority=['running','blocked','failed','queued','awaiting_approval','completed'];
  for(const status of priority) {
    const found=tasks.find(t=>t.status===status);
    if(found)return found;
  }
  return null;
}
export function officeGroupReply(state,input,env) {
  const msg=input.trim().slice(0,1500);
  if (msg==='/bantuan'||msg==='/help') return {division:'management',
    text:'Boleh ngobrol dengan Alya, Bima, Citra, atau Dara. /aktivitas untuk melihat aktivitas empat bot dan worker, /ringkasan untuk status tugas, /kendala untuk tugas bermasalah, /cek Nama untuk progres pribadi, /status dan /tim untuk informasi kantor. Beri draf dengan /tugas Nama | instruksi, atau tulis: Tolong Bima buat draf pemeriksaan API. Tugas yang dibuat masuk antrean, bukan langsung selesai. /kalender untuk tanggal merah. /rapat mulai TOPIK, /rapat catat CATATAN, /rapat putuskan KEPUTUSAN, /rapat selesai; /ingat TOPIK | CATATAN; /memori; /acara; /ingatkan YYYY-MM-DD HH:MM | PESAN; /mode normal atau diskusi; /hening on atau off.'};
  if(/^\/(?:aktivitas|pegawai|monitor)$/i.test(msg))
    return {division:'management',text:officeActivityReply(state,configuredOfficeBots(env).configured)};
  if(/^\/(?:kalender|libur)$/i.test(msg)) {
    const calendar=officeIndonesiaCalendarContext(state.now??Date.now(),state.schedule,'libur nasional');
    const today=calendar.today;
    const event=today?.event;
    const todayInfo=event ? today.day+', '+today.date+': '+event.name+
      ' ('+event.type+').' :
      today?.calendarVerified ? today.day+', '+today.date+': tidak tercatat sebagai libur nasional atau cuti bersama.' :
      'Daftar resmi untuk tahun ini belum tersedia di sistem.';
    const scheduleInfo=today?.officeScheduledClosed
      ? 'Jadwal kantor virtual: tutup hari ini menurut pengaturan.'
      : 'Jadwal kantor virtual: hari kerja menurut pengaturan, meskipun hari libur nasional tidak otomatis mengubah jadwal.';
    const upcoming=calendar.upcomingOfficialHolidays.slice(0,3).map(x=>
      x.date+' '+x.name+' ('+x.type+')').join('; ');
    return {division:'management',text:'Kalender Indonesia (WIB): '+todayInfo+' '+
      scheduleInfo+(upcoming?' Tanggal merah/cuti bersama berikutnya: '+upcoming+'.':'')+
      ' Cuti bersama bagi kantor ini mengikuti keputusan pemilik, bukan otomatis berlaku.'};
  }

  // Mobile-friendly commands use actual task state and never ask Gemini to
  // invent health checks. The bot routing is fixed per command.
  if (/^\/(?:ringkasan|ringkas)$/i.test(msg)) {
    const c=state.counts||{};
    const number=key=>Number(c[key])||0;
    return {division:'management',text:'Ringkasan status tugas Anshel saat ini (seluruh divisi): '+
      number('queued')+' antre, '+number('running')+' dikerjakan, '+
      number('completed')+' selesai, '+number('blocked')+' terhambat, '+
      number('failed')+' gagal. Ini akumulasi status tugas yang tercatat, bukan hanya aktivitas hari ini. '+
      'Kalau mau lihat kendala, kirim /kendala.'};
  }
  if (/^\/kendala$/i.test(msg)) {
    const c=state.counts||{};
    const blocked=Number(c.blocked)||0;
    const failed=Number(c.failed)||0;
    if(!blocked&&!failed) return {division:'operations',
      text:'Di catatan tugas Anshel saat ini belum ada yang berstatus terhambat atau gagal. '+
      'Ini bukan hasil pemeriksaan server, jadi belum memastikan sistem bebas masalah.'};
    const recent=(state.tasks||[]).filter(t=>t.status==='blocked'||t.status==='failed').slice(0,3);
    const details=recent.map(t=>{
      const worker=divisions.find(d=>d.id===t.division);
      const who=worker?.employee||'Divisi tidak dikenal';
      const project=clean(t.project)||'tanpa nama proyek';
      return who+' ('+project+'): '+(t.status==='blocked'?'terhambat':'gagal');
    }).join('; ');
    return {division:'operations',text:'Dari catatan tugas Anshel: '+blocked+' terhambat, '+
      failed+' gagal.'+(details?' Contoh dari daftar tugas terbaru: '+details+'.':
      ' Rincian tugas tersebut tidak terlihat dalam daftar terbaru.')+
      ' Ini status tugas, bukan diagnosis kondisi server.'};
  }
  const check=/^\/cek(?:\s+([A-Za-z0-9_]+))?\s*$/i.exec(msg);
  if (check) {
    const division=check[1]&&personFrom(check[1]);
    if (!division) return {division:'management',
      text:'Untuk cek pegawai, pakai /cek Alya, /cek Bima, /cek Citra, atau /cek Dara.'};
    if (!activeAuto.has(division)) return {division:'management',
      text:'Saat ini /cek pegawai dipakai untuk Alya, Bima, Citra, dan Dara. '+
      'Delapan pegawai lainnya belum diaktifkan untuk chat Telegram.'};
    const person=divisions.find(d=>d.id===division);
    const task=latestTask(state,division);
    if (!task) return {division,
      text:'Di catatan Anshel belum ada tugas untuk divisi '+person.name+'. '+
        (division==='operations'?'Ini bukan tanda bahwa server sudah diperiksa.':
          'Kalau ada pekerjaan baru, statusnya akan muncul setelah tercatat.')};
    const status={queued:'masih antre',running:'sedang dikerjakan',completed:'hasil drafnya sudah dibuat, belum tentu disetujui',
      awaiting_approval:'menunggu persetujuan',blocked:'terhambat',failed:'gagal',paused:'dijeda'};
    const project=clean(task.project);
    return {division,text:'Untuk '+person.name+', ada tugas'+(project?' pada proyek '+project:'')+
      ' yang '+(status[task.status]||'statusnya belum diketahui')+
      '. Ini catatan tugas Anshel, bukan laporan aktivitas fisik kantor.'};
  }
  if (msg==='/tim') return {division:'management',
    text:'Tim Anshel hari ini: '+divisions.map(d=>d.employee+' ('+d.name+')').join(', ')+'. Kita berbagi kabar berdasarkan status tugas yang tercatat di sistem, ya.'};
  if (msg==='/status') {
    const c=state.counts||{};
    return {division:'management',text:'Update dari kantor: '+(c.queued||0)+' tugas antre, '+(c.running||0)+
      ' sedang dikerjakan, '+(c.completed||0)+' selesai, '+(c.blocked||0)+' terhambat, '+(c.failed||0)+
      ' gagal. Hasil lengkapnya tetap ada di dashboard privat Anshel.'};
  }
  const target=getAddressedDivision(msg,env);
  if (!target.division) return {division:'management',
    text:'Aku belum bisa menemukan pegawai yang kamu maksud. Coba /tim untuk nama pegawai, lalu /tanya Nama | pertanyaan.'};
  const person=divisions.find(d=>d.id===target.division);
  const current=latestTask(state,target.division);
  const question=target.text.toLowerCase();
  if (/^(hai|halo|pagi|siang|malam|hello|hi)\b/.test(question) && !/(tugas|kerja|progres|hasil)/.test(question)) {
    return {division:target.division,text:'Hai! '+person.employee+' di sini. Kalau mau cek progres divisi '+person.name+
      ', tinggal tanya saja. Aku akan jawab sesuai data yang tercatat di Anshel.'};
  }
  if (!current) return {division:target.division,text:'Hai, aku '+person.employee+'. Belum ada tugas yang tercatat untuk divisi '+person.name+
    '. Kalau mau kasih tugas, gunakan /tugas '+person.employee.toLowerCase()+' | instruksi.'};
  const project=clean(current.project);
  const label=project ? ' untuk '+project : '';
  const update={
    running:'Aku lagi mengerjakan satu tugas'+label+'. Belum selesai, nanti hasilnya muncul di dashboard kalau sudah beres.',
    queued:'Ada tugas'+label+' yang masih antre. Jadi aku belum mulai menjalankannya, ya.',
    blocked:'Ada tugas'+label+' yang lagi terhambat. Belum ada hasil final yang bisa aku pastikan.',
    failed:'Tugas terakhir'+label+' gagal. Perlu dicek dulu di Anshel sebelum dicoba lagi.',
    awaiting_approval:'Ada tugas'+label+' yang menunggu persetujuan, jadi belum aku jalankan.',
    completed:'Draf tugas terakhir'+label+' sudah selesai. Hasilnya tersimpan di Anshel dan masih perlu ditinjau.',
  };
  return {division:target.division,text:update[current.status] ||
    'Aku cek data divisi '+person.name+' dulu. Detail terbaru bisa dilihat di dashboard.'};
}
export function parseOfficeGroupTask(text) {
  const match=/^\/tugas\s+([a-zA-Z0-9_]+)\s*\|\s*(.{1,1200})$/is.exec(text.trim());
  if (!match)return null;
  const division=personFrom(match[1]);
  if (!division)throw new Fault(400,'Nama divisi tidak dikenal. Gunakan /tim.');
  return {division,description:match[2].trim(),kind:'draft',urgent:false};
}
/** Only explicit and specific drafts for four connected employees. */
export function parseOwnerNaturalTask(text) {
  if(typeof text!=='string'||text.length>1500)return null;
  const value=text.trim();
  const name='(Alya|Bima|Citra|Dara)';
  const verb='(?:buatkan|buat|susun|tulis|rangkum|rancang|siapkan|review|cek)';
  const direct=new RegExp('^(?:tolong|minta|suruh)\\s+'+name+'\\s+(?:untuk\\s+)?'+verb+'\\s+(.+)$','i').exec(value);
  const addressed=new RegExp('^'+name+'\\s*[,：:]\\s*(?:tolong|bantu)\\s+'+verb+'\\s+(.+)$','i').exec(value);
  const match=direct||addressed;
  if(!match)return null;
  const division=personFrom(match[1]);
  if(!activeAuto.has(division))return null;
  const description=match[2].trim();
  // Only queue textual drafts, never execute external actions.
  if(description.length<10||description.length>1200)return null;
  return {division,description,kind:'draft',urgent:false};
}
export async function sendOfficeGroupOwnerMessage(store,env,data,fetchImpl=fetch) {
  const {chatId,userId}=officeGroupConfig(env);
  if (String(data.chatId)!==chatId || String(data.userId)!==userId || data.isBot!==false)
    throw new Fault(403,'Pesan bukan dari pemilik dalam grup yang diizinkan.');
  if (typeof data.text!=='string' || data.text.length>1500 || !/^[0-9]{1,24}$/.test(String(data.updateId||'')))
    throw new Fault(400,'Format pesan grup tidak valid.');
  const updateId=String(data.updateId);
  const novel=await store.reserveOfficeGroupUpdate(updateId);
  if (!novel)return {duplicate:true};
  const groupCommand=parseGroupWorkspaceCommand(data.text);
  if(groupCommand) {
    let result;
    try{result=await store.applyOfficeGroupWorkspace(groupCommand);}
    catch(error){
      if(error?.status===400)throw new Fault(400,error.message);
      throw error;
    }
    await sendOfficeBotMessage(env,'management',result.text,
      {fetchImpl,silent:result.workspace.quiet});
    return {sent:true,division:'management',groupCommand:groupCommand.type};
  }
  const workspace=typeof store.officeGroupWorkspace==='function'
    ?await store.officeGroupWorkspace():null;
  const silent=workspace?.quiet===true;
  if(data.mediaType && ['photo','voice','audio','document','video'].includes(data.mediaType)) {
    const supported={photo:'foto',voice:'pesan suara',audio:'audio',document:'dokumen',video:'video'};
    await sendOfficeBotMessage(env,'management',
      'Lampiran '+supported[data.mediaType]+' sudah terlihat di grup, tetapi kontennya belum bisa dianalisis oleh worker saat ini. '+
      'Kalau ada bagian yang ingin dibahas, tuliskan isi atau ringkasannya di pesan teks.',{fetchImpl,silent});
    return {sent:true,division:'management',attachment:supported[data.mediaType],analyzed:false};
  }
  const task=parseOfficeGroupTask(data.text)||parseOwnerNaturalTask(data.text);
  if(task) {
    const created=await store.create(task,'Pemilik · grup Telegram','office-group:'+updateId);
    const target=divisions.find(d=>d.id===task.division);
    const message='Siap, tugas baru untuk '+target.name+' sudah masuk antrean (ID: '+created.id+
      '). Aku mulai kalau jadwal dan kuota worker mengizinkan, ya.';
    await sendOfficeBotMessage(env,target.id,message,{fetchImpl,silent});
    return {sent:true,division:target.id,createdTaskId:created.id};
  }
  const reply=officeGroupReply(await store.state(),data.text,env);
  await sendOfficeBotMessage(env,reply.division,reply.text,{fetchImpl,silent});
  return {sent:true,division:reply.division};
}
export async function dispatchOfficeGroupEvent(store,env,fetchImpl=fetch) {
  officeGroupConfig(env);
  const preferences=typeof store.officeGroupWorkspace==='function'
    ?await store.officeGroupWorkspace():null;
  const silent=preferences?.quiet===true;
  const event=await store.claimTelegramNotification();
  if (!event) {
    const routine=await dispatchOfficeGroupRoutine(store,env,fetchImpl);
    return routine||{sent:false};
  }
  const configured=new Set(configuredOfficeBots(env).configured);
  // Ignore event types/identities outside this four-bot pilot. Mark them
  // consumed without using daily quota or attempting an unconfigured bot.
  if (!activeAuto.has(event.division)||!configured.has(event.division)) {
    await store.ackTelegramNotification(event.eventId,event.token,false);
    // Skipping an inactive division must not starve the end-of-day summary.
    const routine=await dispatchOfficeGroupRoutine(store,env,fetchImpl);
    return routine ? {...routine,skipped:'not-in-four-bot-pilot',eventId:event.eventId} :
      {sent:false,skipped:'not-in-four-bot-pilot',eventId:event.eventId};
  }
  const message=officeTaskConversation(event);
  if (!message) throw new Fault(500,'Audit tugas tidak bisa dipetakan ke pegawai kantor.');
  const replyId=await sendOfficeBotMessage(env,message.division,message.text,{fetchImpl,silent});
  await store.ackTelegramNotification(event.eventId,event.token,true);
  let followedUp=false;
  if (message.followUp && activeAuto.has(message.followUp.division) &&
      configured.has(message.followUp.division)) {
    try {
      await sendOfficeBotMessage(env,message.followUp.division,message.followUp.text,{fetchImpl,replyTo:replyId,silent});
      followedUp=true;
    } catch {
      // Main update was acknowledged. A secondary response is optional;
      // do not resend the worker update on retry.
      followedUp=false;
    }
  }
  const routine=await dispatchOfficeGroupRoutine(store,env,fetchImpl);
  return {sent:true,eventId:event.eventId,division:message.division,followedUp,
    ...(routine?{routine:routine.kind}:{})};
}

/**
 * Reuse the hourly published n8n Auto Office /dispatch route.
 * Distinct once-a-day signal keys prevent repeated reports and warning spam.
 */
export async function dispatchOfficeGroupRoutine(store,env,fetchImpl=fetch) {
  officeGroupConfig(env);
  const state=await store.state();
  const configured=new Set(configuredOfficeBots(env).configured);
  const settings=typeof store.officeGroupWorkspace==='function'
    ?await store.officeGroupWorkspace():null;
  const silent=settings?.quiet===true;
  if(officeSummaryDue(state)&&configured.has('management') &&
     await store.claimOfficeGroupSignal('daily-summary')) {
    await sendOfficeBotMessage(env,'management',officeDailySummary(state),{fetchImpl,silent});
    return {sent:true,kind:'daily-summary',division:'management'};
  }
  const workspace=typeof store.officeGroupWorkspace==='function'
    ?await store.officeGroupWorkspace():null;
  if(workspace && configured.has('management') &&
     typeof store.claimDueOfficeReminder==='function') {
    const due=await store.claimDueOfficeReminder();
    if(due) {
      let sent=false;
      try{
        await sendOfficeBotMessage(env,'management',
          'Pengingat Anshel ('+due.date+' '+due.time+' WIB): '+due.text,
          {fetchImpl,silent:workspace.quiet});
        sent=true;
        return {sent:true,kind:'owner-reminder',division:'management'};
      }finally{
        await store.ackOfficeReminder(due.id,sent);
      }
    }
  }
  const warning=officeQueueDelayAlert(state);
  if(warning&&configured.has('operations') &&
     await store.claimOfficeGroupSignal('queued-worker-silent')) {
    await sendOfficeBotMessage(env,'operations',warning,{fetchImpl,silent});
    return {sent:true,kind:'queue-delay-alert',division:'operations'};
  }
  return null;
}

export function officeCheckinWindow(timestamp) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',weekday:'short',
    hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp));
  const day=parts.find(p=>p.type==='weekday')?.value;
  const hour=Number(parts.find(p=>p.type==='hour')?.value);
  return ['Mon','Tue','Wed','Thu','Fri'].includes(day)&&hour>=11&&hour<=14;
}

export function officeVirtualCheckin(state,configured) {
  const busy=new Set((state.running||[]).map(t=>t.division));
  for(const t of state.tasks||[])if(t.status==='running')busy.add(t.division);
  const eligible=automaticOfficeDivisions.filter(id=>configured.includes(id) &&
    !busy.has(id) && state.people?.[id]?.executing!==true &&
    state.people?.[id] && Object.hasOwn(activities,state.people[id].activity));
  if(eligible.length<2)return null;
  const localDay=Math.floor((Number(state.now)+7*3600_000)/86400_000);
  const idx=((localDay%eligible.length)+eligible.length)%eligible.length;
  // Prefer an actual recorded task over repetitive fictional office banter.
  const relevant=(state.tasks||[]).find(task=>eligible.includes(task.division) &&
    ['queued','blocked','failed','completed','awaiting_approval'].includes(task.status));
  const first=relevant?.division||eligible[idx];
  const second=eligible[(eligible.indexOf(first)+1)%eligible.length];
  const names=Object.fromEntries(divisions.map(d=>[d.id,d.employee]));
  const p1=activities[state.people[first].activity].toLowerCase();
  const p2=activities[state.people[second].activity].toLowerCase();
  if(relevant) {
    const project=clean(relevant.project)||'pekerjaan terbaru';
    const fact={
      queued:'masih menunggu eksekusi',blocked:'terhambat',failed:'gagal diproses',
      completed:'hasil drafnya sudah tercatat',awaiting_approval:'menunggu persetujuan',
    }[relevant.status];
    const firstText='Di catatan Anshel, '+project+' '+fact+'. '+names[second]+
      ', menurutmu langkah berikutnya perlu difokuskan ke mana?';
    const answers={
      management:'Kalau dari status di Anshel, kita prioritaskan sesuai jadwal dulu. Belum bisa menganggapnya final.',
      operations:'Kalau masih ada hambatan, perlu diperiksa penyebabnya dulu. Aku belum punya hasil cek sistem.',
      administration:'Kita bisa rapikan daftar tindak lanjut dari catatan tugas, tanpa menganggap hasilnya sudah disetujui.',
      hr:'Kalau ada hambatan, kita bisa diskusikan pembagian perhatian tim tanpa menyimpulkan semua sudah beres.',
    };
    return {first,second,text:firstText,reply:answers[second]};
  }

  const openers=[
    'Di kantor virtual, avatarku lagi '+p1+' nih. '+names[second]+', kalau kamu lagi apa?',
    'Kelihatannya avatarku lagi '+p1+' di simulasi kantor. '+names[second]+', kamu lagi di mana?',
  ];
  const responses=[
    'Aku lagi '+p2+' di kantor virtual. Kalau nanti ada perkembangan tugas, kita lihat catatan Anshel, ya.',
    'Avatarku lagi '+p2+' di simulasi kantor. Kalau nanti ada update kerjaan, kita bahas dari catatan Anshel.',
  ];
  return {first,second,text:openers[localDay%openers.length],
    reply:responses[localDay%responses.length]};
}

export async function dispatchOfficeGroupCheckin(store,env,fetchImpl=fetch) {
  officeGroupConfig(env);
  const state=await store.state();
  if(!officeCheckinWindow(state.now))return {sent:false,reason:'outside-checkin-window'};
  const configured=configuredOfficeBots(env).configured;
  const conversation=officeVirtualCheckin(state,configured);
  if(!conversation)return {sent:false,reason:'not-enough-active-bots'};
  if(!await store.claimOfficeGroupCheckin())return {sent:false,reason:'already-sent-today'};
  const replyId=await sendOfficeBotMessage(env,conversation.first,conversation.text,{fetchImpl});
  let followedUp=false;
  try {
    await sendOfficeBotMessage(env,conversation.second,conversation.reply,{fetchImpl,replyTo:replyId});
    followedUp=true;
  } catch {
    // The daily lock prevents repeat attempts and spam on partial failure.
    followedUp=false;
  }
  return {sent:true,division:conversation.first,followedUp};
}
