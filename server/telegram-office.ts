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
  marketing:{division:'management',text:'Terima kasih, Jihan. Draf SEO dicatat untuk ditinjau; perubahan website belum dijalankan.'},
  research:{division:'management',text:'Terima kasih, Indra. Risetnya masih perlu ditinjau sebelum dijadikan acuan.'},
  social:{division:'management',text:'Terima kasih, Hana. Draf kontennya akan ditinjau dulu sebelum publikasi.'},
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
  marketing:{
    completed:['Draf SEO {subject} sudah tersimpan. Angka traffic atau peringkat tetap perlu data terverifikasi.',
      'Rencana SEO {subject} tersedia sebagai draf dan belum diterapkan ke situs mana pun.'],
    blocked:['Draf SEO {subject} terhambat. Belum ada hasil audit atau pembaruan peringkat yang terverifikasi.'],
    failed:['Pemrosesan draf SEO {subject} gagal. Belum ada hasil final.'],
  },
  research:{
    completed:['Draf riset {subject} sudah tercatat. Verifikasi sumber masih perlu ditinjau.',
      'Hasil draf penelitian {subject} tersedia untuk diperiksa sebelum digunakan.'],
    blocked:['Riset {subject} masih terhambat dan belum ada kesimpulan terverifikasi.'],
    failed:['Pembuatan draf riset {subject} gagal. Belum ada hasil siap pakai.'],
  },
  social:{
    completed:['Draf konten {subject} sudah tercatat. Belum dipublikasikan.',
      'Konsep konten {subject} tersedia untuk ditinjau sebelum posting.'],
    blocked:['Draf konten {subject} masih tertahan; belum ada materi final.'],
    failed:['Pembuatan draf konten {subject} gagal. Belum ada posting yang dilakukan.'],
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
/**
 * Additional employees opt in exactly like the four original bots:
 * a valid token activates their own Telegram identity, without flags.
 * All other divisions remain inactive even if their tokens are stored.
 * Chat permission does not imply external publishing or worker execution.
 */
export function enabledOfficeDivisions(env) {
  const connected=new Set(configuredOfficeBots(env).configured);
  return [...automaticOfficeDivisions,
    ...['marketing','research','social'].filter(id=>connected.has(id))];
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
    if (!res.ok) {
      const failure=new Error('Telegram HTTP request rejected');
      failure.deliveryRejected=true;
      throw failure;
    }
    const data=await res.json();
    if (data?.ok!==true) {
      const failure=new Error('Telegram API rejected request');
      failure.deliveryRejected=true;
      throw failure;
    }
    if(!Number.isSafeInteger(data?.result?.message_id))
      throw new Error('Telegram reply is incomplete');
    return data.result.message_id;
  } catch(error) {
    // HTTP rejection confirms non-delivery. Timeout/connection loss is uncertain:
    // never blindly retry it, or the owner could receive duplicate messages.
    const failure=new Fault(502,'Pengiriman Telegram belum terkonfirmasi. Periksa token bot dan izin grup.');
    failure.deliveryRejected=error?.deliveryRejected===true;
    throw failure;
  }
}

