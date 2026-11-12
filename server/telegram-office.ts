import { divisions } from '../public/catalog.js';
import { Fault } from './store.ts';

const statusLabels={completed:'Selesai',blocked:'Terhambat',failed:'Gagal'};
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
  const variants={
    completed:[
      'Update sedikit: draf untuk '+subject+' sudah selesai. Hasilnya bisa dicek di dashboard Anshel, ya.',
      'Draf '+subject+' sudah aku beresin. Aku simpan hasilnya di Anshel untuk ditinjau dulu.',
      'Untuk '+subject+', hasil drafnya sudah tersedia di dashboard. Tinggal direview sebelum dipakai.',
    ],
    blocked:[
      'Aku lagi tertahan di '+subject+'. Belum bisa bilang selesai, jadi perlu dicek kendalanya dulu, ya.',
      'Ada hambatan di '+subject+'. Statusnya masih terhambat; aku belum punya hasil final untuk dibagikan.',
    ],
    failed:[
      'Ada kendala saat mengerjakan '+subject+'. Statusnya gagal, jadi hasilnya belum bisa dianggap selesai.',
      'Maaf, pekerjaan '+subject+' gagal diproses. Kita perlu cek statusnya di dashboard sebelum mencoba ulang.',
    ],
  };
  const choices=variants[event.action];
  const text=choices[event.eventId%choices.length]+' (ID: '+event.taskId+')';
  let followUp=null;
  if (event.action==='completed' && event.division!=='management') {
    const reviewer=['development','operations'].includes(event.division) ? 'qa'
      : ['creative','video'].includes(event.division) ? 'social' : 'management';
    const reviewText=reviewer==='qa'
      ? 'Oke, '+worker.employee+'. Kalau nanti ada tugas pengujian, aku siap bantu cek. Ini belum berarti sudah lolos QA, ya.'
      : reviewer==='social'
      ? 'Sip, '+worker.employee+'. Nanti kalau konsepnya mau dipakai untuk publikasi, kita minta persetujuan dulu.'
      : 'Sip, '+worker.employee+'. Drafnya sudah ada, nanti kita tinjau dulu sebelum dipakai, ya.';
    followUp={division:reviewer,text:reviewText};
  }
  return {division:worker.id,text,followUp};
}

function getUsernames(env) {
  const usernames=mapJson(env.TELEGRAM_BOT_USERNAMES_JSON,false);
  return new Map(Object.entries(usernames).filter(([id,value])=>divisions.some(d=>d.id===id)
    && typeof value==='string' && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value))
    .map(([id,value])=>[value.toLowerCase(),id]));
}
const personFrom=input=>divisionByName.get(input.toLowerCase()) ?? null;
function getAddressedDivision(input,env) {
  const fromCommand=/^\/(?:tanya|ask)\s+([a-zA-Z0-9_]+)\s*\|\s*(.*)$/is.exec(input);
  if (fromCommand) return {division:personFrom(fromCommand[1]),text:fromCommand[2],explicit:true};
  const mention=/^@([A-Za-z][A-Za-z0-9_]{4,31})[\s,:]*(.*)$/s.exec(input);
  if (mention) return {division:getUsernames(env).get(mention[1].toLowerCase()) ?? null,text:mention[2],explicit:true};
  const prefix=/^([a-zA-Z]+)[,:]\s*(.*)$/s.exec(input);
  if (prefix) return {division:personFrom(prefix[1]),text:prefix[2],explicit:!!personFrom(prefix[1])};
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
  const message=officeTaskConversation(event);
  if (!message) throw new Fault(500,'Audit tugas tidak bisa dipetakan ke pegawai kantor.');
  const replyId=await sendOfficeBotMessage(env,message.division,message.text,{fetchImpl});
  await store.ackTelegramNotification(event.eventId,event.token);
  let followedUp=false;
  if (message.followUp) {
    try {
      await sendOfficeBotMessage(env,message.followUp.division,message.followUp.text,{fetchImpl,replyTo:replyId});
      followedUp=true;
    } catch {
      // ACK already completed. Do not duplicate the worker message just to retry an optional reply.
      followedUp=false;
    }
  }
  return {sent:true,eventId:event.eventId,division:message.division,followedUp};
}
