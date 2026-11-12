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
    'Tulis satu kalimat singkat dan alami per pegawai, 10-95 karakter. Setiap orang punya gaya sendiri. Jawab maksud pesan, bukan empat variasi jawaban identik.',
    'Gunakan bahasa Indonesia sehari-hari yang wajar. Boleh gunakan "Pak" paling banyak SATU kali pada keseluruhan percakapan, jangan menyebut nama pemilik kecuali diminta.',
    'Jangan memulai semua respons dengan "Siap", tidak usah menawarkan format tugas atau perintah bot jika tak ditanya.',
    'Dilarang mengarang hasil kerja, status server, interaksi antarbot, tindakan nyata, atau cerita fisik. Kegiatan avatar hanya simulasi.',
    'Balas HANYA JSON objek: key adalah id dalam DATA, value adalah satu kalimat; tidak ada field lain, markdown, emoji atau narasi.',
    'Total teks JSON di bawah 680 karakter. DATA: '+JSON.stringify(data),
  ].join('\n');
  return {systemInstruction:{parts:[{text:prompt}]},
    contents:[{role:'user',parts:[{text:question.slice(0,1500)}]}],
    generationConfig:{temperature:0.75,maxOutputTokens:550,responseMimeType:'application/json'}};
}

function fallbackFor(id,q) {
  const cheer=/\b(?:semangat|makasih|terima kasih|pagi|siang|sore|malam)\b/i.test(q);
  const options={
    management:cheer?'Makasih, Pak. Semoga kegiatan tim besok berjalan lancar.':
      'Aku dengerin, Pak. Ada yang ingin kita bahas bersama?',
    operations:cheer?'Oke, semoga semuanya lancar juga.':
      'Bima ada. Kalau ada urusan teknis, kasih konteksnya ya.',
    administration:cheer?'Makasih! Nanti kalau ada catatan baru, kita bahas.':
      'Aku ikut dengar. Ada dokumen atau jadwal yang perlu dibahas?',
    hr:cheer?'Makasih, semoga kegiatan tim besok menyenangkan.':
      'Aku juga ada. Kalau soal kebutuhan tim, boleh kita bahas.',
  };
  return options[id];
}

/** Model cannot choose senders; only allowlisted response fields are considered. */
export function parseOfficeCollectiveResponse(output,recipients,question,cleaner) {
  let decoded={};
  if(typeof output==='string'&&output.length<=700) {
    const raw=output.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'');
    try {
      const parsed=JSON.parse(raw);
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))decoded=parsed;
    } catch { /* Fallback for invalid JSON or unavailable Gemini. */ }
  }
  return Object.fromEntries(recipients.map(id=>{
    const fallback=fallbackFor(id,question);
    const proposed=typeof decoded[id]==='string'&&decoded[id].length<=160
      ?cleaner(decoded[id],fallback,question):fallback;
    return [id,{text:proposed,ai:proposed!==fallback}];
  }));
}
