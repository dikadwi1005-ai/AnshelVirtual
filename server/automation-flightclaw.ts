import { AutomationFault, wibDate } from './automation-domain.ts';

const endpoint='https://n8n-s75gjxx8g8lx.jkt6.sumopod.my.id/webhook/anshel-flightclaw-search-v1';

export async function searchFlightClaw(store,env,watch,date,fetchImpl=fetch,now=Date.now()) {
  if (typeof env.N8N_TOKEN!=='string' || env.N8N_TOKEN.length<24)
    throw new AutomationFault('Koneksi FlightClaw belum tersedia.',503);
  if (!/^20\d\d-\d\d-\d\d$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0,10)!==date || date<wibDate(now) || Date.parse(date)>now+365*86400000)
    throw new AutomationFault('Tanggal keberangkatan harus valid dan dalam 365 hari ke depan.');
  if (watch.trip!=='oneway' || watch.cabin!=='ECONOMY' || watch.passengers!==1 || watch.nonstop ||
      watch.airlines.length || watch.baggage!=='any')
    throw new AutomationFault('Cek FlightClaw saat ini mendukung sekali jalan, satu dewasa, ekonomi, tanpa filter tambahan.');
  const budget=await store.automation({action:'source-budget',provider:'flightclaw',daily:20,monthly:300,gapMinutes:1});
  if (!budget.allowed) throw new AutomationFault('Cek FlightClaw sedang dibatasi. Coba lagi setelah '+new Date(budget.nextAt)
    .toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB.',429);
  const {from,to}=watch.route;
  let response;
  try {
    response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
      headers:{Authorization:'Bearer '+env.N8N_TOKEN,'Content-Type':'application/json'},
      body:JSON.stringify({origin:from,destination:to,date})});
  } catch { throw new AutomationFault('FlightClaw tidak merespons. Coba lagi sebentar.',503); }
  if (!response.ok) throw new AutomationFault('FlightClaw belum dapat memberikan hasil harga.',503);
  let data;
  try { data=await response.json(); } catch { throw new AutomationFault('Hasil FlightClaw tidak dapat dibaca.',503); }
  if (data.origin!==from || data.destination!==to || data.date!==date || !Array.isArray(data.offers))
    throw new AutomationFault('Hasil FlightClaw tidak cocok dengan pencarian.',503);
  const offers=data.offers.slice(0,5);
  if (offers.some(offer=>!Number.isFinite(offer.total) || offer.total<=0 || !/^[A-Z]{3}$/.test(offer.currency) ||
      typeof offer.airline!=='string' || offer.airline.length>100 || !Number.isInteger(offer.stops) || offer.stops<0 ||
      !/^\d\d:\d\d$/.test(offer.departure) || !/^\d\d:\d\d$/.test(offer.arrival)))
    throw new AutomationFault('Rincian tarif FlightClaw tidak valid.',503);
  if (!offers.length) return 'Pak, FlightClaw tidak menemukan penawaran '+from+' → '+to+' untuk '+date+'.';
  const price=offer=>new Intl.NumberFormat('id-ID',{style:'currency',currency:offer.currency}).format(offer.total);
  return ['Pak, ini hasil cek FlightClaw '+from+' → '+to+' pada '+date+' (sekali jalan, 1 dewasa, ekonomi).',
    ...offers.slice(0,3).map(offer=>price(offer)+' · '+offer.airline+' · '+offer.departure+'–'+offer.arrival+
      ' waktu setempat · '+(offer.stops?offer.stops+' transit':'nonstop')),
    'Total mencakup biaya pemesanan FlightClaw. Harga dan ketersediaan bisa berubah.'].join('\n');
}
