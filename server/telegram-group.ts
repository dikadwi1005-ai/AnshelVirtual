import { divisions,activities } from '../public/catalog.js';
import { automaticOfficeDivisions } from './telegram-office.ts';
import { Fault } from './store.ts';

const names=divisions.map(d=>d.employee).join('|');
const leadingPerson=new RegExp('^(?:'+names+')\\s*[,：:]','i');
const styles={
  management:'Alya, koordinatif dan hangat, spontan tanpa gaya laporan.',
  operations:'Bima, santai, anak IT yang to the point; tidak mengaku cek server.',
  administration:'Citra, teliti dan kalem; suka menjelaskan catatan secara ringkas.',
  hr:'Dara, empatik dan ringan; fokus kebutuhan tim tanpa mengarang dialog.',
};
const labels=Object.fromEntries(divisions.map(d=>[d.id,d.employee]));

/** A real group call, not the phrase "semua tugas" or "Alya, semua ...". */
export function isCollectiveCall(text) {
  if(typeof text!=='string')return false;
  const q=text.trim();
  if(!q||q.startsWith('/')||leadingPerson.test(q))return false;
  // 'Semua tugas selesai?' asks about tasks, not every staff member.
  if(/^semua(?:nya)?\s+(?:tugas|dokumen|pekerjaan|laporan|data|hasil|proyek|pesan|file|pegawai|divisi)\b/i.test(q))return false;
  return /^(?:(?:eh|hei|hai|halo|oke|okay|pagi|siang|sore|malam|woi)[\s,!.:-]+){0,3}(?:guys|semuanya|semua|teman[- ]teman|kalian\s+semua|tim)(?=$|[\s,!.?:;-])/i.test(q)
    || /(?:^|[\s,!.])guys(?=$|[\s,!.?:;-])/i.test(q)
    || /\bsemua(?:nya)?\s+(?:semangat|lagi\s+(?:apa|ngapain)|dengerin|dengar|bisa\s+bantu|kumpul|hadir|pagi|siang|sore|malam)\b/i.test(q);
}

/** Work in progress excludes a bot. Queued tasks and casual avatar activity do not. */
export function availableOfficeResponders(state,configured) {
  const enabled=new Set(configured||[]);
  const working=new Set((state.running||[]).filter(t=>t.status==='running'||!t.status).map(t=>t.division));
  for(const item of state.tasks||[]) if(item.status==='running')working.add(item.division);
  for(const id of automaticOfficeDivisions)
    if(state.people?.[id]?.executing===true)working.add(id);
  return automaticOfficeDivisions.filter(id=>enabled.has(id)&&!working.has(id));
}

/** One model call produces separate, short messages for the available bots. */
export function buildOfficeCollectiveRequest(question,recipients,state) {
  const valid=Array.isArray(recipients)&&recipients.length>0&&recipients.length<=4&&
    recipients.every(id=>automaticOfficeDivisions.includes(id))&&new Set(recipients).size===recipients.length;
  if(!valid)throw new Fault(400,'Panggilan pegawai aktif tidak valid.');
  const people=recipients.map(id=>{
    const avatar=state.people?.[id];
    return {id,name:labels[id],personality:styles[id],
      avatar:avatar&&Object.hasOwn(activities,avatar.activity)?activities[avatar.activity]:null,
      tasks:(state.tasks||[]).filter(t=>t.division===id).slice(0,2)
        .map(t=>({status:t.status,project:typeof t.project==='string'?t.project.slice(0,55):''}))};
  });
  const data={people,counts:/\b(?:seluruh|total|kantor|semua tugas)\b/i.test(question)
    ?{queued:Number(state.counts?.queued)||0,running:Number(state.counts?.running)||0,
      completed:Number(state.counts?.completed)||0}:null};
  const prompt=[
    'Ini adalah chat Telegram kantor virtual Anshel Virtual Tech. Pengirim adalah PEMILIK sekaligus pimpinan, bukan pelanggan.',
    'Balas panggilan pemilik untuk tiap pegawai yang sedang bebas dalam DATA. Pegawai sibuk sedang mengerjakan tugas sudah DISARING, jangan tampilkan mereka dan jangan menambah pegawai lain.',
    'Tulis satu kalimat pendek, unik, dan natural untuk setiap pegawai, 10-95 karakter. Tanggapi maksud kalimat terakhir pimpinan, bukan empat variasi teks basa-basi.',
    'Contoh respons saat pemilik bilang "Guys, besok semangat ya": Alya menanggapi koordinasi yang relevan dengan jadwal, Bima santai menanggapi semangat, Citra menanggapi catatan jika dibutuhkan, Dara menanggapi kesejahteraan tim. JANGAN menyalin contoh secara harfiah.',
    'Gunakan bahasa Indonesia sehari-hari yang wajar. Boleh gunakan "Pak" paling banyak SATU kali pada keseluruhan percakapan, jangan menyebut nama pemilik kecuali diminta.',
    'Jangan memulai semua respons dengan "Siap", tidak usah menawarkan format tugas atau perintah bot jika tak ditanya.',
    'Dilarang mengarang hasil kerja, status server, interaksi antarbot, tindakan nyata, atau cerita fisik. Kegiatan avatar hanya simulasi.',
    'Balas HANYA JSON objek: key adalah id dalam DATA, value adalah satu kalimat; tidak ada field lain, markdown, emoji atau narasi.',
    'Total teks JSON di bawah 680 karakter. DATA: '+JSON.stringify(data),
  ].join('\n');
  const responseSchema={type:'OBJECT',
    properties:Object.fromEntries(recipients.map(id=>[id,{
      type:'STRING',description:'Satu kalimat natural sebagai '+labels[id]+', 10 sampai 95 karakter, tidak mengarang tindakan nyata.',
    }])),
    required:[...recipients]};
  return {systemInstruction:{parts:[{text:prompt}]},
    contents:[{role:'user',parts:[{text:question.slice(0,1500)}]}],
    generationConfig:{temperature:0.75,maxOutputTokens:1600,
      responseMimeType:'application/json',responseSchema}};
}

