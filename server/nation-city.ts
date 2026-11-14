import { isIP } from 'node:net';
import { nationSnapshot } from '../public/studio-data.js';

const maxBytes=64_000;
export function createNationCity(env,fetcher=fetch,now=Date.now) {
  let cached, until=0, pending;

  async function refresh() {
    let url;
    try { url=new URL(env.NATION_CITY_READ_URL); }
    catch { return {connection:'unconfigured',snapshot:null}; }
    if (env.NATION_CITY_ENABLED!=='true' || url.protocol!=='https:' || url.port || url.username || url.password ||
      url.hash || url.search || !url.hostname.includes('.') || isIP(url.hostname.replace(/^\[|\]$/g,'')) ||
      /\.(local|localhost|internal|test)$/.test(url.hostname)) return {connection:'unconfigured',snapshot:null};
    try {
      const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(4000),headers:{
        Accept:'application/json',...(env.NATION_CITY_READ_TOKEN?{Authorization:'Bearer '+env.NATION_CITY_READ_TOKEN}:{}),
      }});
      if (!response.ok || Number(response.headers.get('content-length'))>maxBytes ||
          !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new Error();
      const reader=response.body.getReader();
      const decoder=new TextDecoder('utf-8',{fatal:true});
      let size=0,text='';
      try {
        for (;;) {
          const {done,value}=await reader.read();
          if (done) break;
          size+=value.byteLength;
          if (size>maxBytes) throw new Error();
          text+=decoder.decode(value,{stream:true});
        }
        text+=decoder.decode();
      } finally { await reader.cancel().catch(()=>{}); }
      const snapshot=nationSnapshot(JSON.parse(text));
      if (!snapshot) throw new Error();
      cached={snapshot,at:now()};
      return {connection:'live',snapshot};
    } catch {
      return {connection:'offline',snapshot:cached && now()-cached.at<300_000?cached.snapshot:null};
    }
  }
  let last;
  return async ()=>{
    if (last && now()<until) return last;
    pending ??= refresh().then(result=>{
      last=result;
      until=now()+30_000;
      return result;
    }).finally(()=>{pending=null;});
    return pending;
  };
}
