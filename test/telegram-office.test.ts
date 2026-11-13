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
  automaticOfficeDivisions,officeCheckinWindow,officeVirtualCheckin,dispatchOfficeGroupCheckin,
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

test('laporan antarempat bot hanya muncul untuk pekerjaan nyata, maksimal dua balasan',async()=>{
  const s=createStore(':memory:',()=>start);
  try {
    assert.deepEqual(await dispatchOfficeGroupEvent(s,env,async()=>{throw Error('No events');}),{sent:false});
    s.create({division:'operations',description:'Ini rahasia',project:'Demo',kind:'draft'});
    const running=s.claim(['draft']);
    s.finish(running.id,running.token,{output:'Teks draf privat'});
    const sent=[];
    const fake=async(url,opts)=>{
      sent.push({url,payload:JSON.parse(opts.body)});
      return goodResponse(800+sent.length);
    };
    const result=await dispatchOfficeGroupEvent(s,env,fake);
    assert.equal(result.sent,true);
    assert.equal(result.division,'operations');
    assert.equal(result.followedUp,true);
    assert.equal(sent.length,2);
    assert.ok(sent[0].url.includes(allTokens.operations));
    assert.ok(sent[1].url.includes(allTokens.management));
    assert.equal(sent[1].payload.reply_parameters.message_id,801);
    assert.ok(!JSON.stringify(sent.map(v=>v.payload)).includes('Ini rahasia'));
    assert.ok(!JSON.stringify(sent.map(v=>v.payload)).includes('Teks draf privat'));
    assert.deepEqual(await dispatchOfficeGroupEvent(s,env,fake),{sent:false});
    const preview=officeTaskConversation({eventId:5,division:'finance',project:'Tester',taskId:'id',action:'failed'});
    assert.equal(preview.followUp,null);
    assert.match(preview.text,/gagal|kendala/i);
    assert.deepEqual(automaticOfficeDivisions,['management','operations','administration','hr']);
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
    assert.ok(sent[0].url.includes(allTokens.management));
    assert.match(sent[0].body.text,/belum aktif sebagai bot Telegram pilot/i);
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

test('tugas divisi nonaktif tetap tercatat, dibalas Alya tanpa janji kerja dan tanpa bot non-pilot',async()=>{
  for(const tokens of [
    Object.fromEntries(automaticOfficeDivisions.map(k=>[k,allTokens[k]])),
    allTokens,
  ]) {
    const s=createStore(':memory:',()=>start);
    const testEnv={...env,TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens)};
    const messages=[];
    const fake=async(url,options)=>{
      messages.push({url,body:JSON.parse(options.body)});
      return goodResponse(701+messages.length);
    };
    try {
      const payload={chatId:testEnv.TELEGRAM_CHAT_ID,userId:testEnv.TELEGRAM_USER_ID,
        updateId:'777',text:'/tugas desain | Buat tiga konsep desain yang berbeda',isBot:false};
      const out=await sendOfficeGroupOwnerMessage(s,testEnv,payload,fake);
      assert.equal(out.sent,true);
      assert.equal(out.division,'creative');
      assert.equal(out.acknowledgedBy,'management');
      assert.equal(s.state().tasks.length,1);
      assert.equal(s.state().tasks[0].division,'creative');
      assert.equal(s.state().tasks[0].status,'queued');
      assert.equal(messages.length,1);
      assert.ok(messages[0].url.includes(allTokens.management));
      assert.ok(!messages[0].url.includes(allTokens.creative));
      assert.match(messages[0].body.text,/belum aktif|belum dinyatakan dikerjakan/i);
      assert.doesNotMatch(messages[0].body.text,/aku mulai|sudah selesai|sedang mengerjakan/i);
      assert.deepEqual(await sendOfficeGroupOwnerMessage(s,testEnv,payload,fake),{duplicate:true});
      assert.equal(s.state().tasks.length,1);
    } finally {s.close();}
  }
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

test('nama pegawai bisa muncul di awal, tengah, atau akhir percakapan',()=>{
  const state={tasks:[],counts:{}};
  const cases=[
    ['Bima, lagi ngapain?','operations'],
    ['Eh, Bima lagi ngapain sekarang?','operations'],
    ['Ada kendala IT nggak, Bima?','operations'],
    ['Tolong tanya Citra soal dokumen itu ya','administration'],
    ['Hari ini Dara lagi ngapain?','hr'],
    ['Gimana menurut Fara untuk desain?', 'creative'],
    ['Bisa Eka bantu cek kode?','development'],
    ['Kalau soal video mending tanya Galih ya?','video'],
    ['Konten ini mau dibahas sama Hana nggak?','social'],
    ['Indra bisa jelasin sumbernya?','research'],
    ['Ada saran SEO dari Jihan?','marketing'],
    ['Butuh dicek Kirana, gimana?','qa'],
    ['Anggarannya gimana, Laras?','finance'],
    ['Alya, tolong lihat progres Bima','management'],
    ['Bima, kamu sudah bicara dengan Dara?','operations'],
    ['Eh, @AnshelKiranaBot bisa bantu review QA?', 'qa'],
    ['Tolong cek @AnshelEkaBot untuk kodenya', 'development'],
    ['@AnshelKiranaBot sudah ada tugas?', 'qa'],
    ['Bima', 'operations'],
    ['Eh, Bima?','operations'],
    ['Halo, kantor aman?','management'],
    ['Ini bukan Bimawan ya?','management'],
    ['Buka https://example.com/Bima di browser','management'],
    ['/tanya Dara | ada jadwal HR?', 'hr'],
  ];
  for(const [message,expected] of cases) {
    assert.equal(officeGroupReply(state,message,env).division,expected,
      'Salah routing untuk '+message);
  }
});


test('workflow jadwal otomatis punya dua cron terpisah dan tidak mengganggu Telegram Trigger',async()=>{
  const workflow=JSON.parse(await readFile('workflows/office_telegram_fourbot_auto.json','utf8'));
  assert.equal(workflow.active,false);
  assert.equal(workflow.nodes.length,4);
  assert.equal(workflow.settings.timezone,'Asia/Jakarta');
  assert.ok(workflow.nodes.every(n=>!n.credentials));
  assert.equal(workflow.nodes.filter(n=>n.type==='n8n-nodes-base.telegramTrigger').length,0);
  assert.equal(workflow.nodes.filter(n=>n.type==='n8n-nodes-base.scheduleTrigger').length,2);
  const nodes=Object.fromEntries(workflow.nodes.map(n=>[n.name,n]));
  assert.equal(nodes['Cek hasil kerja tiap jam'].parameters.rule.interval[0].expression,'0 9-17 * * 1-5');
  assert.equal(nodes['Obrolan kantor virtual siang'].parameters.rule.interval[0].expression,'0 12 * * 1-5');
  assert.match(nodes['Kirim update kerja empat bot'].parameters.url,/office-group\/dispatch$/);
  assert.match(nodes['Dua bot ngobrol aktivitas virtual'].parameters.url,/office-group\/checkin$/);
  assert.equal(workflow.connections['Cek hasil kerja tiap jam'].main[0][0].node,'Kirim update kerja empat bot');
  assert.equal(workflow.connections['Obrolan kantor virtual siang'].main[0][0].node,'Dua bot ngobrol aktivitas virtual');
});

test('event dari delapan divisi yang ditunda diabaikan; hanya empat bot mengirim dan menghabiskan kuota',async()=>{
  let clock=start;
  const s=createStore(':memory:',()=>clock);
  const fourEnv={...env,TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(
    Object.fromEntries(automaticOfficeDivisions.map(k=>[k,allTokens[k]])))};
  const sent=[];
  const fake=async(url,opts)=>{
    sent.push({url,payload:JSON.parse(opts.body)});
    return goodResponse(400+sent.length);
  };
  const complete=division=>{
    s.create({division,description:'Draft contoh',project:'Tester',kind:'draft'});
    const claimed=s.claim(['draft']);
    assert.equal(claimed.division,division);
    s.finish(claimed.id,claimed.token,{output:'Draf jadi'});
  };
  try {
    assert.deepEqual(await dispatchOfficeGroupEvent(s,fourEnv,fake),{sent:false});
    complete('development');
    let result=await dispatchOfficeGroupEvent(s,fourEnv,fake);
    assert.equal(result.sent,false);
    assert.equal(result.skipped,'not-in-four-bot-pilot');
    assert.equal(sent.length,0);
    complete('administration');
    result=await dispatchOfficeGroupEvent(s,fourEnv,fake);
    assert.equal(result.sent,true);
    assert.equal(result.division,'administration');
    assert.equal(result.followedUp,true);
    assert.equal(sent.length,2);
    assert.ok(sent[0].url.includes(allTokens.administration));
    assert.ok(sent[1].url.includes(allTokens.hr));
    assert.doesNotMatch(sent[0].payload.text,/draft contoh|Draf jadi/i);
    assert.match(sent[0].payload.text,/Tester/i);
  } finally{s.close();}
});

test('update pekerjaan otomatis dibatasi tiga event sehari WIB dan jeda minimal satu jam',async()=>{
  let clock=start;
  const s=createStore(':memory:',()=>clock);
  const sent=[];
  const fake=async(url,options)=>{
    sent.push({url,body:JSON.parse(options.body)});
    return goodResponse(300+sent.length);
  };
  const complete=()=>{
    s.create({division:'management',description:'Draf contoh',project:'Pilot',kind:'draft',urgent:true});
    const claimed=s.claim(['draft']);
    assert.ok(claimed);
    s.finish(claimed.id,claimed.token,{output:'Draf selesai'});
  };
  try {
    assert.deepEqual(await dispatchOfficeGroupEvent(s,env,fake),{sent:false});
    complete();
    assert.equal((await dispatchOfficeGroupEvent(s,env,fake)).sent,true);
    complete();
    assert.deepEqual(await dispatchOfficeGroupEvent(s,env,fake),{sent:false});
    clock+=60*60_000;
    assert.equal((await dispatchOfficeGroupEvent(s,env,fake)).sent,true);
    clock+=60*60_000;
    complete();
    assert.equal((await dispatchOfficeGroupEvent(s,env,fake)).sent,true);
    clock+=60*60_000;
    complete();
    assert.deepEqual(await dispatchOfficeGroupEvent(s,env,fake),{sent:false});
    assert.equal(sent.length,6);
    clock+=24*60*60_000+1;
    const next=await dispatchOfficeGroupEvent(s,env,fake);
    // Work item is older than 24 hours and must not be announced as recent.
    assert.deepEqual(next,{sent:false});
  } finally{s.close();}
});

test('obrolan aktivitas avatar empat bot sekali setiap hari WIB, siang hari kerja',async()=>{
  const noon=Date.parse('2026-11-12T05:00:00Z');
  const morning=Date.parse('2026-11-12T03:00:00Z');
  assert.equal(officeCheckinWindow(noon),true);
  assert.equal(officeCheckinWindow(morning),false);
  assert.equal(officeCheckinWindow(Date.parse('2026-11-14T05:00:00Z')),false);
  let clock=noon;
  const s=createStore(':memory:',()=>clock);
  const fourEnv={...env,TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(
    Object.fromEntries(automaticOfficeDivisions.map(k=>[k,allTokens[k]])))};
  const sent=[];
  const fake=async(url,opts)=>{
    sent.push({url,payload:JSON.parse(opts.body)});
    return goodResponse(700+sent.length);
  };
  try {
    const state=s.state();
    const conversation=officeVirtualCheckin(state,automaticOfficeDivisions);
    assert.ok(conversation);
    assert.ok(automaticOfficeDivisions.includes(conversation.first));
    assert.ok(automaticOfficeDivisions.includes(conversation.second));
    assert.notEqual(conversation.first,conversation.second);
    const first=await dispatchOfficeGroupCheckin(s,fourEnv,fake);
    assert.equal(first.sent,true);
    assert.equal(first.followedUp,true);
    assert.equal(sent.length,2);
    assert.equal(sent[1].payload.reply_parameters.message_id,701);
    assert.match(sent[0].payload.text,/kantor virtual|simulasi kantor/i);
    assert.match(sent[1].payload.text,/kantor virtual|catatan anshel/i);
    assert.deepEqual(await dispatchOfficeGroupCheckin(s,fourEnv,fake),
      {sent:false,reason:'already-sent-today'});
    clock+=24*60*60_000;
    assert.equal((await dispatchOfficeGroupCheckin(s,fourEnv,fake)).sent,true);
    assert.equal(sent.length,4);
    clock+=24*60*60_000;
    assert.deepEqual(await dispatchOfficeGroupCheckin(s,fourEnv,fake),
      {sent:false,reason:'outside-checkin-window'});
    assert.equal(sent.length,4);
  } finally{s.close();}
});

test('check-in tidak mengirim jika hanya satu bot tersedia atau timestamp di luar jadwal',async()=>{
  const noon=Date.parse('2026-11-12T05:00:00Z');
  const s=createStore(':memory:',()=>noon);
  const oneEnv={...env,TELEGRAM_BOT_TOKENS_JSON:JSON.stringify({management:allTokens.management})};
  try {
    const result=await dispatchOfficeGroupCheckin(s,oneEnv,async()=>{throw Error('Must not send');});
    assert.deepEqual(result,{sent:false,reason:'not-enough-active-bots'});
    await assert.rejects(dispatchOfficeGroupCheckin(s,{...oneEnv,TELEGRAM_CHAT_ID:'123'},
      async()=>{throw Error('Must not send');}),e=>e.status===503);
  } finally{s.close();}
});

test('endpoint check-in hanya boleh dengan N8N_TOKEN, tidak menerima parameter',async()=>{
  const s=createStore(':memory:',()=>start);
  const api=createCloudApi({...s,sessionActive:async()=>false},env);
  const request=(body,auth=true)=>api.fetch(new Request('https://anshel.test/api/integrations/office-group/checkin',{
    method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+env.N8N_TOKEN}:{})},
    body:JSON.stringify(body),
  }));
  try {
    assert.equal((await request({},false)).status,401);
    assert.equal((await request({arbitrary:true})).status,400);
    const r=await request({});
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{sent:false,reason:'outside-checkin-window'});
  } finally{s.close();}
});

