import { AutomationFault } from './automation-domain.ts';
export async function readProviderJson(response,max=1000000) {
  if(!response.ok) {await response.body?.cancel();throw new AutomationFault('Provider HTTP '+response.status,503);}
  if(!response.body || !/application\/(?:[^;]*\+)?json/i.test(response.headers.get('content-type') ?? ''))
    throw new AutomationFault('Respons provider bukan JSON.',503);
  const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try {for(;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>max)throw new AutomationFault('Respons provider terlalu besar.',503);text+=decoder.decode(value,{stream:true});}
    return JSON.parse(text+decoder.decode());
  } finally {await reader.cancel().catch(()=>{});}
}