function context(event) {
  return clean(event.project) ? 'proyek '+clean(event.project) : 'tugas terbaru';
}
export function officeTaskConversation(event,env=null) {
  const worker=divisions.find(d=>d.id===event.division);
  if (!worker || !Object.hasOwn(statusLabels,event.action)) return null;
  const subject=context(event);
  const enabled=env?new Set(enabledOfficeDivisions(env)):activeAuto;
  if (enabled.has(worker.id)) {
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
// Only suggest a technical owner on explicit incidents, never on the mere
// appearance of API/server in a general chat or in a task description.
export const isTechnicalIncident=text=>
  typeof text==='string' &&
  /\b(?:api|endpoint|server|database|webhook|integrasi|n8n|vercel|supabase|worker|koneksi)\b/i.test(text) &&
  /\b(?:error|gagal|masalah|gangguan|down|rusak|putus|bermasalah|timeout|cek|periksa|kenapa|status|tidak\s+(?:jalan|bisa|tersambung)|nggak\s+(?:jalan|bisa))\b/i.test(text);
// Only match complete employee names, never substrings inside unrelated words.
// Match names anywhere in a message so the owner can speak naturally.
const employeeNamePattern=new RegExp('(^|[^A-Za-z0-9_])('+divisions.map(d=>d.employee).join('|')+')(?=$|[^A-Za-z0-9_])','ig');
export function getAddressedDivision(input,env) {
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
/** An inactive division cannot impersonate a connected Telegram bot. */
export function inactiveOfficeAddress(input,env) {
  const target=getAddressedDivision(input,env);
  if(!target.explicit || !target.division ||
    enabledOfficeDivisions(env).includes(target.division))return null;
  const person=divisions.find(d=>d.id===target.division);
  return {division:target.division,text:person.employee+' ('+person.name+
    ') belum aktif untuk percakapan Telegram saat ini. Aku Alya bisa mencatat tugas draf dengan /tugas '+
    person.employee+' | instruksi, tetapi belum ada jaminan worker akan memprosesnya. '+
    'Status tugas bisa diperiksa melalui dashboard Anshel.'};
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
    text:'Boleh ngobrol dengan Alya, Bima, Citra, atau Dara. /kesehatan untuk status teknis dari Bima (IT), /aktivitas untuk melihat aktivitas empat bot dan worker, /ringkasan untuk status tugas, /kendala untuk tugas bermasalah, /cek Nama untuk progres pribadi, /status dan /tim untuk informasi kantor. Beri draf dengan /tugas Nama | instruksi, atau tulis: Tolong Bima buat draf pemeriksaan API. Tugas yang dibuat masuk antrean, bukan langsung selesai. /kalender untuk tanggal merah. /rapat mulai TOPIK, /rapat catat CATATAN, /rapat putuskan KEPUTUSAN, /rapat selesai; /ingat TOPIK | CATATAN; /memori; /acara; /ingatkan YYYY-MM-DD HH:MM | PESAN; /mode normal atau diskusi; /hening on atau off. /serahkan ID | Nama; /revisi ID | instruksi; /tinjau ID; /setujui ID; /rapat tugas Nama | instruksi.'};
  if(/^\/(?:aktivitas|pegawai|monitor)$/i.test(msg))
    return {division:'management',text:officeActivityReply(state,enabledOfficeDivisions(env))};
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
    if (!enabledOfficeDivisions(env).includes(division)) return {division:'management',
      text:'Saat ini /cek hanya tersedia untuk bot Telegram yang sudah diaktifkan. '+
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
  const addressed=getAddressedDivision(msg,env);
  const target=!addressed.explicit&&isTechnicalIncident(msg)
    ?{division:'operations',text:msg,explicit:false}:addressed;
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
export function parseOwnerNaturalTask(text,env=null) {
  if(typeof text!=='string'||text.length>1500)return null;
  const value=text.trim();
  const names=(env?enabledOfficeDivisions(env):automaticOfficeDivisions)
    .map(id=>divisions.find(d=>d.id===id)?.employee).filter(Boolean).join('|');
  const name='('+names+')';
  const verb='(?:buatkan|buat|susun|tulis|rangkum|rancang|siapkan|review|cek)';
  const direct=new RegExp('^(?:tolong|minta|suruh)\\s+'+name+'\\s+(?:untuk\\s+)?'+verb+'\\s+(.+)$','i').exec(value);
  const addressed=new RegExp('^'+name+'\\s*[,：:]\\s*(?:tolong|bantu)\\s+'+verb+'\\s+(.+)$','i').exec(value);
  const match=direct||addressed;
  if(!match)return null;
  const division=personFrom(match[1]);
  if(!(env?enabledOfficeDivisions(env):automaticOfficeDivisions).includes(division))return null;
  const description=match[2].trim();
  // Only queue textual drafts, never execute external actions.
  if(description.length<10||description.length>1200)return null;
  return {division,description,kind:'draft',urgent:false};
}
/** Owner-only task actions; never called from model-generated instructions. */
export function parseOwnerTaskAction(text) {
  if(typeof text!=='string'||text.length>1500)return null;
  const q=text.trim();
  const uuid='([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})';
  const artifactInfo=new RegExp('^/hasil\\s+'+uuid+'$','i').exec(q);
  if(artifactInfo)return {type:'artifact-info',id:artifactInfo[1]};
  const artifactDecision=new RegExp('^/(sahkan|kembalikan)\\s+'+uuid+'(?:\\s*\\|\\s*(.{5,180}))?$','is').exec(q);
  if(artifactDecision)return {type:artifactDecision[1].toLowerCase()==='sahkan'
    ?'artifact-approve':'artifact-reject',id:artifactDecision[2],
    reason:(artifactDecision[3]||'').trim()};
  const relay=new RegExp('^/serahkan\\s+'+uuid+'\\s*\\|\\s*(Alya|Bima|Citra|Dara)$','i').exec(q);
  if(relay)return {type:'assign',id:relay[1],division:personFrom(relay[2])};
  const status=new RegExp('^/(tinjau|setujui|tolak|ulang|jeda|batalkan)\\s+'+uuid+'$','i').exec(q);
  if(status)return {type:({tinjau:'review',setujui:'approve',tolak:'reject',
    ulang:'retry',jeda:'pause',batalkan:'cancel'})[status[1].toLowerCase()],id:status[2]};
  const revise=new RegExp('^/revisi\\s+'+uuid+'\\s*\\|\\s*(.{10,800})$','is').exec(q);
  if(revise)return {type:'revise',id:revise[1],description:revise[2].trim()};
  const meeting=/^\/rapat\s+tugas\s+(Alya|Bima|Citra|Dara)\s*\|\s*(.{10,800})$/is.exec(q);
  if(meeting)return {type:'meeting-task',division:personFrom(meeting[1]),
    description:meeting[2].trim()};
  return null;
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
  if(/^\/(?:kesehatan|health)$/i.test(data.text.trim())) {
    const state=await store.state(); // An actual successful database round trip.
    const last=typeof store.officeDispatchPulse==='function'
      ?await store.officeDispatchPulse():null;
    const elapsed=typeof last==='number'&&last>0&&last<=state.now
      ?Math.floor((state.now-last)/60_000):null;
    const dispatcher=elapsed===null?'belum ada pemanggilan terverifikasi'
      :elapsed+' menit sejak panggilan /dispatch terakhir';
    const itConnected=configuredOfficeBots(env).configured.includes('operations');
    const sender=itConnected?'operations':'management';
    const text=(itConnected?'Bima · Laporan teknis IT Anshel:\n':
      'Alya · Meneruskan status IT (bot Bima belum terhubung):\n')+
      'API dan database: permintaan ini berhasil dibaca.\n'+
      'Worker: '+(state.worker?'heartbeat teramati dalam 40 detik':'tidak ada heartbeat terbaru')+'.\n'+
      'Integrasi Auto Office: '+dispatcher+'.\n'+
      'Gemini, n8n Published, Vercel deployment, dan layanan eksternal: belum diuji langsung oleh pemeriksaan ini. ' +
      'Pemeriksaan kesehatan menyeluruh memerlukan sumber eksternal yang belum terhubung.';
    await sendOfficeBotMessage(env,sender,text,{fetchImpl});
    return {sent:true,division:sender,technicalOwner:'operations',kind:'health-evidence'};
  }
  const taskAction=parseOwnerTaskAction(data.text);
  if(taskAction) {
    const workspace=await store.officeGroupWorkspace();
    const silent=workspace.quiet===true;
    if(taskAction.type==='artifact-info') {
      const review=await store.officeArtifactReview(taskAction.id);
      const division=divisions.find(d=>d.id===review.division);
      const text='Alya · Bukti hasil tugas '+review.id+':\\n'+
        'Pegawai: '+(division?.employee||review.division)+'. Proyek: '+(clean(review.project)||'tanpa nama')+'.\\n'+
        'Status: '+review.status+'. SHA-256: '+(review.sha256||'belum tersedia')+'.\\n'+
        'Review pemilik: '+(review.review||'belum ada')+'.\\n'+
        'Buka hasil lengkap di dashboard privat sebelum /sahkan ID atau /kembalikan ID | alasan. '+
        'Perintah ini tidak menerbitkan pekerjaan.';
      await sendOfficeBotMessage(env,'management',text,{fetchImpl,silent});
      return {sent:true,division:'management',action:'artifact-info',taskId:review.id};
    }
    if(['artifact-approve','artifact-reject'].includes(taskAction.type)) {
      const decision=taskAction.type==='artifact-approve'?'approved':'rejected';
      const review=await store.decideOfficeArtifact(taskAction.id,decision,taskAction.reason,
        'Pemilik · Telegram review');
      const text='Alya · Review hasil '+review.id+' dicatat: '+decision+
        '. SHA-256 '+review.sha256+'. '+
        (review.duplicate?'Keputusan ini sudah tercatat. ':'')+
        'Ini persetujuan atau penolakan artefak, bukan publikasi atau eksekusi tindakan eksternal.';
      await sendOfficeBotMessage(env,'management',text,{fetchImpl,silent});
      return {sent:true,division:'management',action:taskAction.type,taskId:review.id};
    }
    if(taskAction.type==='meeting-task') {
      if(!workspace.meeting)throw new Fault(409,'Mulai rapat dahulu dengan /rapat mulai TOPIK.');
      const created=await store.create({
        division:taskAction.division,description:taskAction.description,kind:'draft',
        project:'Rapat: '+workspace.meeting.topic.slice(0,55),
      },'Pemilik · rapat Telegram','office-group:'+updateId);
      await store.applyOfficeGroupWorkspace({type:'meeting-link',division:taskAction.division,taskId:created.id});
      await sendOfficeBotMessage(env,taskAction.division,
        'Tindak lanjut rapat masuk antrean draf (ID: '+created.id+'). Belum dikerjakan atau disetujui.',
        {fetchImpl,silent});
      return {sent:true,division:taskAction.division,createdTaskId:created.id,source:'meeting'};
    }
    if(taskAction.type==='revise') {
      const original=(await store.state()).tasks.find(t=>t.id===taskAction.id);
      if(!original)throw new Fault(404,'Tugas asal tidak terlihat di daftar tugas terbaru. Buka panel Tugas untuk detail.');
      if(!enabledOfficeDivisions(env).includes(original.division))
        throw new Fault(400,'Revisi Telegram hanya untuk divisi Telegram yang aktif.');
      const created=await store.create({division:original.division,kind:'draft',
        project:original.project||'Revisi Telegram',
        description:'Revisi atas tugas '+original.id+': '+taskAction.description},
        'Pemilik · revisi Telegram','office-group:'+updateId);
      await sendOfficeBotMessage(env,original.division,
        'Permintaan revisi dibuat sebagai tugas draf baru (ID: '+created.id+
        '). Tugas asal tidak diubah, dan revisi belum selesai.',{fetchImpl,silent});
      return {sent:true,division:original.division,createdTaskId:created.id,source:'revision'};
    }
    const acted=await store.action(taskAction.id,taskAction.type,
      taskAction.type==='assign'?{division:taskAction.division}:{},'Pemilik · grup Telegram');
    const target=taskAction.type==='assign'?taskAction.division:acted.division;
    const reply=taskAction.type==='assign'
      ?'Tugas '+acted.id+' dialihkan ke '+divisions.find(d=>d.id===target)?.employee+
        ' (status '+acted.status+'). Ini serah-terima antrean, bukan hasil selesai.'
      :'Tindakan '+taskAction.type+' dicatat untuk tugas '+acted.id+
        ' (status '+acted.status+'). Ini perubahan status, bukan verifikasi hasil draf.';
    await sendOfficeBotMessage(env,enabledOfficeDivisions(env).includes(target)?target:'management',reply,{fetchImpl,silent});
    return {sent:true,division:target,taskId:acted.id,action:taskAction.type};
  }
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
  const task=parseOfficeGroupTask(data.text)||parseOwnerNaturalTask(data.text,env);
  if(task) {
    const created=await store.create(task,'Pemilik · grup Telegram','office-group:'+updateId);
    const target=divisions.find(d=>d.id===task.division);
    const pilotActive=enabledOfficeDivisions(env).includes(target.id);
    const botConnected=configuredOfficeBots(env).configured.includes(target.id);
    // Only the four pilot bots plus explicitly enabled Jihan may speak.
    const sender=pilotActive && botConnected?target.id:'management';
    const message=!pilotActive
      ?'Tugas untuk '+target.name+' tercatat dalam antrean (ID: '+created.id+
        '). Divisi ini belum aktif sebagai bot Telegram pilot. Tugas belum dinyatakan dikerjakan; pantau status dan ketersediaan worker di dashboard.'
      :!botConnected
      ?'Tugas untuk '+target.name+' tercatat dalam antrean (ID: '+created.id+
        '). Bot Telegram pegawai ini belum terhubung. Belum ada bukti tugas telah dikerjakan; cek status worker di dashboard.'
      :'Siap, tugas baru untuk '+target.name+' sudah masuk antrean (ID: '+created.id+
        '). Belum dikerjakan; pemrosesan tergantung jadwal dan ketersediaan worker.';
    await sendOfficeBotMessage(env,sender,message,{fetchImpl,silent});
    return {sent:true,division:target.id,acknowledgedBy:sender,createdTaskId:created.id};
  }
  const reply=officeGroupReply(await store.state(),data.text,env);
  const inactive=inactiveOfficeAddress(data.text,env);
  const configured=configuredOfficeBots(env).configured;
  const sender=inactive || !enabledOfficeDivisions(env).includes(reply.division)||
    !configured.includes(reply.division)
    ?'management':reply.division;
  const response=inactive?.text || (sender==='management'&&reply.division!=='management'
    ?'Pegawai tersebut belum terhubung di Telegram. Tanyakan status melalui /monitor.':reply.text);
  await sendOfficeBotMessage(env,sender,response,{fetchImpl,silent});
  return {sent:true,division:sender,inactiveDivision:inactive?.division||null};
}
export async function dispatchOfficeGroupEvent(store,env,fetchImpl=fetch) {
  officeGroupConfig(env);
  if(typeof store.recordOfficeDispatchPulse==='function')
    await store.recordOfficeDispatchPulse();
  const preferences=typeof store.officeGroupWorkspace==='function'
    ?await store.officeGroupWorkspace():null;
  const silent=preferences?.quiet===true;
  const event=await store.claimTelegramNotification();
  if (!event) {
    const routine=await dispatchOfficeGroupRoutine(store,env,fetchImpl);
    return routine||{sent:false};
  }
  const configured=new Set(configuredOfficeBots(env).configured);
  // Other seven dormant employee tokens remain excluded.
  if (!enabledOfficeDivisions(env).includes(event.division)||!configured.has(event.division)) {
    await store.ackTelegramNotification(event.eventId,event.token,false);
    // Skipping an inactive division must not starve the end-of-day summary.
    const routine=await dispatchOfficeGroupRoutine(store,env,fetchImpl);
    return routine ? {...routine,skipped:'not-in-four-bot-pilot',eventId:event.eventId} :
      {sent:false,skipped:'not-in-four-bot-pilot',eventId:event.eventId};
  }
  const message=officeTaskConversation(event,env);
  if (!message) throw new Fault(500,'Audit tugas tidak bisa dipetakan ke pegawai kantor.');
  let replyId;
  try {
    replyId=await sendOfficeBotMessage(env,message.division,message.text,{fetchImpl,silent});
  }catch(error){
    // Unknown delivery cannot be safely auto-retried: advance the outbox cursor
    // while surfacing the failure to n8n for manual verification.
    if(error?.deliveryRejected!==true)
      await store.ackTelegramNotification(event.eventId,event.token,false);
    throw error;
  }
  await store.ackTelegramNotification(event.eventId,event.token,true);
  let followedUp=false;
  if (message.followUp && enabledOfficeDivisions(env).includes(message.followUp.division) &&
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

/** Retry a daily signal on the next dispatcher call only when Telegram explicitly
 * rejected its message, never when the network outcome is unknown. */
async function sendRoutineSignal(store,env,kind,division,message,fetchImpl,silent) {
  if(!await store.claimOfficeGroupSignal(kind))return false;
  try {
    await sendOfficeBotMessage(env,division,message,{fetchImpl,silent});
    return true;
  }catch(error){
    if(error?.deliveryRejected===true && typeof store.releaseOfficeGroupSignal==='function')
      await store.releaseOfficeGroupSignal(kind);
    throw error;
  }
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
     await sendRoutineSignal(store,env,'daily-summary','management',
       officeDailySummary(state,enabledOfficeDivisions(env)),fetchImpl,silent)) {
    return {sent:true,kind:'daily-summary',division:'management'};
  }
  const workspace=typeof store.officeGroupWorkspace==='function'
    ?await store.officeGroupWorkspace():null;
  if(workspace && configured.has('management') &&
     typeof store.claimDueOfficeReminder==='function') {
    const due=await store.claimDueOfficeReminder();
    if(due) {
      let sent=false,uncertain=false;
      try{
        await sendOfficeBotMessage(env,'management',
          'Pengingat Anshel ('+due.date+' '+due.time+' WIB): '+due.text,
          {fetchImpl,silent:workspace.quiet});
        sent=true;
        return {sent:true,kind:'owner-reminder',division:'management'};
      }catch(error){
        uncertain=error?.deliveryRejected!==true;
        throw error;
      }finally{
        await store.ackOfficeReminder(due.id,sent,uncertain);
      }
    }
  }
  const today=new Date(Number(state.now)+7*3600_000).toISOString().slice(0,10);
  const events=Array.isArray(settings?.events)?settings.events.filter(e=>e.date===today):[];
  if(events.length&&settings?.notifications!=='important'&&configured.has('management')) {
    const names=events.slice(0,3).map(e=>e.label).join('; ');
    if(await sendRoutineSignal(store,env,'internal-event','management',
      'Agenda internal Anshel hari ini ('+today+'): '+names+
      '. Ini pengingat acara terdaftar, bukan bukti acaranya sudah berlangsung.',
      fetchImpl,silent))return {sent:true,kind:'internal-event',division:'management'};
  }
  const warning=officeQueueDelayAlert(state,enabledOfficeDivisions(env));
  if(warning&&configured.has('operations') &&
     await sendRoutineSignal(store,env,'queued-worker-silent','operations',warning,fetchImpl,silent)) {
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
  const settings=typeof store.officeGroupWorkspace==='function'
    ?await store.officeGroupWorkspace():null;
  if(settings?.notifications==='important')
    return {sent:false,reason:'non-essential-messages-disabled'};
  if(!officeCheckinWindow(state.now))return {sent:false,reason:'outside-checkin-window'};
  const configured=configuredOfficeBots(env).configured;
  const conversation=officeVirtualCheckin(state,configured);
  if(!conversation)return {sent:false,reason:'not-enough-active-bots'};
  if(!await store.claimOfficeGroupCheckin())return {sent:false,reason:'already-sent-today'};
  const replyId=await sendOfficeBotMessage(env,conversation.first,conversation.text,
    {fetchImpl,silent:settings?.quiet===true});
  let followedUp=false;
  try {
    await sendOfficeBotMessage(env,conversation.second,conversation.reply,
      {fetchImpl,replyTo:replyId,silent:settings?.quiet===true});
    followedUp=true;
  } catch {
    // The daily lock prevents repeat attempts and spam on partial failure.
    followedUp=false;
  }
  return {sent:true,division:conversation.first,followedUp};
}
