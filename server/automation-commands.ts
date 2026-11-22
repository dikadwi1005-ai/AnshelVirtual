import { AutomationFault, formatLead, flightDates, validateLeadPublication } from './automation-domain.ts';
import { analyzeLead, automationCapabilities } from './automation-providers.ts';
import { configuredOfficeBots, officeGroupConfig, sendOfficeBotMessage } from './telegram-office.ts';
import { flightKeyboard, leadKeyboard } from './automation-service.ts';

const leadSlash=/^\/(leads|cariklien|leadstatus|leadon|leadoff|leadconfig|leadreport|leadkeywords)(?:@\w+)?\b/i;
const flightSlash=/^\/(pantautiket|tiket|cektiket|gantirute|gantitanggal|rentangtiket|budgettiket|stoptiket|pausetiket|lanjuttiket|historitiket|tiketstatus|tiketmurah)(?:@\w+)?\b/i;
export function automationIntent(input) {
  if (leadSlash.test(input)) return 'leads';
  if (flightSlash.test(input)) return 'flights';
  if (/\bjihan\b/i.test(input) && /(?:klien|pelanggan|lead|postingan|cari(?:kan)? orang)/i.test(input)) return 'leads';
  if (/\balya\b/i.test(input) && /(?:tiket|penerbangan|rute|pantau|monitoring|rentang hari|tanggal|budget|harga berubah)/i.test(input)) return 'flights';
  return null;
}
const airports={surabaya:'SUB',batam:'BTH',jakarta:'CGK',bali:'DPS',denpasar:'DPS',medan:'KNO',yogyakarta:'YIA',
  makassar:'UPG',singapura:'SIN',singapore:'SIN',bandung:'BDO',balikpapan:'BPN',pekanbaru:'PKU'};
