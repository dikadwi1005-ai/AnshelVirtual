import { divisions, activities } from '../public/catalog.js';
import { Fault } from './store.ts';

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
export async function sendOfficeBotMessage(env,division,text,options={}) {
  officeGroupConfig(env);
  if (!divisions.some(item=>item.id===division)) throw new Fault(400,'Divisi pegawai AI tidak valid.');
  const config=configuredOfficeBots(env);
  if (!config.configured.includes(division)) throw new Fault(503,'Token bot divisi '+division+' belum dikonfigurasi.');
  if (typeof text!=='string'||!text.trim()||text.length>3800) throw new Fault(400,'Pesan bot tidak valid.');
  const token=config.parsed[division];
  const payload={chat_id:env.TELEGRAM_CHAT_ID,text,disable_notification:false};
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
    text:'Boleh ngobrol di sini. Contoh: "Eka, progresnya gimana?", "/tanya Kirana | sudah ada tugas QA?", atau "/tugas desain | Buat tiga konsep desain." Untuk ringkasan: /status dan /tim. Semua akun di sini bot AI, dan hasil kerja tetap perlu ditinjau.'};
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
export async function sendOfficeGroupOwnerMessage(store,env,data,fetchImpl=fetch) {
  const {chatId,userId}=officeGroupConfig(env);
  if (String(data.chatId)!==chatId || String(data.userId)!==userId || data.isBot!==false)
    throw new Fault(403,'Pesan bukan dari pemilik dalam grup yang diizinkan.');
  if (typeof data.text!=='string' || data.text.length>1500 || !/^[0-9]{1,24}$/.test(String(data.updateId||'')))
    throw new Fault(400,'Format pesan grup tidak valid.');
  const updateId=String(data.updateId);
  const novel=await store.reserveOfficeGroupUpdate(updateId);
  if (!novel)return {duplicate:true};
  const task=parseOfficeGroupTask(data.text);
  if(task) {
    const created=await store.create(task,'Pemilik · grup Telegram','office-group:'+updateId);
    const target=divisions.find(d=>d.id===task.division);
    const message='Siap, tugas baru untuk '+target.name+' sudah masuk antrean (ID: '+created.id+
      '). Aku mulai kalau jadwal dan kuota worker mengizinkan, ya.';
    await sendOfficeBotMessage(env,target.id,message,{fetchImpl});
    return {sent:true,division:target.id,createdTaskId:created.id};
  }
  const reply=officeGroupReply(await store.state(),data.text,env);
  await sendOfficeBotMessage(env,reply.division,reply.text,{fetchImpl});
  return {sent:true,division:reply.division};
}
export async function dispatchOfficeGroupEvent(store,env,fetchImpl=fetch) {
  officeGroupConfig(env);
  const event=await store.claimTelegramNotification();
  if (!event)return {sent:false};
  const configured=new Set(configuredOfficeBots(env).configured);
  // Ignore event types/identities outside this four-bot pilot. Mark them
  // consumed without using daily quota or attempting an unconfigured bot.
  if (!activeAuto.has(event.division)||!configured.has(event.division)) {
    await store.ackTelegramNotification(event.eventId,event.token,false);
    return {sent:false,skipped:'not-in-four-bot-pilot',eventId:event.eventId};
  }
  const message=officeTaskConversation(event);
  if (!message) throw new Fault(500,'Audit tugas tidak bisa dipetakan ke pegawai kantor.');
  const replyId=await sendOfficeBotMessage(env,message.division,message.text,{fetchImpl});
  await store.ackTelegramNotification(event.eventId,event.token,true);
  let followedUp=false;
  if (message.followUp && activeAuto.has(message.followUp.division) &&
      configured.has(message.followUp.division)) {
    try {
      await sendOfficeBotMessage(env,message.followUp.division,message.followUp.text,{fetchImpl,replyTo:replyId});
      followedUp=true;
    } catch {
      // Main update was acknowledged. A secondary response is optional;
      // do not resend the worker update on retry.
      followedUp=false;
    }
  }
  return {sent:true,eventId:event.eventId,division:message.division,followedUp};
}

export function officeCheckinWindow(timestamp) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',weekday:'short',
    hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp));
  const day=parts.find(p=>p.type==='weekday')?.value;
  const hour=Number(parts.find(p=>p.type==='hour')?.value);
  return ['Mon','Tue','Wed','Thu','Fri'].includes(day)&&hour>=11&&hour<=14;
}

export function officeVirtualCheckin(state,configured) {
  const eligible=automaticOfficeDivisions.filter(id=>configured.includes(id) &&
    state.people?.[id] && Object.hasOwn(activities,state.people[id].activity));
  if(eligible.length<2)return null;
  const localDay=Math.floor((Number(state.now)+7*3600_000)/86400_000);
  const idx=((localDay%eligible.length)+eligible.length)%eligible.length;
  const first=eligible[idx];
  const second=eligible[(idx+1)%eligible.length];
  const names=Object.fromEntries(divisions.map(d=>[d.id,d.employee]));
  const p1=activities[state.people[first].activity].toLowerCase();
  const p2=activities[state.people[second].activity].toLowerCase();
  const openers=[
    'Di kantor virtual, avatarku lagi '+p1+' nih. '+names[second]+', kalau kamu lagi apa?',
    'Kelihatannya avatarku lagi '+p1+' di simulasi kantor. '+names[second]+', kamu lagi di mana?',
  ];
  const responses=[
    'Aku lagi '+p2+' di kantor virtual. Kalau nanti ada perkembangan tugas, kita lihat catatan Anshel, ya.',
    'Avatarku lagi '+p2+' sekarang. Nanti kalau ada update kerjaan, kita bahas dari data yang masuk.',
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
