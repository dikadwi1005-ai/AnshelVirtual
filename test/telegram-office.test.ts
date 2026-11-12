import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { divisions } from '../public/catalog.js';
import { createStore } from '../server/store.ts';
import { createCloudApi } from '../api/route.ts';
import {
  configuredOfficeBots,officeGroupConfig,sendOfficeBotMessage,
  officeTaskConversation,officeGroupReply,parseOfficeGroupTask,
  sendOfficeGroupOwnerMessage,dispatchOfficeGroupEvent,
} from '../server/telegram-office.ts';

const start=Date.parse('2026-11-12T03:00:00Z');
const allTokens=Object.fromEntries(divisions.map((d,i)=>[d.id,String(100000+i)+':'+('A'.repeat(39))]));
const env={
  OWNER_PASSWORD:'local-test-pass123',N8N_TOKEN:'office-n8n-token-more-than-24',
  TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(allTokens),
  TELEGRAM_BOT_USERNAMES_JSON:JSON.stringify({development:'AnshelEkaBot',qa:'AnshelKiranaBot'}),
};
const goodResponse=messageId=>new Response(JSON.stringify({ok:true,result:{message_id:messageId}}),{
  status:200,headers:{'Content-Type':'application/json'}
});

test('dua workflow grup n8n terpisah, nonaktif, dan tanpa token rahasia',async()=>{
  const outbound=JSON.parse(await readFile('workflows/office_telegram_notifications.json','utf8'));
  const inbound=JSON.parse(await readFile('workflows/office_telegram_group_intake.json','utf8'));
  assert.equal(outbound.active,false);
  assert.equal(inbound.active,false);
  assert.equal(outbound.settings.timezone,'Asia/Jakarta');
  assert.equal(inbound.settings.timezone,'Asia/Jakarta');
  assert.equal(outbound.nodes.length,2);
  assert.equal(inbound.nodes.length,3);
  assert.equal(outbound.nodes[0].type,'n8n-nodes-base.scheduleTrigger');
  assert.equal(outbound.nodes[0].parameters.rule.interval[0].expression,'0,30 9-17 * * 1-5');
  assert.equal(inbound.nodes[0].type,'n8n-nodes-base.telegramTrigger');
  assert.equal(inbound.nodes[0].parameters.updates[0],'message');
  assert.equal(inbound.nodes[1].type,'n8n-nodes-base.code');
  assert.equal(inbound.nodes[2].parameters.genericAuthType,'httpHeaderAuth');
  for(const workflow of [outbound,inbound]) {
    assert.ok(workflow.nodes.every(node=>!node.credentials));
    assert.equal(workflow.settings.saveDataSuccessExecution,'none');
    assert.equal(workflow.settings.saveDataErrorExecution,'none');
  }
  assert.match(inbound.nodes[1].parameters.jsCode,/is_bot/);
  assert.equal(outbound.connections['Jadwal ngobrol kantor'].main[0][0].node,'Kirim pembaruan dari pegawai');
  assert.equal(inbound.connections['Pesan grup via Alya'].main[0][0].node,'Saring pesan manusia');
  assert.equal(inbound.connections['Saring pesan manusia'].main[0][0].node,'Tanya pegawai AI');
  const parser=new Function('$input',inbound.nodes[1].parameters.jsCode);
  const testCode=update=>parser({first:()=>({json:update})});
  const msg={message:{chat:{type:'supergroup',id:-1001234567890},
    from:{id:778899,is_bot:false},text:'Eka, progres?'},update_id:123};
  assert.equal(testCode(msg)[0].json.userId,'778899');
  assert.deepEqual(testCode({...msg,message:{...msg.message,from:{is_bot:true}}}),[]);
  assert.deepEqual(testCode({...msg,message:{...msg.message,chat:{type:'private'}}}),[]);
});

test('12 bot memiliki token terpisah; server tidak menyelipkan token dalam balasan',async()=>{
  const config=configuredOfficeBots(env);
  assert.equal(config.configured.length,12);
  assert.deepEqual(config.missing,[]);
  assert.equal(officeGroupConfig(env).chatId,'-1001234567890');
  assert.throws(()=>officeGroupConfig({...env,TELEGRAM_CHAT_ID:'123'}),e=>e.status===503);
  const requests=[];
  const transport=async(url,options)=>{
    requests.push({url,payload:JSON.parse(options.body)});
    return goodResponse(910+requests.length);
  };
  const id=await sendOfficeBotMessage(env,'development','Draf sudah selesai',{fetchImpl:transport});
  assert.equal(id,911);
  assert.ok(requests[0].url.includes(allTokens.development));
  assert.equal(requests[0].payload.chat_id,env.TELEGRAM_CHAT_ID);
  assert.equal(requests[0].payload.text,'Draf sudah selesai');
  assert.equal((await sendOfficeBotMessage(env,'qa','Cek ya',{fetchImpl:transport,replyTo:911})),912);
  assert.equal(requests[1].payload.reply_parameters.message_id,911);
  assert.ok(!requests[1].url.includes(allTokens.development));
  await assert.rejects(sendOfficeBotMessage(env,'finance','Uji',{
    fetchImpl:async()=>new Response(JSON.stringify({ok:false,description:'Sensitive details'}),{status:401}),
  }),e=>e.status===502&&!e.message.includes('Sensitive details'));
});