function routeIn(input) {
  const names=Object.keys(airports).join('|');
  const found=new RegExp('\\b('+names+'|[A-Z]{3})\\s*(?:ke|→|->|–|-)\\s*('+names+'|[A-Z]{3})\\b','i').exec(input) ??
    /\b([A-Z]{3})\s+([A-Z]{3})\b/.exec(input);
  if (!found) return null;
  return {from:airports[found[1].toLowerCase()] ?? found[1].toUpperCase(),
    to:airports[found[2].toLowerCase()] ?? found[2].toUpperCase()};
}
const months=['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
export function dateIn(input,now) {
  const iso=/\b(\d{4}-\d{2}-\d{2})\b/.exec(input);
  if (iso) return iso[1];
  const parts=new RegExp('\\b(\\d{1,2})\\s+('+months.join('|')+')(?:\\s+(20\\d{2}))?\\b','i').exec(input);
  if (!parts) return null;
  const wib=new Date(now+7*3600000);
  let year=parts[3]?Number(parts[3]):wib.getUTCFullYear();
  const month=months.indexOf(parts[2].toLowerCase());
  if (!parts[3] && month<wib.getUTCMonth()) year++;
  return year+'-'+String(month+1).padStart(2,'0')+'-'+parts[1].padStart(2,'0');
}
function budgetIn(input) {
  const match=/(?:budget|bawah|maksimal|maks|rp)\s*(\d[\d.,]*)\s*(ribu|rb|juta|jt)?/i.exec(input);
  if (!match) return null;
  const number=match[2]?Number(match[1].replace(',','.')):Number(match[1].replace(/[.,]/g,''));
  return Math.round(number*(/juta|jt/i.test(match[2] ?? '')?1000000:/ribu|rb/i.test(match[2] ?? '')?1000:1));
}
export function flightCommand(input,state) {
  const raw=input.toLowerCase();
  const command=flightSlash.exec(input)?.[1].toLowerCase();
  const route=routeIn(input);
  const changingRoute=command==='gantirute' || /ganti rute/.test(raw);
  const uuid=/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/i.exec(input)?.[0];
  const watches=state.watches.filter(w=>w.status!=='deleted' && (!uuid || w.id===uuid) &&
    (!route || changingRoute || w.route.from===route.from && w.route.to===route.to));
  const relevant=watches.filter(w=>w.status!=='stopped' && w.status!=='completed');
  const needsTarget=!(command==='pantautiket' || (!command && /pantau|monitor/i.test(raw) && route && !/ganti/.test(raw)));
  let watch=(relevant.length===1?relevant:watches.length===1?watches:[])[0];
  if (/terakhir/.test(raw)) watch=state.watches.filter(w=>w.status!=='deleted').at(-1);
  const defaults={route:route ?? {from:'SUB',to:'BTH'}};
  const create=command==='pantautiket' || !needsTarget;
  if (create) {
    const config={...defaults};
    const day=dateIn(input,state.now);
    if (day) Object.assign(config,{mode:'specific',date:day});
    const days=/\b(7|14|30|60|90)\s*hari/i.exec(input)?.[1];
    if (days) config.windowDays=Number(days);
    return {action:'watch-save',config};
  }
  if (['tiket','tiketstatus'].includes(command) || /status|daftar/.test(raw)) return {read:'status'};
  if (command==='stoptiket' && /semua/.test(raw) || /stop semua|hentikan semua/.test(raw))
    return {action:'watch-control',id:'all',control:'stop'};
  if (!watch) return {read:'choose'};
  if (command==='tiketmurah' || /paling murah|termurah/.test(raw)) return {read:'cheapest',id:watch.id};
  if (command==='historitiket' || /histori|riwayat/.test(raw)) return {read:'history',id:watch.id};
  if (command==='cektiket' || /cek harga sekarang|cek ulang/.test(raw)) return {action:'watch-control',id:watch.id,control:'check'};
  if (command==='stoptiket' || /stop|hentikan|berhenti/.test(raw)) return {action:'watch-control',id:watch.id,control:'stop'};
  if (command==='pausetiket' || /jeda|pause/.test(raw)) return {action:'watch-control',id:watch.id,control:'pause'};
  if (command==='lanjuttiket' || /lanjut|resume/.test(raw)) return {action:'watch-control',id:watch.id,control:'resume'};
  const config={};
  if (command==='gantirute' || /ganti rute/.test(raw)) {
    if (!route) throw new AutomationFault('Pak, sebutkan bandara asal dan tujuan.');
    // A route change creates a replacement atomically and invalidates old jobs.
    return {action:'watch-route',id:watch.id,route};
  }
  if (/jangan pakai tanggal|tanpa tanggal/.test(raw)) config.mode='rolling';
  const days=/\b(7|14|30|60|90)\s*(?:hari|$)/i.exec(input)?.[1];
  if (days) Object.assign(config,{mode:'rolling',windowDays:Number(days)});
  const day=dateIn(input,state.now);
  const range=[...input.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match=>match[0]);
  if (range.length>=2 && /sampai|hingga|s\.d\./.test(raw)) Object.assign(config,{mode:'range',start:range[0],end:range[1]});
  else if (day) Object.assign(config,{mode:'specific',date:day});
  const budget=budgetIn(input);
  if (budget!==null) Object.assign(config,{budget,notification:'budget'});
  if (/harga berubah|semua perubahan/.test(raw)) config.notification='all';
  if (/hanya.*turun/.test(raw)) config.notification='down';
  if (/hanya.*naik/.test(raw)) config.notification='up';
  if (/traveloka|tiket\.com/.test(raw)) config.providers=[
    ...(/traveloka/.test(raw)?['traveloka']:[]),...(/tiket\.com/.test(raw)?['tiket']:[])];
  if (!Object.keys(config).length) return {read:'status'};
  return {action:'watch-save',id:watch.id,config};
}
export async function handleAutomationMessage(store,env,data,fetchImpl=fetch,reservedCallback=false) {
  const module=automationIntent(data.text ?? '');
  if (!module) return null;
  const config=officeGroupConfig(env);
  if (String(data.chatId)!==config.chatId || String(data.userId)!==config.userId || data.isBot!==false)
    throw new AutomationFault('Pemilik Telegram tidak sesuai.',403);
  const division=module==='leads'?'marketing':'management';
  if (!configuredOfficeBots(env).configured.includes(division))
    throw new AutomationFault('Bot '+division+' belum terhubung.',503);
  if (!reservedCallback && !await store.reserveOfficeGroupUpdate(String(data.updateId))) return {mode:'skip',duplicate:true};
  let message,keyboard;
  try {
    const state=await store.automation();
    if (module==='leads') {
      const raw=data.text.toLowerCase(), command=leadSlash.exec(data.text)?.[1].toLowerCase();
      const off=command==='leadoff' || /berhenti|stop|hentikan|jeda/.test(raw);
      const on=command==='leadon' || /lanjut|aktifkan/.test(raw);
      if (off || on) {
        await store.automation({action:'lead-config',enabled:!off});
        message=off?'Pak, pencarian dihentikan. Job lama dan notifikasi tertunda dibatalkan.':
          'Pak, pencarian diaktifkan. Hasil hanya dikirim setelah publikasi asli dan sumber berhasil diverifikasi.';
      } else if (command==='cariklien' || /cari|fokus/.test(raw)) {
        const hours=/(\d+(?:[.,]\d+)?)\s*jam/.exec(raw)?.[1];
        const keywords=/automation/.test(raw)?['butuh automation','cari bot Telegram']:
          /android/.test(raw)?['butuh aplikasi Android','cari developer Android']:state.leadSettings.keywords;
        await store.automation({action:'lead-config',enabled:true,keywords,
          ...(hours?{maxAgeHours:Number(hours.replace(',','.'))}:{})});
        message='Pak, pencarian diantrekan untuk tick cloud berikutnya. Batas '+(hours ?? state.leadSettings.maxAgeHours)+
          ' jam dan skor minimal '+state.leadSettings.minScore+'. Status sumber dapat dilihat lewat /leadstatus.';
      } else if (command==='leadkeywords' && data.text.split(/\s/).length>1) {
        const keywords=data.text.replace(leadSlash,'').trim().split(',').map(value=>value.trim()).filter(Boolean);
        await store.automation({action:'lead-config',keywords});message='Pak, kata kunci tersimpan.';
      } else if (command==='leads') {
        const lead=state.leads.find(item=>!validateLeadPublication(item,state.now,state.leadSettings.maxAgeHours) && item.status==='new');
        if (lead) {message=formatLead(lead,state.now);keyboard=leadKeyboard(lead);}
        else message='Pak, belum ada lead baru dengan waktu publikasi asli terverifikasi dalam batas usia.';
      } else message='Pak, Lead Hunter '+(state.leadSettings.enabled?'aktif':'berhenti')+
        '. Batas usia '+state.leadSettings.maxAgeHours+' jam, interval '+state.leadSettings.intervalMinutes+
        ' menit, skor '+state.leadSettings.minScore+'.\nKata kunci '+state.leadSettings.keywords.join(', ')+
        '\n'+Object.entries(state.sources).map(([name,source])=>name+' · '+source.state+(source.error?' · '+source.error:'')).join('\n')+
        '\nProfil jasa dapat diedit di halaman Lead Hunter.';
    } else {
      const parsed=flightCommand(data.text,state);
      if (parsed.read) {
        const watches=state.watches.filter(w=>w.status!=='deleted');
        if (parsed.read==='choose') message='Pak, pilih monitoring dengan mencantumkan ID atau rute.\n'+watches.map(w=>
          w.id+' · '+w.route.from+' → '+w.route.to+' · '+w.status).join('\n');
        else if (['history','cheapest'].includes(parsed.read)) {
          const watch=watches.find(w=>w.id===parsed.id);
          const rows=(parsed.read==='history'?state.changes:state.offers).filter(row=>row.watchId===watch.id &&
            (parsed.read==='history' || row.revision===watch.revision && row.available && flightDates(watch,state.now).includes(row.date)));
          if (parsed.read==='cheapest') rows.sort((a,b)=>a.total-b.total);
          message='Pak, '+(parsed.read==='cheapest'?'penawaran terendah yang tersimpan':'riwayat monitoring')+'.\n'+
            ((parsed.read==='cheapest'?rows.slice(0,8):rows.slice(-8)).map(row=>{const offer=row.offer ?? row;return offer.date+' · '+offer.provider+' · Rp'+offer.total.toLocaleString('id-ID');}).join('\n') ||
              'Belum ada observasi tarif penerbangan spesifik.');
          if (parsed.read==='history') {
            const alerts=(state.flightEmail?.history ?? []).filter(alert=>alert.watchIds.includes(watch.id)).slice(-5);
            if (alerts.length) message+='\n\nPrice Alert email\n'+alerts.map(alert=>
              (alert.date ?? 'Semua tanggal')+' · '+alert.provider+' · '+
              new Intl.NumberFormat('id-ID',{style:'currency',currency:alert.currency}).format(alert.total)).join('\n');
          }
          keyboard=flightKeyboard(watch);
        } else message='Pak, monitoring tiket tersimpan.\n'+(watches.map(w=>w.id+'\n'+w.route.from+' → '+w.route.to+' · '+
          w.status+' · '+(w.mode==='rolling'?'rolling '+w.windowDays+' hari':w.mode)+'\n'+
          (w.lastAt?'Diperiksa '+new Date(w.lastAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'Belum diperiksa provider.')).join('\n\n') ||
          'Belum ada monitoring. Coba “Alya, pantau Surabaya ke Batam”.')+
          '\n'+Object.entries(state.sources).filter(([id])=>['traveloka','tiket','amadeus','skyscanner'].includes(id))
            .map(([id,item])=>id+' · '+item.state+' · '+(item.error ?? '')).join('\n');
      } else if (parsed.control==='check') {
        const watch=state.watches.find(w=>w.id===parsed.id);
        const skyscanner=automationCapabilities(env).flights.find(source=>source.id==='skyscanner');
        const canSchedule=watch.status==='active' && skyscanner.configured &&
          watch.providers.some(provider=>['connected','skyscanner'].includes(provider));
        if (canSchedule) await store.automation(parsed);
        const alert=(state.flightEmail?.history ?? []).filter(row=>row.watchIds.includes(watch.id))
          .sort((a,b)=>b.receivedAt-a.receivedAt)[0];
        const from=watch.route.from,to=watch.route.to;
        const url=from==='SUB' && to==='BTH'
          ? 'https://www.google.com/travel/flights/flights-from-surabaya-to-batam.html'
          : 'https://www.google.com/travel/flights?q='+encodeURIComponent('Flights from '+from+' to '+to);
        const price=alert && new Intl.NumberFormat('id-ID',{style:'currency',currency:alert.currency}).format(alert.total);
        const timestamp=alert && new Date(alert.receivedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
        message=['Pak, cek harga '+from+' → '+to+'.',
          canSchedule?'Cek API diminta untuk siklus berikutnya dan mengikuti kuota.':
            'Belum ada hasil cek harga langsung dari Anshel untuk monitoring ini.',
          alert?'Alert email terakhir: '+price+' · '+(alert.date ?? 'Semua tanggal')+' · '+timestamp+' WIB.':
            'Belum ada alert email tersimpan untuk monitoring ini.',
          'Gmail hanya memproses alert yang dikirim provider. Untuk harga sekarang, buka Google Flights.'].join('\n');
        keyboard={inline_keyboard:[[{text:'Cek harga sekarang di Google Flights',url}],...flightKeyboard(watch).inline_keyboard]};
      } else {
        const result=await store.automation(parsed);
        const watch=result.watch ?? state.watches.find(w=>w.id===parsed.id);
        message='Pak, perubahan monitoring sudah tersimpan.'+(watch?'\n'+watch.id+' · '+watch.route.from+' → '+watch.route.to+
          '\nMode '+watch.mode+(watch.mode==='rolling'?' '+watch.windowDays+' hari':''):'')+
          (parsed.control==='stop'?'\nPrice Tracking di akun Google Flights atau Traveloka tetap mengikuti pengaturan akunnya.':'')+
          '\nPemeriksaan harga mengikuti provider yang terhubung. /tiketstatus menampilkan kendalanya.';
        if (watch) keyboard=flightKeyboard(watch);
      }
    }
  } catch (error) {
    if (!(error instanceof AutomationFault)) throw error;
    message='Pak, '+error.message;
  }
  await sendOfficeBotMessage(env,division,message.slice(0,3700),{fetchImpl,replyMarkup:keyboard});
  return {mode:'handled',sent:true,division,automation:module};
}
export async function handleAutomationCallback(store,env,data,fetchImpl=fetch) {
  const {chatId,userId}=officeGroupConfig(env);
  if (String(data.chatId)!==chatId || String(data.userId)!==userId || !/^[a-zA-Z0-9_-]{1,150}$/.test(data.callbackId ?? ''))
    throw new AutomationFault('Callback bukan dari pemilik.',403);
  const match=/^avt:([lf]):([a-f0-9-]{36}):([a-z]+)$/.exec(data.data ?? '');
  if (!match) throw new AutomationFault('Callback tidak valid.');
  const module=match[1]==='l'?'leads':'flights',division=module==='leads'?'marketing':'management';
  const bot=configuredOfficeBots(env).parsed[division];
  if (bot) await fetchImpl('https://api.telegram.org/bot'+bot+'/answerCallbackQuery',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_query_id:data.callbackId}),
    signal:AbortSignal.timeout(2000),
  }).catch(()=>{});
  if (!await store.automation({action:'command',key:'callback:'+data.callbackId})) return {duplicate:true};
  const state=await store.automation(), id=match[2], action=match[3];
  let message='Pak, tindakan sudah tersimpan.';
  if (module==='leads') {
    if (action==='regenerate') {
      const lead=state.leads.find(lead=>lead.id===id);
      if (!lead) throw new AutomationFault('Lead tidak ditemukan.');
      if (env.GEMINI_API_KEY) {
        const analysis=await analyzeLead(lead,state.leadSettings.profile,env,fetchImpl);
        await store.automation({action:'lead-comment',id,comment:analysis.comment});message=analysis.comment;
      } else {
        await store.automation({action:'lead-candidate',candidate:{...lead,regenerateId:lead.id}});
        message='Pak, pembuatan ulang komentar diantrekan ke Gemini n8n.'+
          (state.leadSettings.enabled?'':' Aktifkan /leadon untuk menjalankan antrean.');
      }
    } else await store.automation({action:'lead-status',id,status:action});
  } else if (action==='check') {
    return handleAutomationMessage(store,env,{...data,text:'/cektiket '+id,isBot:false},fetchImpl,true);
  } else if (['pause','stop'].includes(action)) {
    await store.automation({action:'watch-control',id,control:action});
    if (action==='stop') message+=' Price Tracking di akun Google Flights atau Traveloka tetap mengikuti pengaturan akunnya.';
  } else {
    const prompts={route:'Alya, ganti rute SUB ke BTH ',dates:'Alya, fokus tanggal YYYY-MM-DD ',window:'Alya, pantau 30 hari ',
      budget:'Alya, budget 800 ribu ',history:'/historitiket ',cheapest:'/tiketmurah '};
    if (!prompts[action]) throw new AutomationFault('Kontrol tidak dikenali.');
    if (['history','cheapest'].includes(action))
      return handleAutomationMessage(store,env,{...data,text:prompts[action]+id,isBot:false},fetchImpl,true);
    message='Pak, kirim perubahan dengan ID monitoring ini.\n'+prompts[action]+id;
  }
  await sendOfficeBotMessage(env,division,message,{fetchImpl});
  return {ok:true};
}
