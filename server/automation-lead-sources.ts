import { AutomationFault, validateLeadPublication } from './automation-domain.ts';
import { automationCapabilities, discoverLeads } from './automation-providers.ts';

export function freelancerCandidates(data,now,maxAgeHours=24) {
  if(data?.status!=='success' || !Array.isArray(data.result?.projects)) throw new AutomationFault('Respons Freelancer tidak valid.',503);
  return data.result.projects.filter(p=>p.status==='active' && p.frontend_project_status==='open' &&
    p.deleted===false && p.nonpublic===false && p.upgrades?.fulltime!==true && p.type==='fixed' &&
    Number.isSafeInteger(p.id) && Number.isSafeInteger(p.time_submitted) &&
    /^[a-zA-Z0-9_/-]+$/.test(p.seo_url ?? '') && !p.seo_url.includes('..')).map(p=>({
      url:'https://www.freelancer.com/projects/'+p.seo_url,
      text:p.title+'\n'+p.description+(p.budget?'\nBudget sumber: '+p.currency?.code+' '+p.budget.minimum+'–'+p.budget.maximum:''),
      platform:'Freelancer',publishedAt:p.time_submitted*1000,dateEvidence:'original',
      publicationProof:'API resmi project '+p.id+'; time_submitted='+p.time_submitted+'; active/open. Bukan time_updated.',
    })).filter(post=>!validateLeadPublication(post,now,maxAgeHours)).sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,5);
}

export async function discoverBudgetedLeads(config,env,reserve,fetchImpl=fetch,now=Date.now()) {
  const enabled=automationCapabilities(env).leads.filter(s=>s.configured && !['manual','facebook-groups'].includes(s.id));
  const candidates=[],unverified=[],statuses=[];
  for(const item of enabled) {
    const plan={brave:{daily:20,monthly:600,gapMinutes:60},'google-alerts':{daily:96,monthly:3000,gapMinutes:15},
      freelancer:{daily:24,monthly:720,gapMinutes:60}}[item.id];
    if(plan) {
      const budget=await reserve(item.id,plan);
      if(!budget.allowed) {statuses.push({source:item.id,state:'quota_wait',reason:budget.reason,nextAt:budget.nextAt});continue;}
    }
    try {
      let found;
      if(item.id==='freelancer') {
        const url=new URL('https://www.freelancer.com/api/projects/0.1/projects/active/');
        url.search=new URLSearchParams({query:'website aplikasi automation chatbot',or_search_query:'true',limit:'10',
          full_description:'true',sort_field:'time_submitted','languages[]':'id',from_time:String(Math.floor((now-24*3600000)/1000))}).toString();
        const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}});
        const {readProviderJson}=await import('./automation-source-http.ts');
        found={candidates:freelancerCandidates(await readProviderJson(response),now,config.maxAgeHours)};
      } else found=await discoverLeads(config,{...env,
        LEAD_SOURCE_URL:item.id==='approved-feed'?env.LEAD_SOURCE_URL:undefined,
        GOOGLE_ALERTS_FEED_URL:item.id==='google-alerts'?env.GOOGLE_ALERTS_FEED_URL:undefined,
        BRAVE_SEARCH_API_KEY:item.id==='brave'?env.BRAVE_SEARCH_API_KEY:undefined},fetchImpl,now);
      candidates.push(...found.candidates);unverified.push(...(found.unverified ?? []));
      statuses.push({source:item.id,state:'connected',reason:found.unverified?'Discovery; publikasi asli tetap wajib.':'Pemeriksaan API berizin berhasil.'});
    } catch(error) {statuses.push({source:item.id,state:'error',reason:error instanceof AutomationFault?error.message:'Sumber gagal atau melewati timeout.'});}
  }
  if(!enabled.length) throw new AutomationFault('Belum ada sumber otomatis berizin yang terhubung. Gunakan input manual dengan waktu publikasi asli.',503);
  const successful=statuses.find(s=>s.state==='connected');
  return {source:successful?.source ?? statuses[0]?.source ?? 'lead-discovery',
    candidates:candidates.sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,5),unverified:unverified.slice(0,20),statuses,
    deferred:!successful && statuses.every(s=>s.state==='quota_wait'),nextAt:Math.min(...statuses.map(s=>s.nextAt ?? Infinity)),
    error:!successful && statuses.some(s=>s.state==='error')?'Sumber belum dapat dibaca. Periksa kesehatan sumber.':undefined};
}
