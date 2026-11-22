import { createHash, randomUUID } from 'node:crypto';
import { reserveSourceBudget } from './automation-budget.ts';

export class AutomationFault extends Error {
  status: number;
  constructor(message,status=400) { super(message); this.status=status; }
}
const requireValue=(ok,message)=>{if (!ok) throw new AutomationFault(message);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const wibDate=at=>new Date(at+7*3600_000).toISOString().slice(0,10);
const date=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const bounded=(n,min,max)=>Number.isFinite(n) && n>=min && n<=max;
const text=(value,max)=>typeof value==='string' && value.trim().length>0 && value.length<=max;
export function officialUrl(input) {
  try {
    const url=new URL(input);
    if (url.protocol!=='https:' || url.username || url.password || url.port ||
        !url.hostname.includes('.') || url.hostname.length>180) return null;
    url.hash='';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    if (/^(www\.|m\.|mbasic\.)?facebook\.com$/i.test(url.hostname)) url.hostname='www.facebook.com';
    url.pathname=url.pathname.replace(/\/+$/,'') || '/';
    return url.href;
  } catch { return null; }
}
export function initialAutomation() {
  return {version:1,leadSettings:{enabled:false,revision:1,intervalMinutes:15,maxAgeHours:24,minScore:75,
    keywords:['butuh website','cari developer','butuh aplikasi','butuh automation'],
    profile:{business:'Anshel Virtual Tech',services:['website','aplikasi','automation','integrasi API','chatbot AI'],
      portfolio:'',contact:'',price:'',deposit:'',settlement:'',bugWarranty:'',revisions:'',tone:'santai, singkat, sopan'},
    nextAt:0,lastAt:null,lease:null},
    sources:{},leads:[],candidates:[],watches:[],offers:[],snapshots:[],changes:[],logs:[],outbox:[],commands:[],usage:{}};
}
const leadStates=['new','commented','negotiating','deal','skipped','irrelevant'];
export function validateLeadPublication(input,now,maxAgeHours=24) {
  if (!Number.isSafeInteger(input?.publishedAt) || input.publishedAt>now ||
      now-input.publishedAt>Math.min(maxAgeHours,24)*3600_000) return 'Tanggal publikasi melewati batas atau tidak valid.';
  if (!['original','owner_verified'].includes(input.dateEvidence) ||
      !text(input.publicationProof,1000)) return 'Waktu publikasi asli belum terverifikasi.';
  if (!officialUrl(input.url) || !text(input.text,12000)) return 'Teks atau URL sumber tidak valid.';
  if (/(?:sudah|udah|telah).{0,20}(?:dapat|dapet|ketemu|menemukan)|(?:close[d]?|tutup|selesai)\s*(?:order|lowongan|pencarian)?\s*$/i.test(input.text))
    return 'Pencarian jasa sudah ditutup.';
  return null;
}
export function validateLeadAnalysis(input) {
  requireValue(input && ['buyer','seller','job','spam','closed','irrelevant'].includes(input.intent),'Klasifikasi lead tidak valid.');
  requireValue(Number.isInteger(input.score) && bounded(input.score,0,100),'Skor lead tidak valid.');
  for (const field of ['summary','category','reason','comment'])
    requireValue(text(input[field],field==='comment'?700:500),'Analisis lead belum lengkap.');
  for (const field of ['budget','location'])
    requireValue(input[field]===undefined || typeof input[field]==='string' && input[field].length<=180,'Metadata lead tidak valid.');
  return Object.fromEntries(['intent','score','summary','category','reason','comment','budget','location']
    .filter(key=>input[key]!==undefined).map(key=>[key,input[key]]));
}
export function flightDates(watch,now) {
  const today=wibDate(now);
  if (watch.mode==='rolling') return Array.from({length:watch.windowDays},(_,i)=>
    new Date(Date.parse(today)+i*86400_000).toISOString().slice(0,10));
  const start=watch.mode==='specific'?watch.date:watch.start;
  const end=watch.mode==='specific'?watch.date:watch.end;
  const result=[];
  for (let at=Math.max(Date.parse(start),Date.parse(today));at<=Date.parse(end);at+=86400_000)
    result.push(new Date(at).toISOString().slice(0,10));
  return result;
}
export function flightWatch(input,now) {
  const route=input.route ?? {from:input.from ?? 'SUB',to:input.to ?? 'BTH'};
  requireValue(/^[A-Z]{3}$/.test(route.from) && /^[A-Z]{3}$/.test(route.to) && route.from!==route.to,'Kode bandara asal dan tujuan harus berbeda.');
  const mode=input.mode ?? 'rolling', windowDays=Number(input.windowDays ?? 30);
  requireValue(['rolling','specific','range'].includes(mode),'Mode tanggal tidak valid.');
  requireValue([7,14,30,60,90].includes(windowDays),'Rentang rolling harus 7, 14, 30, 60 atau 90 hari.');
  if (mode==='specific') requireValue(date(input.date) && input.date>=wibDate(now),'Tanggal keberangkatan tidak valid atau sudah lewat.');
  if (mode==='range') requireValue(date(input.start) && date(input.end) && input.start<=input.end &&
    input.end>=wibDate(now) && Date.parse(input.end)-Date.parse(input.start)<=89*86400_000,'Rentang tanggal maksimal 90 hari.');
  const trip=input.trip ?? 'oneway';
  requireValue(['oneway','roundtrip'].includes(trip),'Jenis perjalanan tidak valid.');
  if (trip==='roundtrip') requireValue(date(input.returnDate) &&
    input.returnDate>=(mode==='rolling'?wibDate(now):mode==='specific'?input.date:input.end),'Tanggal pulang wajib setelah keberangkatan.');
  const passengers=Number(input.passengers ?? 1), intervalMinutes=Number(input.intervalMinutes ?? 15);
  const budget=input.budget==null || input.budget===''?null:Number(input.budget);
  requireValue(Number.isInteger(passengers) && bounded(passengers,1,9),'Jumlah penumpang harus 1–9.');
  requireValue(Number.isInteger(intervalMinutes) && bounded(intervalMinutes,15,1440),'Interval harus 15–1440 menit.');
  requireValue(budget===null || Number.isSafeInteger(budget) && budget>0,'Budget harus angka rupiah positif.');
  const cabin=input.cabin ?? 'ECONOMY', notification=input.notification ?? 'all';
  requireValue(['ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST'].includes(cabin),'Kelas tidak valid.');
  requireValue(['all','down','up','budget','amount','percent','daily'].includes(notification),'Mode notifikasi tidak valid.');
  const providers=input.providers ?? ['connected'];
  requireValue(Array.isArray(providers) && providers.length>0 && providers.length<=4 &&
    providers.every(value=>['connected','traveloka','tiket','amadeus','skyscanner','manual'].includes(value)),'Provider tidak valid.');
  const airlines=input.airlines ?? [];
  requireValue(Array.isArray(airlines) && airlines.length<=10 && airlines.every(value=>/^[A-Z0-9]{2}$/.test(value)),'Kode maskapai tidak valid.');
  const threshold=Number(input.threshold ?? 0);
  requireValue(bounded(threshold,0,1e12),'Batas notifikasi tidak valid.');
  requireValue(['any','included','none'].includes(input.baggage ?? 'any'),'Preferensi bagasi tidak valid.');
  return {route,mode,windowDays,date:mode==='specific'?input.date:null,start:mode==='range'?input.start:null,
    end:mode==='range'?input.end:null,trip,returnDate:trip==='roundtrip'?input.returnDate:null,
    passengers,cabin,budget,providers,airlines,nonstop:input.nonstop===true,baggage:input.baggage ?? 'any',
    intervalMinutes,notification,threshold};
}
export function normalizedOffer(input,watch,provider,now) {
  requireValue(input && date(input.date) && flightDates(watch,now).includes(input.date),'Tanggal penawaran di luar monitoring.');
  requireValue(input.from===watch.route.from && input.to===watch.route.to,'Rute penawaran berbeda.');
  requireValue(text(input.flight,100) && text(input.airline,100) && text(input.departure,100) &&
    text(input.arrival,100),'Identitas penerbangan belum lengkap.');
  requireValue(input.cabin===watch.cabin && input.passengers===watch.passengers,'Kondisi penumpang atau kelas berbeda.');
  requireValue(input.currency==='IDR' && Number.isSafeInteger(input.total) && input.total>0,'Harga total IDR harus positif.');
  requireValue(input.mandatoryFeesIncluded===true,'Harga harus menyertakan pajak dan biaya wajib yang diketahui.');
  requireValue(typeof input.baggage==='string' && input.baggage.length<=180,'Keterangan bagasi wajib.');
  requireValue(text(input.fare,180),'Identitas tarif wajib.');
  requireValue(Number.isSafeInteger(input.stops) && bounded(input.stops,0,4),'Jumlah transit tidak valid.');
  if (watch.nonstop) requireValue(input.stops===0,'Penawaran transit tidak sesuai preferensi.');
  if (watch.baggage==='included') requireValue(input.baggageIncluded===true,'Bagasi belum termasuk.');
  if (watch.airlines.length) requireValue(watch.airlines.includes(input.airlineCode),'Maskapai tidak sesuai preferensi.');
  requireValue((input.trip ?? 'oneway')===watch.trip &&
    (watch.trip!=='roundtrip' || input.returnDate===watch.returnDate && text(input.returnFlight,100)),'Data perjalanan pulang belum lengkap.');
  const result=Object.fromEntries(['from','to','date','flight','airline','airlineCode','departure','arrival','cabin','baggage',
    'passengers','fare','currency','total','mandatoryFeesIncluded','stops','baggageIncluded','returnFlight']
    .filter(key=>input[key]!==undefined).map(key=>[key,input[key]]));
  result.provider=provider; result.observedAt=now; result.watchId=watch.id;
  result.url=officialUrl(input.url) ?? null;
  result.returnDate=watch.returnDate;
  result.trip=watch.trip;
  result.key=hash([provider,result.from,result.to,result.date,result.flight,result.departure,result.arrival,
    result.cabin,result.baggage,result.passengers,result.fare,watch.trip,watch.returnDate,result.returnFlight ?? '']);
  return result;
}
function enqueue(state,kind,owner,revision,payload,now,key) {
  const id=hash([kind,owner,revision,key]);
  if (!state.outbox.some(item=>item.id===id))
    state.outbox.push({id,kind,owner,revision,payload,created:now,status:'pending',nextAt:now,attempts:0});
}
function log(state,module,operation,now,detail) {
  state.logs.push({id:randomUUID(),module,operation,at:now,detail});
  state.logs=state.logs.slice(-500);
}
function fenced(state,module,input,now) {
  const target=module==='leads'?state.leadSettings:state.watches.find(w=>w.id===input.id);
  requireValue(target && (module==='leads'?target.enabled:target.status==='active') &&
    target.revision===input.revision && target.lease?.token===input.lease && target.lease.until>now,
    'Job lama, dijeda, atau lease kedaluwarsa.');
  return target;
}
const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
export function automationOperation(current,input,now=Date.now()) {
  const state=structuredClone(current ?? initialAutomation());
  let result;
  if (!input || input.action==='view') return {state,result:automationView(state,now)};
  const module=input.module;
  if (input.action==='lead-config') {
    const cfg=state.leadSettings;
    for (const key of ['enabled','maxAgeHours','minScore','intervalMinutes','keywords','profile'])
      if (Object.hasOwn(input,key)) cfg[key]=input[key];
    requireValue(typeof cfg.enabled==='boolean' && bounded(cfg.maxAgeHours,.25,24) &&
      bounded(cfg.minScore,0,100) && Number.isInteger(cfg.minScore) &&
      Number.isInteger(cfg.intervalMinutes) && bounded(cfg.intervalMinutes,15,1440),'Pengaturan lead tidak valid.');
    requireValue(Array.isArray(cfg.keywords) && cfg.keywords.length<=20 && cfg.keywords.every(word=>text(word,100)),'Maksimal 20 kata kunci.');
    const profile=cfg.profile;
    requireValue(profile && typeof profile==='object' && !Array.isArray(profile),'Profil jasa tidak valid.');
    requireValue(Object.keys(profile).every(key=>['business','services','portfolio','contact','price','deposit','settlement','bugWarranty','revisions','tone'].includes(key)),'Kolom profil tidak dikenal.');
    requireValue(Object.entries(profile).every(([key,value])=>key==='services'?
      Array.isArray(value)&&value.length<=20&&value.every(item=>text(item,120)):
      typeof value==='string'&&value.length<=700),'Isi profil terlalu panjang.');
    cfg.revision++;cfg.lease=null;cfg.nextAt=now;result={ok:true,revision:cfg.revision};
  } else if (input.action==='watch-save') {
    const old=input.id?state.watches.find(w=>w.id===input.id):null;
    requireValue(!input.id || old,'Monitoring tidak ditemukan.');
    requireValue(old || state.watches.length<20,'Maksimal 20 monitoring.');
    const settings=flightWatch({...old,...input.config},now);
    const watch={...settings,id:old?.id ?? randomUUID(),revision:(old?.revision ?? 0)+1,
      status:old?.status ?? 'active',created:old?.created ?? now,nextAt:now,lastAt:old?.lastAt ?? null,
      lease:null,cursor:0};
    if (old) Object.assign(old,watch); else state.watches.push(watch);
    result={watch};
  } else if (input.action==='watch-route') {
    const old=state.watches.find(w=>w.id===input.id);
    requireValue(old && state.watches.length<20,'Monitoring tidak ditemukan atau batas tercapai.');
    const config=flightWatch({...old,route:input.route},now);
    old.status='stopped';old.revision++;old.lease=null;
    const watch={...config,id:randomUUID(),revision:1,status:'active',created:now,nextAt:now,lastAt:null,lease:null,cursor:0};
    state.watches.push(watch);result={watch};
  } else if (input.action==='watch-control') {
    const targets=input.id==='all'?state.watches:state.watches.filter(w=>w.id===input.id);
    requireValue(targets.length && ['pause','resume','stop','check','delete'].includes(input.control),'Kontrol monitoring tidak valid.');
    for (const watch of targets) {
      if (input.control==='check') { watch.nextAt=now; continue; }
      watch.revision++;watch.lease=null;
      watch.status={pause:'paused',resume:'active',stop:'stopped',delete:'deleted'}[input.control];
      watch.nextAt=now;
    }
    result={ok:true,count:targets.length};
  } else if (input.action==='lead-status') {
    const lead=state.leads.find(item=>item.id===input.id);
    requireValue(lead && leadStates.includes(input.status),'Status atau ID lead tidak valid.');
    lead.status=input.status; lead.activities.push({at:now,status:input.status});result={ok:true};
  } else if (input.action==='lead-candidate') {
    const rejection=validateLeadPublication(input.candidate,now,state.leadSettings.maxAgeHours);
    requireValue(!rejection,rejection ?? '');
    const candidate=input.candidate;
    requireValue(text(candidate.platform,70),'Nama platform wajib.');
    const normalized={url:officialUrl(candidate.url),text:candidate.text,publishedAt:candidate.publishedAt,
      publicationProof:candidate.publicationProof,dateEvidence:candidate.dateEvidence,
      platform:candidate.platform,group:typeof candidate.group==='string'?candidate.group.slice(0,160):''};
    if (candidate.regenerateId && state.leads.some(lead=>lead.id===candidate.regenerateId))
      normalized.regenerateId=candidate.regenerateId;
    state.candidates ??= [];
    if (!state.candidates.some(item=>item.url===normalized.url)) {
      requireValue(state.candidates.length<50,'Antrean analisis maksimum 50 postingan.');
      state.candidates.push(normalized);
    }
    result={queued:true,enabled:state.leadSettings.enabled};
  } else if (input.action==='lead-stage') {
    const target=fenced(state,'leads',input,now);
    requireValue(!validateLeadPublication(input.candidate,now,target.maxAgeHours),'Publikasi melewati batas.');
    target.pending=input.candidate;
    target.lease.until=now+120000;
    result={ok:true};
  } else if (input.action==='source-budget') {
    result=reserveSourceBudget(state,input,now);
  } else if (input.action==='usage') {
    state.usage ??= {};
    const day=wibDate(now);
    const key=day+':'+input.provider;
    requireValue(['amadeus','gemini'].includes(input.provider) && Number.isInteger(input.limit) &&
      bounded(input.limit,0,10000),'Batas penggunaan tidak valid.');
    result=(state.usage[key] ?? 0)<input.limit;
    if (result) state.usage[key]=(state.usage[key] ?? 0)+1;
    for (const key of Object.keys(state.usage)) if (key.slice(0,10)<wibDate(now-7*86400000)) delete state.usage[key];
  } else if (input.action==='claim') {
    const candidates=module==='leads'?(state.leadSettings.enabled?[state.leadSettings]:[]):
      state.watches.filter(w=>w.status==='active' && (!input.id || input.id===w.id))
        .sort((a,b)=>(a.lastAt ?? 0)-(b.lastAt ?? 0) || a.nextAt-b.nextAt);
    result=null;
    for (const target of candidates) {
      if (module!=='leads' && !flightDates(target,now).length) {
        target.status='completed';target.revision++;target.lease=null;continue;
      }
      if (target.nextAt>now || target.lease?.until>now) continue;
      target.lease={token:randomUUID(),until:now+120000};
      target.nextAt=now+target.intervalMinutes*60000;
      result={id:module==='leads'?'leads':target.id,revision:target.revision,lease:target.lease.token,
        config:structuredClone(target),profile:state.leadSettings.profile};break;
    }
    state.lastSchedulerAt=now;
  } else if (input.action==='lead-ingest') {
    const cfg=input.manual?state.leadSettings:fenced(state,'leads',input,now);
    const candidate=input.candidate;
    const rejection=validateLeadPublication(candidate,now,cfg.maxAgeHours);
    const analysis=validateLeadAnalysis(input.analysis);
    requireValue(!rejection,rejection ?? '');
    requireValue(analysis.intent==='buyer' && analysis.score>=cfg.minScore,'Lead bukan pembeli atau skor di bawah batas.');
    const url=officialUrl(candidate.url);
    const fingerprint=hash(candidate.text.toLocaleLowerCase('id').replace(/[^\p{L}\p{N}]/gu,''));
    const duplicate=state.leads.find(item=>item.url===url || item.fingerprint===fingerprint);
    if (duplicate) result={duplicate:true,id:duplicate.id};
    else {
      requireValue(text(candidate.platform,70),'Nama sumber wajib.');
      const lead={id:randomUUID(),url,fingerprint,text:candidate.text,platform:candidate.platform,
        group:typeof candidate.group==='string'?candidate.group.slice(0,160):'',publishedAt:candidate.publishedAt,
        publicationProof:candidate.publicationProof,dateEvidence:candidate.dateEvidence,
        analysis,status:'new',created:now,activities:[{at:now,status:'new'}]};
      state.leads.push(lead);result={id:lead.id};
      if (!input.manual) enqueue(state,'lead','leads',cfg.revision,{leadId:lead.id},now,lead.id);
    }
  } else if (input.action==='lead-comment') {
    if (input.lease) fenced(state,'leads',input,now);
    const lead=state.leads.find(item=>item.id===input.id);
    requireValue(lead && text(input.comment,700),'Draf komentar tidak valid.');
    lead.analysis.comment=input.comment;
    lead.activities.push({at:now,status:'comment-regenerated'});result={ok:true};
  } else if (input.action==='flight-ingest') {
    const watch=fenced(state,'flights',input,now);
    requireValue(['traveloka','tiket','amadeus','skyscanner','manual'].includes(input.provider),'Provider tidak valid.');
    requireValue(watch.providers.includes('connected') || watch.providers.includes(input.provider),'Provider di luar konfigurasi monitoring.');
    const alertKey=input.messageId?'price-alert:'+input.provider+':'+input.messageId:null;
    if (alertKey && state.commands.some(command=>command.key===alertKey)) return {state,result:{duplicate:true}};
    requireValue(Array.isArray(input.offers) && input.offers.length<=150,'Maksimal 150 penawaran per batch.');
    const offers=input.offers.map(offer=>normalizedOffer(offer,watch,input.provider,now));
    requireValue(new Set(offers.map(offer=>offer.key)).size===offers.length,'Duplikat penawaran dalam batch.');
    const activeDates=flightDates(watch,now);
    const priorOffers=state.offers.filter(offer=>offer.watchId===watch.id && offer.revision===watch.revision &&
      offer.available && activeDates.includes(offer.date));
    const previousMinima=Object.fromEntries(activeDates.map(day=>[day,Math.min(Infinity,...priorOffers.filter(row=>row.date===day).map(row=>row.total))]));
    const batch=[];
    for (const offer of offers) {
      const prior=state.offers.find(item=>item.watchId===watch.id && item.key===offer.key);
      if (prior && prior.total!==offer.total && prior.revision===watch.revision) {
        const delta=offer.total-prior.total, percent=delta/prior.total*100;
        const change={id:hash([watch.id,watch.revision,offer.key,prior.total,offer.total,prior.observedAt]),
          type:'price',at:now,watchId:watch.id,revision:watch.revision,previous:prior.total,total:offer.total,
          delta,percent,offer};
        state.changes.push(change);
        const budget=watch.budget!==null && offer.total<=watch.budget;
        const notify=watch.notification==='all' || watch.notification==='down'&&delta<0 ||
          watch.notification==='up'&&delta>0 || watch.notification==='budget'&&budget ||
          watch.notification==='amount'&&Math.abs(delta)>=watch.threshold ||
          watch.notification==='percent'&&Math.abs(percent)>=watch.threshold;
        if (notify) batch.push(change.id);
      } else if (!prior || prior.revision!==watch.revision) {
        state.changes.push({id:randomUUID(),type:'discovered',watchId:watch.id,revision:watch.revision,at:now,offer});
      }
      if (prior) Object.assign(prior,{...offer,revision:watch.revision,available:true});
      else state.offers.push({...offer,revision:watch.revision,available:true});
      state.snapshots.push({...offer,revision:watch.revision});
    }
    if (input.complete===true) {
      const dates=input.dates;
      requireValue(Array.isArray(dates) && dates.length<=90 && dates.every(day=>flightDates(watch,now).includes(day)),'Couverture tanggal tidak valid.');
      const seen=new Set(offers.map(offer=>offer.key));
      for (const offer of state.offers)
        if (offer.watchId===watch.id && offer.revision===watch.revision && offer.provider===input.provider &&
            dates.includes(offer.date) && offer.available && !seen.has(offer.key)) {
          offer.available=false;state.changes.push({id:randomUUID(),type:'unavailable',watchId:watch.id,
            revision:watch.revision,at:now,offer:structuredClone(offer)});
        }
    }
    if (batch.length) enqueue(state,'flight',watch.id,watch.revision,{changeIds:batch},now,batch);
    const latest=state.offers.filter(offer=>offer.watchId===watch.id && offer.revision===watch.revision &&
      offer.available && activeDates.includes(offer.date));
    const windowKey=activeDates.join(',');
    const dailyMinima=Object.fromEntries(activeDates.map(day=>[day,Math.min(Infinity,...latest.filter(row=>row.date===day).map(row=>row.total))]));
    for (const day of activeDates) if (Number.isFinite(previousMinima[day]) && Number.isFinite(dailyMinima[day]) &&
        previousMinima[day]!==dailyMinima[day])
      state.changes.push({id:randomUUID(),type:'daily-minimum',watchId:watch.id,revision:watch.revision,at:now,
        previous:previousMinima[day],total:dailyMinima[day],offer:latest.filter(row=>row.date===day).sort((a,b)=>a.total-b.total)[0]});
    const routeMin=latest.length?Math.min(...latest.map(row=>row.total)):null;
    if (watch.minimumWindow===windowKey && watch.minimum!==null && routeMin!==null && watch.minimum!==routeMin)
      state.changes.push({id:randomUUID(),type:'route-minimum',watchId:watch.id,revision:watch.revision,at:now,
        previous:watch.minimum,total:routeMin,offer:latest.find(row=>row.total===routeMin)});
    watch.minimumWindow=windowKey;watch.minimum=routeMin;
    watch.cursor=(watch.cursor+1)%Math.max(1,flightDates(watch,now).length);
    if (alertKey) state.commands.push({key:alertKey,at:now});
    result={observations:offers.length,priceChanges:batch.length};
  } else if (input.action==='finish') {
    const target=fenced(state,module,input,now);
    if(!input.deferred) target.lastAt=now;
    target.lease=null;
    if (module==='leads' && target.pending && !input.error) {
      state.candidates=(state.candidates ?? []).filter(item=>item.url!==target.pending.url);
      target.pending=null;
    }
    const source=String(input.source ?? 'automation').slice(0,70);
    state.sources[source]={state:input.deferred?'quota_wait':input.error?'error':'connected',lastAt:input.deferred?(state.sources[source]?.lastAt ?? null):now,
      error:input.error?String(input.error).slice(0,400):null,capability:input.capability ?? 'periodic'};
    if (input.deferred && Number.isSafeInteger(input.nextAt)) target.nextAt=Math.max(now+60000,input.nextAt);
    if (input.error) {
      target.failures=(target.failures ?? 0)+1;
      target.nextAt=now+Math.min(24*3600000,target.intervalMinutes*60000*2**Math.min(target.failures-1,6));
      if (target.failures===3) enqueue(state,'health',module==='leads'?'leads':target.id,target.revision,
        {source,message:state.sources[source].error},now,['failure',target.failures]);
    } else target.failures=0;
    log(state,module,'scan',now,{id:input.id,source,error:state.sources[source].error});
    result={ok:true};
  } else if (input.action==='source') {
    requireValue(text(input.source,70),'Source tidak valid.');
    state.sources[input.source]={state:input.state,error:String(input.reason ?? '').slice(0,400),
      capability:input.capability,lastAt:input.checked===true?now:(state.sources[input.source]?.lastAt ?? null)};result={ok:true};
  } else if (input.action==='discovery') {
    requireValue(Array.isArray(input.items) && input.items.length<=20,'Discovery terlalu besar.');
    state.discovery=input.items.filter(item=>officialUrl(item.url)).map(item=>({url:officialUrl(item.url),
      title:String(item.title ?? '').slice(0,250),reason:String(item.reason ?? '').slice(0,300),at:now}));
    result={ok:true};
  } else if (input.action==='daily-summary') {
    const day=wibDate(now);
    for (const watch of state.watches.filter(row=>row.status==='active' && row.notification==='daily' && row.summaryDay!==day)) {
      const changes=state.changes.filter(change=>change.watchId===watch.id && change.revision===watch.revision &&
        change.type==='price' && change.at>now-86400000);
      if (changes.length) enqueue(state,'flight',watch.id,watch.revision,{changeIds:changes.map(row=>row.id)},now,['daily',day]);
      watch.summaryDay=day;
    }
    result={ok:true};
  } else if (input.action==='outbox-claim') {
    result=null;
    for (const item of state.outbox) {
      if (item.status!=='pending' || item.nextAt>now) continue;
      const target=item.owner==='leads'?state.leadSettings:state.watches.find(w=>w.id===item.owner);
      const active=item.owner==='leads'?target?.enabled:target?.status==='active';
      if (!active || target.revision!==item.revision) { item.status='cancelled';continue; }
      if (item.kind==='lead') {
        const lead=state.leads.find(lead=>lead.id===item.payload.leadId);
        if (!lead || lead.status!=='new' || validateLeadPublication(lead,now,target.maxAgeHours)) {item.status='cancelled';continue;}
      }
      // Delivery is reserved before the HTTP request. Ambiguous requests need manual review.
      item.status='sending';item.attempts++;item.sentAt=now;result=structuredClone(item);break;
    }
  } else if (input.action==='outbox-finish') {
    const item=state.outbox.find(item=>item.id===input.id);
    requireValue(item?.status==='sending','Notifikasi tidak sedang dikirim.');
    item.status=input.cancelled?'cancelled':input.ok?'sent':input.rejected&&item.attempts<3?'pending':'uncertain';
    item.nextAt=now+Math.min(3600000,60000*2**item.attempts);result={ok:true};
  } else if (input.action==='command') {
    requireValue(text(input.key,140),'ID command tidak valid.');
    const prior=state.commands.find(command=>command.key===input.key);
    result=!prior;
    if (!prior) state.commands.push({key:input.key,at:now});
  } else throw new AutomationFault('Tindakan automation tidak dikenal.');
  if (!['view','claim','outbox-claim','outbox-finish','source','source-budget','discovery','finish','command','lead-ingest','flight-ingest','usage','lead-stage','daily-summary'].includes(input.action))
    log(state,module ?? (input.action.startsWith('lead')?'leads':'flights'),input.action,now,{id:input.id ?? null});
  state.commands=state.commands.filter(command=>command.at>now-7*86400000).slice(-5000);
  state.snapshots=state.snapshots.filter(row=>row.observedAt>now-180*86400000).slice(-20000);
  state.changes=state.changes.filter(row=>row.at>now-180*86400000).slice(-10000);
  state.leads=state.leads.filter(row=>row.created>now-180*86400000).slice(-2000);
  state.outbox=state.outbox.filter(row=>row.created>now-30*86400000).slice(-3000);
  return {state,result};
}
export function automationView(state,now) {
  const copy=structuredClone(state);
  copy.leadSettings.lease=copy.leadSettings.lease?.until>now?{until:copy.leadSettings.lease.until}:null;
  for (const watch of copy.watches) {watch.lease=watch.lease?.until>now?{until:watch.lease.until}:null;watch.dates=flightDates(watch,now);}
  copy.leads.sort((a,b)=>b.publishedAt-a.publishedAt);
  copy.stats={total:copy.leads.length,today:copy.leads.filter(l=>wibDate(l.created)===wibDate(now)).length,
    sixHours:copy.leads.filter(l=>now-l.publishedAt<=6*3600000).length,
    ...Object.fromEntries(leadStates.map(status=>[status,copy.leads.filter(lead=>lead.status===status).length]))};
  copy.now=now;
  return copy;
}
export function formatLead(lead,now) {
  return ['Pak, Jihan menemukan kebutuhan jasa.',
    lead.analysis.summary,'Kategori '+lead.analysis.category,
    lead.platform+(lead.group?' · '+lead.group:''),'Terbit '+new Date(lead.publishedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB',
    'Usia '+Math.floor((now-lead.publishedAt)/60000)+' menit · skor '+lead.analysis.score,
    lead.analysis.budget?'Budget '+lead.analysis.budget:'Budget belum disebutkan.',
    lead.url,'Draf komentar',lead.analysis.comment].join('\n');
}
export function formatFlight(watch,changes) {
  const message=['Pak, ada perubahan harga '+watch.route.from+' → '+watch.route.to+'.',...changes.slice(0,8).map(change=>{
    const offer=change.offer;
    return [offer.date+' · '+offer.airline+' '+offer.flight,offer.departure,
      money(change.previous)+' → '+money(change.total),
      (change.delta>0?'Naik ':'Turun ')+money(Math.abs(change.delta))+' ('+change.percent.toFixed(1)+'%)',
      offer.provider+' · '+offer.baggage,'Diperiksa '+new Date(change.at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB'].join('\n');
  }),changes.length>8?changes.length+' perubahan tersimpan di histori.':'',
  watch.minimum?'Harga termurah teramati saat ini '+money(watch.minimum)+'.':'',
  'Monitoring tetap aktif.'].filter(Boolean).join('\n\n');
  return message.slice(0,3550)+'\n\nHistori lengkap: https://anshel-virtual.vercel.app/automation.html';
}
