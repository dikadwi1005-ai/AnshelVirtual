// BCIFT-only verified-news preparation for Jihan. No site updates or publishing.
// Google Search grounding is requested only for an explicit news question.
const operatorHosts=['batamfast.com','sindoferry.com.sg','majesticfastferry.com.sg'];
const socialHosts=['instagram.com','facebook.com','x.com','twitter.com','tiktok.com','youtube.com'];
const hostOf=url=>url.hostname.replace(/^www\./,'');
function secureUrl(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}
const existingBlogTitles=[
  'BCIFT Punya Autogate: Perjalanan Jadi Lebih Mudah',
  'Study Tour di BCIFT: Pengalaman Edukasi Mengenal Pelabuhan Internasional dari Dekat',
  'Ranoh Island Batam: Destinasi Pantai Tropis dan Panduan Perjalanan',
];
export const jihanNoVerifiedNews='Belum ada kandidat berita BCIFT tujuh hari terakhir dengan judul, tanggal, dan sumber asli yang bisa diverifikasi. Posting sosial yang terkunci atau akunnya belum terkonfirmasi tidak bisa kupastikan.';

export function isJihanNewsQuery(question) {
  return typeof question==='string' &&
    /(?:hot\s*news|berita|kabar\s+terbaru|news\s+(?:minggu|hari)|isu\s+terbaru|topik\s+(?:hangat|berita|terbaru))/i.test(question) &&
    /(?:minggu\s+ini|terbaru|7\s*hari|sepekan|hari\s+ini|kemarin|hot\s*news|berita|news)/i.test(question);
}

export function isOfficialBciftSource(url) {
  try {
    const parsed=secureUrl(url);
    if(!parsed)return false;
    const host=hostOf(parsed);
    return host==='bcift.co.id'||operatorHosts.includes(host)||
      /\.(?:go\.id|gov\.sg|gov\.my)$/.test(host);
  } catch {return false;}
}

export function newsWeekWindow(at) {
  const now=Number.isFinite(Number(at))&&Number(at)>0?Number(at):Date.now();
  const current=new Date(now);
  const start=new Date(now-6*86400_000);
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
  const official='go.id, gov.sg, gov.my, BP Batam, Imigrasi, Kemenhub, BCIFT, dan operator '+operatorHosts.join(', ');
  const instructions=[
    'TUGAS PENCARIAN BERITA LANGSUNG khusus BCIFT. Kamu wajib menggunakan Google Search grounding.',
    'Cari maksimal 2 berita RELEVAN untuk penumpang atau terminal Batam Center, pelayaran Singapura/Malaysia, imigrasi, wisatawan, autogate, dan fasilitas.',
    'Jendela tanggal penerbitan resmi (WIB) dari '+start+' sampai '+end+' saja; periksa tanggal penerbitan pada sumber. Jangan menganggap artikel lama baru hanya karena terindeks hari ini.',
    'Telusuri '+official+'. Portal berita hanya petunjuk menuju sumber asli. Akun Instagram, Facebook, X, TikTok atau YouTube harus ditautkan oleh instansi/operator resmi, dengan isi dan tanggal posting dapat dibaca.',
    'Daftar judul blog BCIFT yang sudah ada: '+JSON.stringify(titles.slice(0,20))+'. Jangan mengusulkan topik duplikat.',
    'Jawab hanya JSON array, maksimal 2 kandidat dan 690 karakter total. Setiap baris berbentuk [judulAsli,tanggalPublikasiYYYY-MM-DD,tanggalKejadianAtauKosong,instansi,URLAsli,alasanRelevan,keyword,ideJudul,URLSitusInstansiYangMenautkanAkunSosialAtauKosong].',
    'Salin judul sumber dan tanggal dengan tepat. Sertakan URL langsung ke pengumuman/post, tanpa redirect Google. Jika hanya petunjuk atau konten terkunci, jangan tebak.',
    'Bila tidak menemukan bukti resmi dalam 7 hari itu, jawab tepat: TIDAK_ADA_SUMBER_RESMI. Jangan mengarang judul, tanggal, angka penumpang, atau hasil pemeriksaan.',
    'Belum ada izin publikasi, mengubah website, atau mengirim konten ke pihak luar. Usulan ini hanya draf untuk ditinjau pemilik.',
  ].join('\n');
  const system=request.systemInstruction?.parts?.[0];
  if(system?.text)system.text+='\n'+instructions;
  request.tools=[{google_search:{}}];
  request.generationConfig={temperature:0.3,maxOutputTokens:850};
  return request;
}