test('perintah ringkasan dari HP merangkum status tugas yang benar-benar tercatat',()=>{
  const state={counts:{queued:2,running:1,completed:6,blocked:1,failed:3},tasks:[]};
  const out=officeGroupReply(state,'/ringkasan',env);
  assert.equal(out.division,'management');
  assert.match(out.text,/2 antre/);
  assert.match(out.text,/1 dikerjakan/);
  assert.match(out.text,/6 selesai/);
  assert.match(out.text,/1 terhambat/);
  assert.match(out.text,/3 gagal/);
  assert.match(out.text,/bukan hanya aktivitas hari ini/);
  assert.deepEqual(officeGroupReply(state,'/ringkas',env),out);
});

test('perintah kendala memakai data tugas tanpa membuka isi tugas atau mengarang status server',()=>{
  const state={counts:{blocked:2,failed:1},tasks:[
    {division:'administration',project:'Dokumen',status:'blocked',description:'Isi sangat rahasia',error:'token rahasia'},
    {division:'operations',project:'Integrasi',status:'failed',description:'Rahasia lagi',error:'stack trace'},
    {division:'hr',project:'Rekrutmen',status:'blocked',description:'Rahasia staf'},
    {division:'management',project:'Lain',status:'completed'}
  ]};
  const out=officeGroupReply(state,'/kendala',env);
  assert.equal(out.division,'operations');
  assert.match(out.text,/2 terhambat, 1 gagal/);
  assert.match(out.text,/Citra \(Dokumen\): terhambat/);
  assert.match(out.text,/Bima \(Integrasi\): gagal/);
  assert.match(out.text,/bukan diagnosis kondisi server/);
  assert.doesNotMatch(out.text,/rahasia|stack trace/i);
  const none=officeGroupReply({counts:{blocked:0,failed:0},tasks:[]},'/kendala',env);
  assert.equal(none.division,'operations');
  assert.match(none.text,/belum memastikan sistem bebas masalah/);
});