/** Context-aware, truth-safe replies when Gemini is empty, truncated, or invalid. */
function fallbackFor(id,q,state={}) {
  const question=String(q||'');
  const encouragement=/\b(?:semangat|sukses|good luck|lancar|tetap kuat)\b/i.test(question);
  const thanks=/\b(?:makasih|terima kasih|thanks|thank you)\b/i.test(question);
  const greeting=/\b(?:pagi|siang|sore|malam|halo|hai)\b/i.test(question);
  const updates=/\b(?:progres|progress|status|tugas|pekerjaan|laporan|ada kabar)\b/i.test(question);
  const activity=/\b(?:lagi\s+(?:apa|ngapain)|sedang\s+apa|kesibukan|aktivitas)\b/i.test(question);
  const needHelp=/\b(?:bisa\s+bantu|tolong|bantuan|butuh bantuan|ada yang bisa)\b/i.test(question);
  const tomorrow=/\bbesok\b/i.test(question);
  const groups={
    encouragement:{
      management:tomorrow?'Makasih, Pak. Besok kita sesuaikan prioritas dengan jadwal kantor ya.':'Makasih, Pak. Kita kerjakan sesuai prioritas, pelan-pelan tapi rapi.',
      operations:'Semangat juga! Kalau ada kendala teknis, langsung bahas bareng.',
      administration:'Makasih! Kalau nanti ada catatan yang perlu dirapikan, bilang aja.',
      hr:'Makasih. Semoga semua tetap semangat dan punya waktu istirahat.',
    },
    thanks:{
      management:'Sama-sama, Pak. Kalau ada keputusan penting, kita bahas sesuai prioritas.',
      operations:'Santai, sama-sama. Kalau butuh bantu ngurai masalah teknis, kabarin.',
      administration:'Sama-sama! Nanti kalau butuh catatan tambahan, bilang aja ya.',
      hr:'Sama-sama. Senang kalau urusan tim bisa dibahas dengan baik.',
    },
    updates:{
      management:'Aku bisa bantu rangkum progres tugas yang tercatat kalau diperlukan.',
      operations:'Untuk progres teknis, aku cuma bisa memastikan dari tugas yang tercatat.',
      administration:'Kalau butuh rekap dokumen, aku bisa bantu lihat catatan tugas.',
      hr:'Untuk urusan tim, kita bisa bahas status tugas yang tercatat dulu.',
    },
    activity:{
      management:'Lagi santai sebentar di simulasi kantor. Ada prioritas yang mau dibahas?',
      operations:'Kalau belum ada tugas berjalan, avatarku bisa saja sedang santai.',
      administration:'Aku lagi ikut aktivitas kantor virtual. Ada hal yang perlu dicatat?',
      hr:'Lagi ikut kegiatan di kantor virtual. Ada kabar tentang tim?',
    },
    help:{
      management:'Bisa, Pak. Ceritakan dulu apa yang mau diselesaikan bersama.',
      operations:'Boleh, jelasin kendala teknisnya biar kita tahu mulai dari mana.',
      administration:'Bisa, ada dokumen atau catatan yang perlu dibereskan?',
      hr:'Boleh, ini soal koordinasi atau kebutuhan tim?',
    },
    greeting:{
      management:'Halo, Pak. Ada topik yang ingin kita bahas bareng?',
      operations:'Hai! Aku ada. Lagi mau bahas apa nih?',
      administration:'Halo! Kalau ada catatan penting, boleh disampaikan.',
      hr:'Halo semuanya. Semoga harinya berjalan nyaman.',
    },
    neutral:{
      management:'Aku dengar, Pak. Apa yang perlu kita putuskan bersama?',
      operations:'Bima nyimak. Ada sisi teknis yang mau dibahas?',
      administration:'Aku ikut dengar. Ada catatan atau jadwal yang perlu dibicarakan?',
      hr:'Dara di sini. Kalau menyangkut tim, kita bisa ngobrol.',
    },
  };
  const category=encouragement?'encouragement':thanks?'thanks':updates?'updates':
    activity?'activity':needHelp?'help':greeting?'greeting':'neutral';
  // Ground answers to actual task/avatars when the owner asks about progress or activity.
  if(category==='updates') {
    const tasks=(state.tasks||[]).filter(t=>t.division===id);
    const current=tasks.find(t=>t.status==='running');
    const waiting=tasks.find(t=>t.status==='queued');
    const done=tasks.find(t=>t.status==='completed');
    if(current)return 'Tugas divisi ini sedang dikerjakan sesuai catatan, belum ada hasil final.';
    if(waiting)return 'Di divisi ini masih ada tugas antre; belum bisa kusebut selesai.';
    if(done)return 'Ada hasil draf yang tercatat selesai di divisi ini, tinggal ditinjau.';
  }
  if(category==='activity') {
    const a=state.people?.[id];
    if(a&&Object.hasOwn(activities,a.activity))
      return 'Di kantor virtual avatarku lagi '+activities[a.activity].toLowerCase()+'.';
  }
  return groups[category][id];
}

