import { AutomationFault, formatFlight, formatLead, validateLeadAnalysis, validateLeadPublication } from './automation-domain.ts';
import { analyzeLead, automationCapabilities, fetchFlightOffers, geminiAnalysis, leadAnalysisRequest } from './automation-providers.ts';
import { configuredOfficeBots, sendOfficeBotMessage } from './telegram-office.ts';
import { discoverBudgetedLeads } from './automation-lead-sources.ts';
import { formatFlightEmail, parseGmailFlightAlert } from './automation-flight-email.ts';

const ownerActions=new Set(['view','lead-config','lead-status','lead-candidate','watch-save','watch-route','watch-control']);
export async function ownerAutomationAction(store,input,env) {
  if (!ownerActions.has(input?.action ?? 'view')) throw new AutomationFault('Tindakan ini hanya untuk worker.',403);
  const result=await store.automation(input);
  return input?.action && input.action!=='view'?result:{...result,capabilities:automationCapabilities(env)};
}
export async function officeAutomationWork(store,office) {
  const state=await store.automationActivity();
  const jobs={};
  const lead=state.leadSettings;
  if (lead?.enabled && lead.lease?.until>office.now)
    jobs.marketing={kind:lead.pending?'Analisis calon pelanggan':'Pencarian calon pelanggan',until:lead.lease.until};
  const flight=state.watches.find(watch=>watch.status==='active' && watch.lease?.until>office.now);
  if (flight) jobs.management={kind:'Memeriksa tiket '+flight.route.from+' → '+flight.route.to,until:flight.lease.until};
  const people={...office.people};
  for (const [division,job] of Object.entries(jobs)) {
    if (people[division]?.executing) continue;
    people[division]={...people[division],activity:'work',executing:true,taskLock:true,
      task:{id:'automation-'+division,status:'running',kind:'automation',description:job.kind}};
  }
  return {...office,people,automationWork:jobs};
}
const safeError=error=>error instanceof AutomationFault?error.message:'Provider gagal atau melewati batas waktu. Periksa konfigurasi dan execution n8n.';
export async function finishLeadAnalysis(store,job,payload) {
  const state=await store.automation();
  const pending=state.leadSettings.pending;
  if (!pending) throw new AutomationFault('Tidak ada postingan yang menunggu analisis.',409);
  let analysis;
  try { analysis=validateLeadAnalysis(geminiAnalysis(payload)); }
  catch (error) {
    await store.automation({action:'finish',module:'leads',...job,source:'gemini',error:safeError(error)});
    return {blocked:true,reason:safeError(error)};
  }
  let result={ignored:true,reason:analysis.intent};
  if (pending.regenerateId) {
    result=await store.automation({action:'lead-comment',...job,id:pending.regenerateId,comment:analysis.comment});
  } else if (analysis.intent==='buyer' && analysis.score>=state.leadSettings.minScore)
    result=await store.automation({action:'lead-ingest',...job,candidate:pending,analysis});
  await store.automation({action:'finish',module:'leads',...job,source:'gemini',capability:'periodic'});
  return result;
}
async function leadTick(store,env,fetchImpl) {
  const job=await store.automation({action:'claim',module:'leads'});
  if (!job) return null;
  let source='lead-discovery';
  try {
    const snapshot=await store.automation();
    const manual=(snapshot.candidates ?? []).filter(item=>!validateLeadPublication(item,Date.now(),job.config.maxAgeHours))
      .sort((a,b)=>b.publishedAt-a.publishedAt)[0];
    const found=manual?{source:'manual',candidates:[manual]}:await discoverBudgetedLeads(job.config,env,
      (provider,plan)=>store.automation({action:'source-budget',provider,...plan}),fetchImpl);
    source=found.source;
    for(const status of found.statuses ?? []) await store.automation({action:'source',...status,
      checked:status.state==='connected' || status.state==='error',capability:status.source==='freelancer'?'periodic':'discovery'});
    if (found.unverified) await store.automation({action:'discovery',items:found.unverified});
    const candidate=found.candidates.find(post=>post.regenerateId || !snapshot.leads.some(lead=>lead.url===post.url));
    if (!candidate) {
      await store.automation({action:'finish',module:'leads',...job,source,deferred:found.deferred,nextAt:found.nextAt,
        error:found.error,capability:found.unverified?'discovery':'periodic'});
      return {mode:'idle',source,unverified:found.unverified?.length ?? 0};
    }
    if (!await store.automation({action:'usage',provider:'gemini',limit:Number(env.LEAD_AI_DAILY_LIMIT ?? 12)}))
      throw new AutomationFault('Batas analisis Gemini harian tercapai.',429);
    await store.automation({action:'lead-stage',...job,candidate});
    if (!env.GEMINI_API_KEY) return {mode:'analyze',job:{id:job.id,revision:job.revision,lease:job.lease},
      request:leadAnalysisRequest(candidate,job.profile)};
    const analysis=validateLeadAnalysis(await analyzeLead(candidate,job.profile,env,fetchImpl));
    let saved={ignored:true};
    if (analysis.intent==='buyer' && analysis.score>=job.config.minScore)
      saved=await store.automation({action:'lead-ingest',...job,candidate,analysis});
    await store.automation({action:'finish',module:'leads',...job,source:'gemini'});
    return {mode:'saved',...saved};
  } catch (error) {
    await store.automation({action:'finish',module:'leads',...job,source,error:safeError(error)}).catch(()=>{});
    return {mode:'blocked',reason:safeError(error)};
  }
}
async function flightTick(store,env,fetchImpl) {
  const job=await store.automation({action:'claim',module:'flights'});
  if (!job) return null;
  const source='skyscanner';
  try {
    const capability=automationCapabilities(env).flights.find(row=>row.id===source);
    if(!capability.configured) {
      await store.automation({action:'finish',module:'flights',...job,source,deferred:true,nextAt:Date.now()+3600000,capability:'not-configured'});
      return {mode:'blocked',reason:capability.reason};
    }
    const data=await fetchFlightOffers(job.config,env,fetchImpl,Date.now(),
      (provider,plan)=>store.automation({action:'source-budget',provider,...plan}));
    if(data.deferred) {
      await store.automation({action:'finish',module:'flights',...job,source,deferred:true,nextAt:data.nextAt});
      return {mode:'deferred',reason:data.reason,nextAt:data.nextAt};
    }
    const result=await store.automation({action:'flight-ingest',...job,...data});
    await store.automation({action:'finish',module:'flights',...job,source,capability:'periodic'});
    return result;
  } catch (error) {
    await store.automation({action:'finish',module:'flights',...job,source,error:safeError(error)}).catch(()=>{});
    return {mode:'blocked',reason:safeError(error)};
  }
}
function callback(module,id,action) { return {text:action,callback_data:'avt:'+module+':'+id+':'+action}; }
export function leadKeyboard(lead) {
  return {inline_keyboard:[
    [{text:'Buka postingan',url:lead.url}],
    [{text:'Salin komentar',copy_text:{text:lead.analysis.comment.slice(0,256)}}],
    [callback('l',lead.id,'commented'),callback('l',lead.id,'negotiating')],
    [callback('l',lead.id,'deal'),callback('l',lead.id,'skipped'),callback('l',lead.id,'irrelevant')],
    [callback('l',lead.id,'regenerate')],
  ]};
}
export function flightKeyboard(watch,offer) {
  return {inline_keyboard:[
    ...(offer?.url?[[{text:'Lihat penawaran',url:offer.url}]]:[]),
    [callback('f',watch.id,'check'),callback('f',watch.id,'history'),callback('f',watch.id,'cheapest')],
    [callback('f',watch.id,'route'),callback('f',watch.id,'dates'),callback('f',watch.id,'window')],
    [callback('f',watch.id,'budget'),callback('f',watch.id,'pause'),callback('f',watch.id,'stop')],
  ]};
}
export async function deliverAutomationNotifications(store,env,fetchImpl=fetch) {
  const connected=configuredOfficeBots(env).configured;
  let sent=0;
  for (let i=0;i<3;i++) {
    const item=await store.automation({action:'outbox-claim'});
    if (!item) break;
    const division=item.kind==='lead'?'marketing':item.kind==='health'?'operations':'management';
    if (!connected.includes(division)) {
      await store.automation({action:'outbox-finish',id:item.id,ok:false,rejected:true});continue;
    }
    try {
      const state=await store.automation();
      const target=item.owner==='leads'?state.leadSettings:state.watches.find(watch=>watch.id===item.owner);
      const active=item.owner==='leads'?target?.enabled:target?.status==='active';
      if (!active || target.revision!==item.revision) {
        await store.automation({action:'outbox-finish',id:item.id,cancelled:true});continue;
      }
      let message,keyboard;
      if (item.kind==='lead') {
        const lead=state.leads.find(row=>row.id===item.payload.leadId);
        if (!lead || lead.status!=='new' || validateLeadPublication(lead,state.now,target.maxAgeHours)) {
          await store.automation({action:'outbox-finish',id:item.id,cancelled:true});continue;
        }
        message=formatLead(lead,state.now); keyboard=leadKeyboard(lead);
      } else if (item.kind==='flight') {
        const watch=state.watches.find(row=>row.id===item.owner);
        const changes=state.changes.filter(change=>item.payload.changeIds.includes(change.id));
        message=formatFlight(watch,changes);keyboard=flightKeyboard(watch,changes[0]?.offer);
      } else if (item.kind==='flight-email') {
        const watch=state.watches.find(row=>row.id===item.owner);
        message=formatFlightEmail(item.payload.alert);
        keyboard=flightKeyboard(watch,item.payload.alert);
      } else message='Pak, Bima mencatat kendala automation.\n'+item.payload.source+'\n'+item.payload.message;
      await sendOfficeBotMessage(env,division,message,{fetchImpl,replyMarkup:keyboard});
      await store.automation({action:'outbox-finish',id:item.id,ok:true});sent++;
    } catch (error) {
      await store.automation({action:'outbox-finish',id:item.id,ok:false,rejected:error.deliveryRejected===true});
    }
  }
  return sent;
}
export async function runOfficeAutomation(store,env,fetchImpl=fetch) {
  const capabilities=automationCapabilities(env);
  for (const item of [...capabilities.leads,...capabilities.flights])
    if (!item.configured) await store.automation({action:'source',source:item.id,state:'not_configured',reason:item.reason,capability:item.mode});
  // Work is independent of office phase, holidays and avatar presence.
  const flights=await flightTick(store,env,fetchImpl);
  const leads=await leadTick(store,env,fetchImpl);
  if (new Date(Date.now()+7*3600000).getUTCHours()>=20)
    await store.automation({action:'daily-summary'});
  const notified=await deliverAutomationNotifications(store,env,fetchImpl);
  return {flights,leads,notified};
}
export async function ingestPriceAlert(store,env,input) {
  if (env.FLIGHT_ALERT_INTAKE_ENABLED!=='true') throw new AutomationFault('Penerusan Price Alert belum diaktifkan.',503);
  const domain={traveloka:'traveloka.com',tiket:'tiket.com'}[input.provider];
  if (!domain || input.dkimDomain!==domain || input.authenticationResults!=='dkim=pass' ||
      !new RegExp('@(?:[a-z0-9-]+\\.)*'+domain.replace('.','\\.')+'$','i').test(input.sender ?? '') ||
      typeof input.messageId!=='string' || input.messageId.length>150)
    throw new AutomationFault('Pengirim atau autentikasi Price Alert tidak terverifikasi.',403);
  const state=await store.automation();
  const watch=state.watches.find(watch=>watch.id===input.id && watch.status==='active' && watch.revision===input.revision);
  if (!watch || watch.mode!=='specific') throw new AutomationFault('Price Alert hanya dapat dipasangkan pada monitoring tanggal spesifik aktif.',409);
  const claim=await store.automation({action:'claim',module:'flights',id:watch.id});
  if (!claim || claim.id!==watch.id) throw new AutomationFault('Monitoring sedang menunggu interval atau diproses.',409);
  try {
    const result=await store.automation({action:'flight-ingest',...claim,provider:input.provider,offers:input.offers,
      messageId:input.messageId,complete:false});
    await store.automation({action:'finish',module:'flights',...claim,source:input.provider,capability:'email-alert'});
    return result;
  } catch (error) {
    await store.automation({action:'finish',module:'flights',...claim,source:input.provider,error:'Format alert ditolak.'}).catch(()=>{});
    throw error;
  }
}

export async function ingestGmailFlightAlert(store,env,input,fetchImpl=fetch) {
  if (input.test === true || input.message?.payload?.headers?.some?.(header =>
    header?.name?.toLowerCase()==='subject' && /^\s*\[test\]/i.test(header.value))) {
    throw new AutomationFault('Fixture TEST tidak diterima di intake Gmail.',400);
  }
  if (input.poll==='connected' || input.poll==='error') {
    return store.automation({action:'flight-email',poll:input.poll});
  }
  const outcome=parseGmailFlightAlert(input.message,Date.now());
  const result=await store.automation({action:'flight-email',...outcome,replay:input.replay===true});
  if (result.status==='queued') await deliverAutomationNotifications(store,env,fetchImpl);
  return result;
}
