import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { divisions } from '../public/catalog.js';
import { createStore } from '../server/store.ts';
import { createCloudApi } from '../api/route.ts';
import {
  buildOfficeNaturalRequest,prepareOfficeNaturalChat,deliverOfficeNaturalChat,cleanOfficeNaturalResponse,
} from '../server/telegram-natural.ts';

const tokens=Object.fromEntries(divisions.map((d,i)=>[d.id,String(100000+i)+':'+('z'.repeat(35))]));
const env={TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens),N8N_TOKEN:'n8n-test-credential-length-over-24'};
const clock={value:Date.parse('2026-11-12T03:00:00Z')};
const transport=messages=>async(url,options)=>{
  messages.push({url,body:JSON.parse(options.body)});
  return new Response(JSON.stringify({ok:true,result:{message_id:messages.length+100}}),{
    status:200,headers:{'Content-Type':'application/json'}});
};
const userMessage=(id,text)=>({chatId:env.TELEGRAM_CHAT_ID,userId:env.TELEGRAM_USER_ID,
  updateId:String(id),text,isBot:false});

test('empat pegawai menggunakan persona yang benar-benar berbeda; fakta tidak dipalsukan',()=>{
  const state={phase:'work',counts:{queued:1,running:0,completed:0},
    tasks:[{division:'administration',status:'queued',kind:'draft',project:'Jadwal uji'}]};
  const params=divisions.slice(0,4).map(d=>buildOfficeNaturalRequest(d.id,'Gimana kabarnya?',state));
  const personalities=params.map(p=>p.systemInstruction.parts[0].text);
  assert.equal(new Set(personalities).size,4);
  assert.match(personalities[0],/prioritas/);
  assert.match(personalities[1],/teknis/);
  assert.match(personalities[2],/teliti/);
  assert.match(personalities[3],/empatik/);
  assert.ok(personalities.every(p=>p.includes('Jangan mengarang')));
  assert.deepEqual(params[2].contents,[{role:'user',parts:[{text:'Gimana kabarnya?'}]}]);
  const privateContext=JSON.parse(personalities[2].split('DATA KANTOR TERPERCAYA: ')[1]);
  assert.equal(privateContext.tugasDivisi[0].status,'queued');
  assert.equal(privateContext.tugasDivisi[0].project,'Jadwal uji');
  assert.deepEqual(JSON.parse(personalities[0].split('DATA KANTOR TERPERCAYA: ')[1]).tugasDivisi,[]);
});

test('memori percakapan per divisi tidak tercampur dan satu ticket tidak bisa dikirim dua kali',()=>{
  let now=clock.value;
  const s=createStore(':memory:',()=>now);
  try {
    const first=s.prepareOfficeGroupAI('100','operations','Progres Bima?');
    assert.deepEqual(first.history,[]);
    const pending=s.consumeOfficeGroupAI('100',first.ticket);
    assert.equal(pending.division,'operations');
    assert.throws(()=>s.consumeOfficeGroupAI('100',first.ticket),e=>e.status===409);
    s.rememberOfficeGroupAI('operations',pending.question,'Belum ada tugas operasional.');
    assert.equal(s.prepareOfficeGroupAI('101','operations','Boleh bantu?').history.length,1);
    assert.equal(s.prepareOfficeGroupAI('102','hr','Halo Dara').history.length,0);
    now+=8*24*3600_000;
    assert.deepEqual(s.prepareOfficeGroupAI('103','operations','Halo Bima').history,[]);
  } finally{s.close();}
});

test('pertanyaan bebas ke Bima memakai Gemini; jawaban dikirim dari token Bima',async()=>{
  let now=clock.value;
  const s=createStore(':memory:',()=>now);
  try {
    const calls=[];
    const payload=userMessage(501,'Bima, apa kabar?');
    const prep=await prepareOfficeNaturalChat(s,env,payload,transport(calls));
    assert.equal(prep.mode,'generate');
    assert.equal(prep.division,'operations');
    assert.ok(prep.request.systemInstruction.parts[0].text.includes('Bima'));
    assert.ok(!JSON.stringify(prep.request).includes(tokens.operations));
    assert.equal(calls.length,0);
    const finish=await deliverOfficeNaturalChat(s,env,{updateId:prep.updateId,ticket:prep.ticket,
      output:'Aman, lagi santai sebentar. Ada yang mau dicek di sistem?'},transport(calls));
    assert.deepEqual(finish,{sent:true,division:'operations',ai:true});
    assert.equal(calls.length,1);
    assert.ok(calls[0].url.includes(tokens.operations));
    assert.ok(!calls[0].url.includes(tokens.management));
    assert.match(calls[0].body.text,/lagi santai/);
    await assert.rejects(deliverOfficeNaturalChat(s,env,{updateId:prep.updateId,ticket:prep.ticket,
      output:'Pesan duplikat'},transport(calls)),e=>e.status===409);
    now+=9000;
    const next=await prepareOfficeNaturalChat(s,env,userMessage(502,'Bima, tadi kita ngobrol apa?'),transport(calls));
    assert.equal(next.request.contents.length,3);
    assert.equal(next.request.contents[0].parts[0].text,'Bima, apa kabar?');
    assert.equal(next.request.contents[1].parts[0].text,'Aman, lagi santai sebentar. Ada yang mau dicek di sistem?');
  } finally{s.close();}
});

