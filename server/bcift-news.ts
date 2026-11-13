// BCIFT-only verified-news preparation for Jihan. No site updates or publishing.
// Google Search grounding is requested only for an explicit news question.
// Sources are restricted to official institutional sites; absence of
// evidence must produce a transparent fallback, never a made-up headline.
const existingBlogTitles=[
  'BCIFT Punya Autogate: Perjalanan Jadi Lebih Mudah',
  'Study Tour di BCIFT: Pengalaman Edukasi Mengenal Pelabuhan Internasional dari Dekat',
  'Ranoh Island Batam: Destinasi Pantai Tropis dan Panduan Perjalanan',
];

export function isJihanNewsQuery(question) {
  return typeof question==='string' &&
    /(?:hot\s*news|berita|kabar\s+terbaru|news\s+(?:minggu|hari)|isu\s+terbaru|topik\s+(?:hangat|berita|terbaru))/i.test(question) &&
    /(?:minggu\s+ini|terbaru|7\s*hari|sepekan|hari\s+ini|kemarin|hot\s*news|berita|news)/i.test(question);
}

export function isOfficialBciftSource(url) {
  try {
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password)return false;
    const host=parsed.hostname.toLowerCase();
    return host==='bcift.co.id'||host==='www.bcift.co.id'||
      host.endsWith('.go.id')||host.endsWith('.gov.sg')||
      host==='ica.gov.sg'||host==='www.ica.gov.sg';
  } catch {return false;}
}

export function newsWeekWindow(at) {
  const now=Number.isFinite(Number(at))&&Number(at)>0?Number(at):Date.now();
  const current=new Date(now);
  const start=new Date(now-7*86400_000);
  // Labels use the Indonesia calendar date, not UTC.
  const format=d=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
      timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(d).map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  };
  return {start:format(start),end:format(current)};
}

const stripHtml=value=>value.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&')
  .replace(/&#(?:0*39|x0*27);/gi,"'").replace(/&quot;/g,'"')
  .replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();

export function extractBciftBlogTitles(html) {
  if(typeof html!=='string')return [];
  const out=[];
  const re=/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{1,750}?)<\/a>/gi;
  for(const match of html.slice(0,260000).matchAll(re)) {
    if(!/\/blog\/[^?#/]+\/?(?:[?#]|$)/i.test(match[1]))continue;
    const title=stripHtml(match[2]);
    if(title.length>=12&&title.length<=155&&!out.includes(title))out.push(title);
    if(out.length>=20)break;
  }
  return out;
}
export async function readBciftBlogTitles(fetchImpl=fetch) {
  try {
    const response=await fetchImpl('https://bcift.co.id/blog/',{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(2600),
      headers:{Accept:'text/html'},
    });
    if(!response.ok||Number(response.headers.get('content-length')||0)>260000)
      return existingBlogTitles;
    const html=(await response.text()).slice(0,260000);
    const titles=extractBciftBlogTitles(html);
    return [...new Set([...titles,...existingBlogTitles])].slice(0,20);
  }catch{return existingBlogTitles;}
}

export function addJihanNewsGrounding(request,question,now,titles=existingBlogTitles) {
  if(!isJihanNewsQuery(question))return request;
  const {start,end}=newsWeekWindow(now);
  const official='bpbatam.go.id, batam.imigrasi.go.id, imigrasi.go.id, '+ 
    'dephub.go.id, kemenhub.go.id, ica.gov.sg, dan situs resmi BCIFT';
  const instructions=[
    'TUGAS PENCARIAN BERITA LANGSUNG khusus BCIFT. Kamu wajib menggunakan Google Search grounding.',
    'Cari maksimal 2 berita RELEVAN untuk penumpang atau terminal Batam Center, pelayaran Singapura/Malaysia, imigrasi, wisatawan, autogate, dan fasilitas.',
    'Jendela tanggal penerbitan resmi (WIB) dari '+start+' sampai '+end+' saja; periksa tanggal penerbitan pada sumber. Jangan menganggap artikel lama baru hanya karena terindeks hari ini.',
    'Sumber boleh berupa situs resmi institusi atau BCIFT saja: '+official+'. Jangan tampilkan backlink portal berita atau domain tidak resmi.',
    'Daftar judul blog BCIFT yang sudah ada: '+JSON.stringify(titles.slice(0,20))+'. Jangan mengusulkan topik duplikat.',
    'Untuk SETIAP berita wajib tampilkan tanggal penerbitan YYYY-MM-DD, judul/ide artikel, alasan singkat relevan ke BCIFT, 1 keyword, serta URL HTTPS LANGSUNG ke artikel sumber resmi. Jangan menggunakan tautan Google News atau tautan redirect.',
    'Jawab maksimum 650 KARAKTER keseluruhan agar lolos batas pesan n8n; maksimal 2 kandidat. Tanpa markdown berlebihan, tanpa pengantar panjang.',
    'Bila tidak menemukan bukti resmi dalam 7 hari itu, jawab tepat: TIDAK_ADA_SUMBER_RESMI. Jangan mengarang judul, tanggal, angka penumpang, atau hasil pemeriksaan.',
    'Belum ada izin publikasi, mengubah website, atau mengirim konten ke pihak luar. Usulan ini hanya draf untuk ditinjau pemilik.',
  ].join('\n');
  const system=request.systemInstruction?.parts?.[0];
  if(system?.text)system.text+='\n'+instructions;
  request.tools=[{google_search:{}}];
  request.generationConfig={temperature:0.3,maxOutputTokens:850};
  return request;
}

const validDateString=d=>/^20\d{2}-\d{2}-\d{2}$/.test(d)&&
  new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export function validateJihanNewsReply(text,now) {
  if(typeof text!=='string')return false;
  const out=text.trim();
  if(!out||out.length>700||out==='TIDAK_ADA_SUMBER_RESMI')return false;
  const urls=[...out.matchAll(/https:\/\/[^\s<>\])]+/g)].map(m=>m[0].replace(/[.,;]+$/,''));
  if(!urls.length||urls.length>3||!urls.every(isOfficialBciftSource))return false;
  const {start,end}=newsWeekWindow(now);
  const dates=[...out.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map(m=>m[0]);
  return dates.length>=urls.length && dates.every(d=>validDateString(d)&&d>=start&&d<=end);
}

export const jihanNoVerifiedNews='Aku belum menemukan berita 7 hari terakhir yang memiliki tanggal dan URL sumber resmi yang bisa kutunjukkan untuk BCIFT. Aku nggak akan mengarang topik. Coba lagi nanti atau beri sumber resmi untuk ditinjau.';