const validDateString=d=>typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&
  Number.isFinite(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const words=value=>new Set(value.toLowerCase().normalize('NFKD').match(/[a-z0-9]{3,}/g)??[]);
function overlap(a,b) {
  const first=words(a), second=words(b);
  return [...first].filter(word=>second.has(word)).length/Math.max(1,new Set([...first,...second]).size);
}

function socialAccount(url) {
  const host=hostOf(url);
  const path=url.pathname.split('/').filter(Boolean);
  if(!socialHosts.includes(host) || !path.length)return null;
  const name=path[0].toLowerCase();
  if(['watch','reel','reels','p','share','groups','stories','video','videos','shorts','redirect'].includes(name))return null;
  return host.replace('twitter.com','x.com')+'/'+name;
}

async function page(url,fetchImpl) {
  try {
    const response=await fetchImpl(url.href,{redirect:'error',signal:AbortSignal.timeout(2800),headers:{Accept:'text/html'}});
    if(!response.ok || !response.headers.get('content-type')?.includes('html') ||
       Number(response.headers.get('content-length'))>300000)return null;
    const reader=response.body?.getReader();
    if(!reader)return null;
    const decoder=new TextDecoder();
    let html='',bytes=0;
    try {
      for (;;) {
        const {done,value}=await reader.read();
        if(done)return html+decoder.decode();
        bytes+=value.byteLength;
        if(bytes>300000)return null;
        html+=decoder.decode(value,{stream:true});
      }
    } finally { void reader.cancel().catch(()=>{}); }
  } catch { return null; }
}

function publishedDates(html) {
  const datedTags=html.match(/<meta\b[^>]*(?:article:published_time|datePublished|pubdate)[^>]*>/gi)??[];
  const explicit=datedTags.map(tag=>/\bcontent\s*=\s*["'](20\d{2}-\d{2}-\d{2})/i.exec(tag)?.[1]);
  return [...explicit,...[...html.matchAll(/"datePublished"\s*:\s*"(20\d{2}-\d{2}-\d{2})/gi)].map(match=>match[1])];
}

export async function verifyJihanNews(output,now,fetchImpl=fetch) {
  let input;
  if(typeof output!=='string'||output.length>700)return [];
  try { input=JSON.parse(output.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'')); }
  catch { return []; }
  if(!Array.isArray(input))return [];
  const {start,end}=newsWeekWindow(now);
  const candidates=await Promise.all(input.slice(0,3).map(async entry=>{
    if(!Array.isArray(entry)||entry.length!==9||entry.some(value=>typeof value!=='string'))return null;
    const [title,date,event,organization,source,relevance,keyword,idea,proof]=entry.map(value=>value.trim());
    const url=secureUrl(source);
    if(!url||url.pathname==='/'||!validDateString(date)||date<start||date>end||
      !title||!organization||!keyword||!idea||!relevance)return null;
    const official=isOfficialBciftSource(url.href);
    const account=socialAccount(url);
    if(!official&&!account)return null;
    if(!official) {
      const reference=secureUrl(proof);
      if(!reference||!isOfficialBciftSource(reference.href))return null;
      const evidence=await page(reference,fetchImpl);
      if(!evidence||![...evidence.matchAll(/href\s*=\s*["'](https:[^"']+)["']/gi)].some(match=>{
        const link=secureUrl(match[1]);
        return link&&socialAccount(link)===account;
      }))return null;
    }
    const html=await page(url,fetchImpl);
    if(!html||!publishedDates(html).includes(date))return null;
    const headlines=[...html.matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)]
      .map(match=>stripHtml(match[1]));
    const verifiedTitle=headlines.find(headline=>overlap(headline,title)>=.55);
    if(!verifiedTitle || !/\b(?:batam|bcift|ferry|feri|pelayaran|harbourfront|tanah merah|imigrasi|autogate|penumpang)\b/i.test(verifiedTitle))return null;
    const eventDate=validDateString(event)&&stripHtml(html).includes(event)?event:null;
    return {title:verifiedTitle.slice(0,240),date,eventDate,organization,source:url.href,relevance,keyword,idea,
      type:official?'website resmi':'akun sosial resmi',verified:true};
  }));
  const verified=candidates.filter(Boolean);
  if(!verified.length)return [];
  const titles=await readBciftBlogTitles(fetchImpl);
  const found=[];
  for (const item of verified) {
    if(found.some(other=>other.source===item.source||overlap(other.title,item.title)>=.65))continue;
    item.duplicate=titles.find(title=>Math.max(overlap(title,item.idea),overlap(title,item.title))>=.55)??null;
    found.push(item);
  }
  return found;
}

export function formatJihanNews(items,limit=700) {
  const reports=items.map(item=>[
    item.date+' · '+item.title+' ('+item.organization+', '+item.type+')',
    item.eventDate&&item.eventDate!==item.date?'Kejadian '+item.eventDate:null,
    item.relevance+' · SEO: '+item.keyword,
    item.duplicate?'Cek duplikasi: '+item.duplicate:'Ide draf: '+item.idea,
    item.source,
  ].filter(Boolean).join('\n'));
  let result='';
  for (const report of reports) {
    if(report.length+(result?result.length+2:0)>limit) {
      if (!result) result=report.slice(0,limit-1)+'…';
      break;
    }
    result+=(result?'\n\n':'')+report;
  }
  return result||jihanNoVerifiedNews;
}

export function officeNewsResult(items) {
  return items.length ? {status:'completed',output:JSON.stringify(items,null,2),error:null} :
    {status:'blocked',output:null,error:jihanNoVerifiedNews};
}
