import { createHash } from 'node:crypto';
import { AutomationFault } from './automation-domain.ts';
import { configuredOfficeBots } from './telegram-office.ts';

const origin='https://n8n-s75gjxx8g8lx.jkt6.sumopod.my.id';
const office='https://anshel-virtual.vercel.app';
export function automationWorkflow(headerCredentials,geminiCredentials,geminiUrl) {
  const http=(id,name,path,position,body,credentials=headerCredentials)=>({
    id,name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position,credentials,
    parameters:{method:'POST',url:path,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
      sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:45000}},
  });
  const nodes=[
    {id:'avt-auto-clock',name:'Tiap 15 menit · 24 jam WIB',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,
      position:[0,0],parameters:{rule:{interval:[{field:'cronExpression',expression:'*/15 * * * *'}]}}},
    {id:'avt-auto-manual',name:'Pemeriksaan manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,160],parameters:{}},
    http('avt-auto-tick','Antrean, rolling, provider dan outbox',office+'/api/integrations/automation/tick',[240,0],'={{ JSON.stringify({}) }}'),
    {id:'avt-auto-filter',name:'Hanya analisis yang berizin',type:'n8n-nodes-base.code',typeVersion:2,position:[480,0],parameters:{
      jsCode:"const task=$input.first().json.leads; if(task?.mode!=='analyze') return []; return [{json:task}];"}},
    {...http('avt-auto-gemini','Gemini · Jihan',geminiUrl,[720,0],'={{ JSON.stringify($json.request) }}',geminiCredentials),
      onError:'continueRegularOutput'},
    http('avt-auto-save','Validasi dan simpan hasil',office+'/api/integrations/automation/lead-result',[960,0],
      "={{ JSON.stringify({job: $('Hanya analisis yang berizin').first().json.job,response: $json.body || $json}) }}"),
  ];
  const connection=(to)=>({main:[[{node:to,type:'main',index:0}]]});
  return {name:'Anshel · Lead Hunter + Flight Tracker · 24 jam',nodes,connections:{
    [nodes[0].name]:connection(nodes[2].name),[nodes[1].name]:connection(nodes[2].name),
    [nodes[2].name]:connection(nodes[3].name),[nodes[3].name]:connection(nodes[4].name),
    [nodes[4].name]:connection(nodes[5].name)},settings:{executionOrder:'v1',timezone:'Asia/Jakarta',
      saveDataSuccessExecution:'none',saveDataErrorExecution:'all',executionTimeout:150}};
}
export async function setupAutomationScheduler(env,{activate=false}={},fetchImpl=fetch) {
  if (env.N8N_MONITOR_BASE_URL!==origin || !env.N8N_MONITOR_API_KEY)
    throw new AutomationFault('Akses API n8n existing belum dikonfigurasi.',503);
  async function request(path,method='GET',body) {
    const response=await fetchImpl(origin+'/api/v1/'+path,{method,headers:{
      'X-N8N-API-KEY':env.N8N_MONITOR_API_KEY,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!response.ok) {
      await response.body?.cancel();throw new AutomationFault('n8n API '+method+' ditolak (HTTP '+response.status+'). Periksa scope API existing.',503);
    }
    return response.json();
  }
  const all=await request('workflows?limit=100');
  const group=all.data?.find(row=>row.id===env.N8N_MONITOR_WORKFLOW_ID);
  if (!group) throw new AutomationFault('Workflow Telegram existing tidak ditemukan.',503);
  const actual=await request('workflows/'+group.id);
  const header=actual.nodes.find(node=>node.parameters?.url===office+'/api/integrations/office-group/ai/prepare')?.credentials;
  const gemini=actual.nodes.find(node=>node.parameters?.url?.startsWith('https://generativelanguage.googleapis.com/'));
  if (!header?.httpHeaderAuth || !gemini?.credentials?.httpHeaderAuth ||
      !/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-[a-z0-9.-]+:generateContent$/.test(gemini.parameters.url))
    throw new AutomationFault('Referensi credential atau model Gemini existing belum tersedia.',503);
  const workflow=automationWorkflow(header,gemini.credentials,gemini.parameters.url);
  const existing=all.data.filter(row=>row.name===workflow.name);
  if (existing.length>1) throw new AutomationFault('Ada duplikasi workflow automation. Periksa n8n sebelum aktivasi.',409);
  let saved,backup;
  try {
  if (existing[0]) {
    const current=await request('workflows/'+existing[0].id);
    backup=current;
    if (current.active && !activate) return {id:current.id,active:true,changed:false};
    if (current.active) await request('workflows/'+current.id+'/deactivate','POST');
    saved=await request('workflows/'+current.id,'PUT',workflow);
  } else saved=await request('workflows','POST',workflow);
  if (activate) {
    await request('workflows/'+saved.id+'/activate','POST');
    const verified=await request('workflows/'+saved.id);
    if (!verified.active) throw new AutomationFault('n8n belum melaporkan workflow aktif.',503);
  }
  return {id:saved.id,active:activate,changed:true};
  } catch (error) {
    if (backup) {
      const restored={name:backup.name,nodes:backup.nodes,connections:backup.connections,settings:backup.settings};
      await request('workflows/'+backup.id,'PUT',restored).catch(()=>{});
      if (backup.active) await request('workflows/'+backup.id+'/activate','POST').catch(()=>{});
    }
    throw error;
  }
}

export const callbackSecret=(env,division)=>createHash('sha256').update(env.N8N_TOKEN+'|automation-callback|'+division).digest('hex');

export async function configureAutomationCallbacks(env,fetchImpl=fetch) {
  const bots=configuredOfficeBots(env);
  const token=bots.parsed.marketing;
  if (!token) throw new AutomationFault('Bot Jihan belum terhubung.',503);
  const api='https://api.telegram.org/bot'+token;
  const current=await (await fetchImpl(api+'/getWebhookInfo',{signal:AbortSignal.timeout(5000)})).json();
  if (!current.ok) throw new AutomationFault('Status webhook Jihan belum dapat diverifikasi.',503);
  const expected=office+'/api/telegram-automation/marketing';
  if (current.result.url && current.result.url!==expected)
    throw new AutomationFault('Bot Jihan sudah mempunyai webhook. Integrasikan callback di workflow itu sebelum mengganti webhook.',409);
  const response=await fetchImpl(api+'/setWebhook',{method:'POST',headers:{'Content-Type':'application/json'},
    signal:AbortSignal.timeout(5000),body:JSON.stringify({url:expected,allowed_updates:['callback_query'],
      secret_token:callbackSecret(env,'marketing'),drop_pending_updates:false})});
  if (!(await response.json()).ok) throw new AutomationFault('Webhook callback Jihan ditolak.',503);
  return {division:'marketing',callbackConfigured:true};
}

export async function prepareAlyaCallbackWorkflow(env,fetchImpl=fetch) {
  if (env.N8N_MONITOR_BASE_URL!==origin || !env.N8N_MONITOR_API_KEY || !/^[\w-]{1,80}$/.test(env.N8N_MONITOR_WORKFLOW_ID ?? ''))
    throw new AutomationFault('Akses workflow grup existing belum tersedia.',503);
  const endpoint=origin+'/api/v1/workflows/'+env.N8N_MONITOR_WORKFLOW_ID;
  const request=async (suffix='',method='GET',body)=>{
    const response=await fetchImpl(endpoint+suffix,{method,headers:{'X-N8N-API-KEY':env.N8N_MONITOR_API_KEY,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000),redirect:'error'});
    if (!response.ok) { await response.body?.cancel();throw new AutomationFault('Workflow callback API HTTP '+response.status,503); }
    return response.json();
  };
  const original=await request();
  const trigger=original.nodes.filter(node=>node.type==='n8n-nodes-base.telegramTrigger');
  const gate=original.nodes.find(node=>node.name==='Saring pesan manusia' && node.type==='n8n-nodes-base.code');
  if (trigger.length!==1 || !gate || !gate.parameters.jsCode.includes('update.message'))
    throw new AutomationFault('Struktur trigger Telegram telah berubah. Integrasi callback memerlukan pemeriksaan.',409);
  if (gate.parameters.jsCode.includes('avt:callback-bridge')) return {id:original.id,configured:true,changed:false};
  const backup=structuredClone(original);
  trigger[0].parameters.updates=[...new Set([...(trigger[0].parameters.updates ?? []),'callback_query'])];
  gate.parameters.jsCode=[
    "// avt:callback-bridge",
    "const callbackUpdate=$input.first().json;",
    "const query=callbackUpdate.callback_query;",
    "if(query?.data?.startsWith('avt:')) return [{json:{chatId:String(query.message?.chat?.id||''),",
    " userId:String(query.from?.id||''),callbackId:String(query.id),data:query.data,",
    " text:'/automation-callback',isBot:query.from?.is_bot===true}}];",
    gate.parameters.jsCode,
  ].join('\n');
  const bodyFor=value=>({name:value.name,nodes:value.nodes,connections:value.connections,
    settings:Object.fromEntries(['executionOrder','timezone','errorWorkflow','executionTimeout','saveDataErrorExecution',
      'saveDataSuccessExecution','saveManualExecutions','callerPolicy'].filter(key=>value.settings?.[key]!==undefined)
      .map(key=>[key,value.settings[key]]))});
  let changed=false;
  try {
    if (original.active) await request('/deactivate','POST');
    await request('','PUT',bodyFor(original));changed=true;
    if (original.active) await request('/activate','POST');
    const verified=await request();
    if (Boolean(verified.active)!==Boolean(original.active)) throw new AutomationFault('Status Published grup belum pulih.',503);
  } catch (error) {
    if (changed) await request('','PUT',bodyFor(backup)).catch(()=>{});
    if (backup.active) await request('/activate','POST').catch(()=>{});
    throw error;
  }
  return {id:original.id,configured:true,changed:true};
}