test('perintah cek diarahkan ke empat pegawai aktif dan tidak menyalakan delapan bot tertunda',()=>{
  const state={counts:{},tasks:[
    {division:'operations',project:'Website',status:'running',description:'Kredensial privat'},
    {division:'hr',project:'',status:'completed'},
  ]};
  const ops=officeGroupReply(state,'/cek Bima',env);
  assert.equal(ops.division,'operations');
  assert.match(ops.text,/Website/);
  assert.match(ops.text,/sedang dikerjakan/);
  assert.doesNotMatch(ops.text,/Kredensial privat/);
  const hr=officeGroupReply(state,'/cek Dara',env);
  assert.equal(hr.division,'hr');
  assert.match(hr.text,/hasil drafnya sudah dibuat/);
  const alya=officeGroupReply(state,'/cek Alya',env);
  assert.equal(alya.division,'management');
  assert.match(alya.text,/belum ada tugas/);
  const eka=officeGroupReply(state,'/cek Eka',env);
  assert.equal(eka.division,'management');
  assert.match(eka.text,/Delapan pegawai lainnya belum diaktifkan/);
  const unknown=officeGroupReply(state,'/cek TidakAda',env);
  assert.equal(unknown.division,'management');
  assert.match(unknown.text,/\/cek Bima/);
});