test('laporan antarbot hanya muncul untuk tugas nyata, maksimal dua balasan',async()=>{
  const s=createStore(':memory:',()=>start);
  try {
    assert.deepEqual(await dispatchOfficeGroupEvent(s,env,async()=>{throw Error('No events');}),{sent:false});
    s.create({division:'development',description:'Ini rahasia',project:'Demo',kind:'draft'});
    const running=s.claim(['draft']);
    s.finish(running.id,running.token,{output:'Teks draf privat'});
    const sent=[];
    const fake=async(url,opts)=>{
      sent.push({url,payload:JSON.parse(opts.body)});
      return goodResponse(800+sent.length);
    };
    const result=await dispatchOfficeGroupEvent(s,env,fake);
    assert.equal(result.sent,true);
    assert.equal(result.division,'development');
    assert.equal(result.followedUp,true);
    assert.equal(sent.length,2);
    assert.ok(sent[0].url.includes(allTokens.development));
    assert.ok(sent[1].url.includes(allTokens.qa));
    assert.equal(sent[1].payload.reply_parameters.message_id,801);
    assert.ok(!JSON.stringify(sent.map(v=>v.payload)).includes('Ini rahasia'));
    assert.ok(!JSON.stringify(sent.map(v=>v.payload)).includes('Teks draf privat'));
    assert.deepEqual(await dispatchOfficeGroupEvent(s,env,fake),{sent:false});
    const preview=officeTaskConversation({eventId:5,division:'finance',project:'Tester',taskId:'id',action:'failed'});
    assert.equal(preview.followUp,null);
    assert.match(preview.text,/gagal|kendala/i);
  } finally{s.close();}
});

test('pemilik dapat bertanya ke Eka, QA, status, dan membuat draf secara eksplisit',async()=>{
  let clock=start;
  const s=createStore(':memory:',()=>clock);
  try {
    assert.equal(officeGroupReply(s.state(),'Eka, progresnya gimana?',env).division,'development');
    assert.equal(officeGroupReply(s.state(),'@AnshelKiranaBot tugas QA?',env).division,'qa');
    assert.equal(officeGroupReply(s.state(),'/status',env).division,'management');
    assert.equal(officeGroupReply(s.state(),'/tanya Kirana | progres?',env).division,'qa');
    assert.equal(parseOfficeGroupTask('/tugas desain | Tiga konsep desain').division,'creative');
    const sent=[];
    const fake=async(url,options)=>{
      sent.push({url,body:JSON.parse(options.body)});
      return goodResponse(101+sent.length);
    };
    const payload={chatId:env.TELEGRAM_CHAT_ID,userId:env.TELEGRAM_USER_ID,
      updateId:'111',text:'/tugas desain | Tiga konsep desain',isBot:false};
    const out=await sendOfficeGroupOwnerMessage(s,env,payload,fake);
    assert.equal(out.sent,true);
    assert.equal(s.state().tasks.length,1);
    assert.equal(s.state().tasks[0].division,'creative');
    assert.equal(s.state().tasks[0].status,'queued');
    assert.ok(sent[0].url.includes(allTokens.creative));
    assert.deepEqual(await sendOfficeGroupOwnerMessage(s,env,payload,fake),{duplicate:true});
    assert.equal(s.state().tasks.length,1);
    await assert.rejects(sendOfficeGroupOwnerMessage(s,env,{...payload,userId:'888',updateId:'112'},fake),e=>e.status===403);
    await assert.rejects(sendOfficeGroupOwnerMessage(s,env,{...payload,isBot:true,updateId:'112'},fake),e=>e.status===403);
    await assert.rejects(sendOfficeGroupOwnerMessage(s,env,{...payload,chatId:'-100999',updateId:'112'},fake),e=>e.status===403);
    await assert.rejects(sendOfficeGroupOwnerMessage(s,env,{...payload,updateId:'112'},fake),e=>e.status===429);
    clock+=9000;
    const reply=await sendOfficeGroupOwnerMessage(s,env,{
      ...payload,updateId:'112',text:'Eka, progres?'},fake);
    assert.equal(reply.division,'development');
  } finally{s.close();}
});

test('endpoint grup memerlukan N8N_TOKEN, ID grup, dan tidak membocorkan token bot',async()=>{
  const s=createStore(':memory:',()=>start);
  const api=createCloudApi({...s,sessionActive:async()=>false},env);
  const call=(path,data={},bearer=true)=>api.fetch(new Request('https://anshel.test/api/integrations/office-group/'+path,{
    method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+env.N8N_TOKEN}:{})},
    body:JSON.stringify(data),
  }));
  try {
    assert.equal((await call('config',{},false)).status,401);
    const result=await (await call('config')).json();
    assert.deepEqual(result.configured.map(String),divisions.map(d=>d.id));
    assert.deepEqual(result.missing,[]);
    assert.ok(!JSON.stringify(result).includes(allTokens.development));
    assert.equal((await call('config',{extra:true})).status,400);
    assert.equal((await call('message',{chatId:'-1002222222222',userId:env.TELEGRAM_USER_ID,
      updateId:'33',text:'Halo',isBot:false})).status,403);
    assert.equal((await call('dispatch',{extra:1})).status,400);
  } finally{s.close();}
});