function decodeCollectiveJson(output) {
  if(typeof output!=='string'||!output.trim())return {value:{},reason:'provider-empty'};
  if(output.length>1400)return {value:{},reason:'provider-too-long'};
  const normalized=output.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'');
  try{
    const parsed=JSON.parse(normalized);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
      return {value:{},reason:'provider-not-object'};
    return {value:parsed,reason:null};
  }catch{
    return {value:{},reason:'provider-invalid-json'};
  }
}

/** Structured metadata is returned only to n8n; never leak model text or credentials. */
export function resolveOfficeCollectiveResponse(output,recipients,question,cleaner,state={}) {
  const {value,reason}=decodeCollectiveJson(output);
  const answers={};
  let generated=0;
  let honorificUsed=false;
  for(const id of recipients) {
    const fallback=fallbackFor(id,question,state);
    const raw=Object.hasOwn(value,id)?value[id]:undefined;
    let message=typeof raw==='string'&&raw.length<=180
      ?cleaner(raw,fallback,question):fallback;
    let ai=typeof raw==='string'&&message!==fallback;
    // Only the first speaker may use "Pak"; never name the owner without a request.
    if(/\bPak\b/i.test(message)) {
      if(honorificUsed)message=message.replace(/(?:,\s*|\s+)Pak\b[,.]?/gi,'').replace(/\s{2,}/g,' ').trim();
      else{
        honorificUsed=true;
        let first=true;
        message=message.replace(/\bPak\b/gi,()=>first?(first=false,'Pak'):'');
        message=message.replace(/\s{2,}/g,' ').trim();
      }
    }
    if(message.length<4) {message=fallback;ai=false;}
    answers[id]={text:message,ai};
    if(ai)generated++;
  }
  const reasonOut=reason??(generated===recipients.length?'none':generated===0?'provider-no-valid-replies':'provider-partial-fallback');
  return {answers,generated,fallbackReason:reasonOut};
}

/** Keep the original public helper for callers/tests. */
export function parseOfficeCollectiveResponse(output,recipients,question,cleaner,state={}) {
  return resolveOfficeCollectiveResponse(output,recipients,question,cleaner,state).answers;
}