test('perintah kantor tidak memakai Gemini dan tetap mengirim balasan bot yang tepat',async()=>{
  const s=createStore(':memory:',()=>clock.value);
  try {
    const calls=[];
    const result=await prepareOfficeNaturalChat(s,env,userMessage(900,'/status'),transport(calls));
    assert.equal(result.mode,'handled');
    assert.equal(result.sent,true);
    assert.equal(result.division,'management');
    assert.equal(calls.length,1);
    assert.ok(calls[0].url.includes(tokens.management));
    assert.match(calls[0].body.text,/Update dari kantor/);
  } finally{s.close();}
});

test('akses pesan ditolak untuk akun lain, grup lain, atau bot',async()=>{
  const s=createStore(':memory:',()=>clock.value);
  try {
    for(const override of [{chatId:'-10098765'},{userId:'90909'},{isBot:true}]) {
      await assert.rejects(prepareOfficeNaturalChat(s,env,
        {...userMessage(333,'Alya, kabar?'),...override}),e=>e.status===403);
    }
  } finally{s.close();}
});

test('jawaban kosong, panjang, atau klaim aksi yang tidak ada memakai fallback yang faktual',()=>{
  assert.equal(cleanOfficeNaturalResponse(null,'Belum ada tugas.'),'Belum ada tugas.');
  assert.equal(cleanOfficeNaturalResponse('x'.repeat(701),'Belum ada tugas.'),'Belum ada tugas.');
  assert.equal(cleanOfficeNaturalResponse('Aku sudah mempublikasikan halaman itu.','Belum ada tugas.'),'Belum ada tugas.');
  assert.equal(cleanOfficeNaturalResponse('Lagi enak nih suasananya. Mau bahas apa?','Belum ada tugas.'),
    'Lagi enak nih suasananya. Mau bahas apa?');
});

test('n8n natural memakai Gemini existing dan hanya satu Telegram Trigger',async()=>{
  const w=JSON.parse(await readFile('workflows/office_telegram_group_natural.json','utf8'));
  assert.equal(w.active,false);
  assert.equal(w.nodes.length,7);
  assert.equal(w.settings.timezone,'Asia/Jakarta');
  assert.ok(w.nodes.every(n=>!n.credentials));
  assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.telegramTrigger').length,1);
  const names=w.nodes.map(n=>n.name);
  for(let i=0;i<names.length-1;i++)assert.equal(w.connections[names[i]].main[0][0].node,names[i+1]);
  assert.match(w.nodes[2].parameters.url,/\/ai\/prepare$/);
  assert.match(w.nodes[4].parameters.url,/gemini.*generateContent/);
  assert.match(w.nodes[6].parameters.url,/\/ai\/finish$/);
  const onlyGenerate=new Function('$input',w.nodes[3].parameters.jsCode);
  assert.deepEqual(onlyGenerate({first:()=>({json:{mode:'handled'}})}),[]);
  const data={mode:'generate',ticket:'123',updateId:'55',request:{contents:[{role:'user'}]}};
  assert.equal(onlyGenerate({first:()=>({json:data})}).length,1);
  assert.equal(w.nodes[4].parameters.jsonBody,'={{ JSON.stringify($json.request) }}');
});

test('endpoint natural terlindungi token n8n dan memvalidasi chat pemilik',async()=>{
  const s=createStore(':memory:',()=>clock.value);
  const api=createCloudApi({...s,sessionActive:async()=>false},env);
  const post=(route,payload,auth=true)=>api.fetch(new Request('https://anshel.test/api/integrations/office-group/ai/'+route,{
    method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+env.N8N_TOKEN}:{})},
    body:JSON.stringify(payload),
  }));
  try {
    assert.equal((await post('prepare',userMessage(15,'Alya, kabar?'),false)).status,401);
    assert.equal((await post('prepare',{...userMessage(15,'Alya, kabar?'),userId:'1'})).status,403);
    const response=await post('prepare',userMessage(15,'Alya, kabar?'));
    assert.equal(response.status,200);
    const ready=await response.json();
    assert.equal(ready.mode,'generate');
    assert.ok(!JSON.stringify(ready).includes(tokens.management));
    assert.equal((await post('finish',{updateId:ready.updateId,ticket:'wrong',output:'Teks'})).status,400);
  } finally{s.close();}
});

test('Alya dipanggil tanpa salam: tidak menambahkan Halo juga dan tidak mengarang suasana kantor',()=>{
  const state={phase:'work',counts:{queued:0,running:0,completed:0},tasks:[]};
  const user='Alya, gimana suasana kantor hari ini? Ada cerita menarik nggak?';
  const prepared=buildOfficeNaturalRequest('management',user,state);
  const instruction=prepared.systemInstruction.parts[0].text;
  assert.match(instruction,/TIDAK memiliki sapaan/);
  assert.match(instruction,/jangan mengaku menyaksikan kantor/i);
  assert.equal(prepared.contents.at(-1).parts[0].text,'gimana suasana kantor hari ini? Ada cerita menarik nggak?');
  assert.equal(cleanOfficeNaturalResponse('Halo juga, belum ada berita baru.','fallback',user),
    'belum ada berita baru.');
  assert.equal(cleanOfficeNaturalResponse('Halo juga, suasana kantor lumayan tenang dan semua fokus.','fallback',user),
    'fallback');
  const greeted=buildOfficeNaturalRequest('management','Alya, halo! Apa kabar?',state);
  assert.match(greeted.systemInstruction.parts[0].text,/benar-benar mengandung sapaan/);
  assert.equal(cleanOfficeNaturalResponse('Halo! Baik, ada yang perlu dibantu?','fallback',
    'Alya, halo! Apa kabar?'),'Halo! Baik, ada yang perlu dibantu?');
});
