import { createHash } from 'node:crypto';
import { AutomationFault, flightDates } from './automation-domain.ts';
import { readProviderJson } from './automation-source-http.ts';

const endpoint='https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/';
const dateParts=day=>Object.fromEntries(['year','month','day'].map((key,i)=>[key,Number(day.split('-')[i])]));
function dateTime(value) {
  if(!value || !['year','month','day','hour','minute','second'].every(k=>Number.isInteger(value[k]))) return null;
  const stamp=String(value.year).padStart(4,'0')+'-'+String(value.month).padStart(2,'0')+'-'+String(value.day).padStart(2,'0')+
    'T'+String(value.hour).padStart(2,'0')+':'+String(value.minute).padStart(2,'0')+':'+String(value.second).padStart(2,'0');
  return Number.isFinite(Date.parse(stamp+'Z'))?stamp:null;
}
export function skyscannerPrice(price) {
  const divisor={PRICE_UNIT_WHOLE:1,PRICE_UNIT_MILLI:1000,PRICE_UNIT_MICRO:1000000}[price?.unit];
  const value=Number(price?.amount)/divisor;
  if(!divisor || !Number.isSafeInteger(value) || value<=0) throw new AutomationFault('Unit atau harga IDR Skyscanner tidak valid.',503);
  return value;
}
export function skyscannerOffers(data,watch,day,session) {
  const results=data?.content?.results;
  if(!results || !results.itineraries || !results.legs || !results.segments || !results.places || !results.carriers)
    throw new AutomationFault('Hasil Skyscanner belum lengkap atau format tidak sesuai.',503);
  const offers=[];
  for(const [itineraryId,itinerary] of Object.entries(results.itineraries)) {
    const legs=(itinerary.legIds ?? []).map(id=>results.legs[id]);
    if(legs.length!==(watch.trip==='roundtrip'?2:1) || legs.some(leg=>!leg))continue;
    const outbound=legs[0],segments=(outbound.segmentIds ?? []).map(id=>results.segments[id]);
    if(!segments.length || segments.some(segment=>!segment))continue;
    const from=results.places[outbound.originPlaceId]?.iata,to=results.places[outbound.destinationPlaceId]?.iata;
    if(from!==watch.route.from || to!==watch.route.to || watch.nonstop && outbound.stopCount!==0)continue;
    const carrier=results.carriers[segments[0].marketingCarrierId];
    if(!carrier?.iata || watch.airlines.length && !watch.airlines.includes(carrier.iata))continue;
    const flight=items=>items.map(s=>(results.carriers[s.marketingCarrierId]?.iata ?? '')+s.marketingFlightNumber).join('/');
    const departure=dateTime(outbound.departureDateTime),arrival=dateTime(outbound.arrivalDateTime);
    if(!departure?.startsWith(day) || !arrival)continue;
    const returning=legs[1]?(legs[1].segmentIds ?? []).map(id=>results.segments[id]):[];
    if(legs[1] && (!returning.length || returning.some(s=>!s) || !dateTime(legs[1].departureDateTime)?.startsWith(watch.returnDate)))continue;
    for(const option of itinerary.pricingOptions ?? []) {
      // Split-ticket packages have distinct fees/conditions and are not treated as one fare.
      if(option.items?.length!==1 || !option.items[0].deepLink)continue;
      const details=option.pricingOptionFare ?? {},bag=details.checkedBaggage;
      const included=bag?.assessment==='ASSESSMENT_INCLUDED';
      if(watch.baggage==='included' && !included)continue;
      const brands=details.brandNames ?? [];
      const comparable=brands.length>0 && bag && bag.assessment!=='ASSESSMENT_UNKNOWN' && bag.assessment!=='ASSESSMENT_UNSPECIFIED';
      const signature=comparable?JSON.stringify([option.agentIds,brands,details.advanceChange,details.cancellation,
        returning.map(s=>[dateTime(s.departureDateTime),dateTime(s.arrivalDateTime)])]):
        'unknown-fare-'+session+'-'+itineraryId+'-'+option.id;
      const fare=(comparable?'verified:':'unverified:')+createHash('sha256').update(signature).digest('hex').slice(0,32);
      let total;try {total=skyscannerPrice(option.price);}catch {continue;}
      offers.push({from,to,date:day,flight:flight(segments),airline:carrier.name ?? carrier.iata,airlineCode:carrier.iata,
        departure,arrival,cabin:watch.cabin,passengers:watch.passengers,fare,
        baggage:bag?JSON.stringify(bag).slice(0,180):'Bagasi belum diketahui',baggageIncluded:included,
        currency:'IDR',total,mandatoryFeesIncluded:true,stops:outbound.stopCount,
        trip:watch.trip,returnDate:watch.returnDate,returnFlight:legs[1]?flight(returning):undefined,url:option.items[0].deepLink});
      if(offers.length>=150) return offers;
    }
  }
  return offers;
}
export async function fetchSkyscannerOffers(watch,env,reserve,fetchImpl=fetch,now=Date.now()) {
  if(!env.SKYSCANNER_API_KEY || env.SKYSCANNER_MONITORING_ALLOWED!=='true' || env.SKYSCANNER_STORAGE_ALLOWED!=='true' ||
      !watch.providers.some(id=>['connected','skyscanner'].includes(id)))
    throw new AutomationFault('Skyscanner belum memiliki key dan izin partner untuk monitoring/histori. Amadeus Self-Service sudah ditutup.',503);
  if(typeof reserve!=='function') throw new AutomationFault('Reservasi kuota persisten diperlukan.',503);
  const monthly=Number(env.SKYSCANNER_MONTHLY_LIMIT ?? 0),daily=Number(env.SKYSCANNER_DAILY_LIMIT ?? 0);
  const budget=await reserve('skyscanner',{monthly,daily,gapMinutes:60,cost:2});
  if(!budget.allowed) return {deferred:true,...budget};
  const days=flightDates(watch,now).filter(day=>!watch.returnDate || day<=watch.returnDate),day=days[(watch.cursor ?? 0)%days.length];
  if(!day)throw new AutomationFault('Tidak ada tanggal keberangkatan sebelum tanggal pulang.',409);
  const leg=(from,to,date)=>({originPlaceId:{iata:from},destinationPlaceId:{iata:to},date:dateParts(date)});
  const query={market:'ID',locale:'id-ID',currency:'IDR',adults:watch.passengers,childrenAges:[],
    cabinClass:'CABIN_CLASS_'+watch.cabin,nearbyAirports:false,includeBaggageData:true,
    queryLegs:[leg(watch.route.from,watch.route.to,day),...(watch.returnDate?[leg(watch.route.to,watch.route.from,watch.returnDate)]:[])]};
  const request=async(path,body)=>readProviderJson(await fetchImpl(endpoint+path,{method:'POST',redirect:'error',
    headers:{'x-api-key':env.SKYSCANNER_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(10000)}));
  let data=await request('create',{query});const session=data.sessionToken;
  if(typeof session!=='string' || !/^[a-zA-Z0-9._~-]{1,1000}$/.test(session))throw new AutomationFault('Session Skyscanner tidak valid.',503);
  if(data.status==='RESULT_STATUS_INCOMPLETE') {
    const poll=await request('poll/'+encodeURIComponent(session),{});
    if(poll.action==='RESULT_ACTION_REPLACED')data=poll;
    else if(poll.action==='RESULT_ACTION_NOT_MODIFIED')data={...data,status:poll.status};
    else {
      const merged={...data.content?.results};
      for(const key of ['itineraries','legs','segments','places','carriers','agents'])
        merged[key]={...merged[key],...poll.content?.results?.[key]};
      data={...poll,content:{results:merged}};
    }
  }
  if(!['RESULT_STATUS_COMPLETE','RESULT_STATUS_INCOMPLETE'].includes(data.status))throw new AutomationFault('Status pencarian Skyscanner tidak valid.',503);
  const offers=skyscannerOffers(data,watch,day,session);
  if(!offers.length && Object.keys(data.content?.results?.itineraries ?? {}).length)
    throw new AutomationFault('Belum ada penawaran dengan kondisi tarif lengkap yang sesuai.',503);
  // Bounded create + one poll; partial/filtered results never prove a flight disappeared.
  return {provider:'skyscanner',offers,dates:[day],complete:false};
}
