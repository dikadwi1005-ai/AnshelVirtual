import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStore} from '../server/store.ts';
import {createCloudApi} from '../api/route.ts';
import {prepareOfficeNaturalChat,deliverOfficeNaturalChat} from '../server/telegram-natural.ts';
import {requestedOfficeDiscussion} from '../server/telegram-group.ts';
import {
  parseOwnerNaturalTask,officeGroupReply,dispatchOfficeGroupEvent,
  officeVirtualCheckin,dispatchOfficeGroupCheckin,automaticOfficeDivisions,
} from '../server/telegram-office.ts';
import {
  officeEmployeeOverview,officeActivityReply,officeSummaryDue,officeDailySummary,
  officeQueueDelayAlert,
} from '../server/office-monitoring.ts';

const base=Date.parse('2026-11-13T03:00:00Z'); // Friday, 10 AM WIB
const tokens=Object.fromEntries(automaticOfficeDivisions.map((id,i)=>[id,
  String(701001+i)+':'+('R'.repeat(38))]));
const env={N8N_TOKEN:'test-bearer-token-more-than-24',
  TELEGRAM_USER_ID:'996688',TELEGRAM_CHAT_ID:'-1001234500000',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens)};
const sent=[];
const fakeTelegram=async(url,options)=>{
  sent.push({url,body:JSON.parse(options.body)});
  return new Response(JSON.stringify({ok:true,result:{message_id:800+sent.length}}),
    {status:200,headers:{'Content-Type':'application/json'}});
};
const msg=(id,text)=>({chatId:env.TELEGRAM_CHAT_ID,userId:env.TELEGRAM_USER_ID,
  isBot:false,updateId:String(id),text});
const day=(hours,min=0)=>Date.parse('2026-11-13T'+String(hours-7).padStart(2,'0')+
  ':'+String(min).padStart(2,'0')+':00Z');

test('monitor uses only actual four-employee avatar and task state, never invents worker health',()=>{
  const state={worker:false,people:{
    management:{activity:'coffee',executing:false},
    operations:{activity:'desk',executing:true},
  },tasks:[
    {division:'operations',status:'running',project:'API',description:'Private key'},
    {division:'administration',status:'completed',project:'Catatan',sha256:'abc123'},
  ]};
  const result=officeEmployeeOverview(state);
  assert.equal(result.length,4);
  assert.equal(result[1].executing,true);
  assert.equal(result[1].task.project,'API');
  assert.equal(result[2].task.hasResult,true);
  assert.equal(result[0].avatar,'Mengambil kopi');
  const text=officeActivityReply(state);
  assert.match(text,/Alya/);
  assert.match(text,/Bima/);
  assert.match(text,/belum terlihat aktif dalam 40 detik/i);
  assert.doesNotMatch(text,/Private key|server sehat/i);
});

test('daily summary uses WIB audit events, status totals remain distinctly cumulative',()=>{
  const state={now:day(17),schedule:{close:'17:00',days:[1,2,3,4,5],holidays:[]},
    counts:{queued:2,running:1,completed:14,awaiting_approval:3},
    audit:[
      {id:101,at:day(10),task:'a',action:'completed'},
      {id:102,at:day(12),task:'b',action:'blocked'},
      {id:103,at:day(15),task:'c',action:'failed'},
      {id:99,at:Date.parse('2026-11-12T03:00:00Z'),task:'old',action:'completed'},
    ],tasks:[{division:'management',status:'completed',project:'Agenda',
      ended:day(10),description:'Kode rahasia'},{
      division:'operations',status:'completed',project:'API',
      ended:day(10),description:'Token privat',
    }]};
  assert.equal(officeSummaryDue({...state,now:day(16)}),false);
  assert.equal(officeSummaryDue(state),true);
  assert.equal(officeSummaryDue({...state,now:Date.parse('2026-11-14T10:00:00Z')}),false);
  assert.equal(officeSummaryDue({...state,schedule:{...state.schedule,holidays:['2026-11-13']}}),false);
  const report=officeDailySummary(state);
  assert.match(report,/1 penyelesaian tugas, 1 terhambat, 1 gagal/);
  assert.match(report,/2 antre, 1 diproses, 3 menunggu persetujuan/);
  assert.match(report,/Agenda/);
  assert.doesNotMatch(report,/14 penyelesaian|Kode rahasia|Token privat|sudah dipublikasikan/i);
});

test('Bima flags an observed long queue without declaring the server broken',()=>{
  const state={phase:'work',now:day(13),worker:false,tasks:[
    {division:'operations',status:'queued',created:day(10),project:'Network',description:'Secret'},
    {division:'development',status:'queued',created:day(9)},
  ]};
  const alert=officeQueueDelayAlert(state);
  assert.match(alert,/Bima/);
  assert.match(alert,/dua jam|dua\s+jam|2\s+jam/);
  assert.match(alert,/bukan bukti layanan mati/i);
  assert.doesNotMatch(alert,/Secret/);
  assert.equal(officeQueueDelayAlert({...state,worker:true}),null);
  assert.equal(officeQueueDelayAlert({...state,phase:'closed'}),null);
  assert.equal(officeQueueDelayAlert({...state,tasks:[
    {division:'operations',status:'queued',created:day(12)}]}),null);
});

test('store sends at most one summary and one queue alert per WIB day, resets next day',()=>{
  let now=day(12);
  const store=createStore(':memory:',()=>now);
  try {
    assert.equal(store.claimOfficeGroupSignal('queued-worker-silent'),true);
    assert.equal(store.claimOfficeGroupSignal('queued-worker-silent'),false);
    assert.equal(store.claimOfficeGroupSignal('daily-summary'),true);
    assert.equal(store.claimOfficeGroupSignal('daily-summary'),false);
    assert.throws(()=>store.claimOfficeGroupSignal('unknown'),e=>e.status===400);
    now+=24*60*60_000;
    assert.equal(store.claimOfficeGroupSignal('daily-summary'),true);
  }finally{store.close();}
});

test('existing hourly dispatch sends Alya report after close with no task event, once',async()=>{
  let now=day(17);
  const store=createStore(':memory:',()=>now);
  sent.length=0;
  try {
    const first=await dispatchOfficeGroupEvent(store,env,fakeTelegram);
    assert.equal(first.sent,true);
    assert.equal(first.kind,'daily-summary');
    assert.ok(sent[0].url.includes(tokens.management));
    assert.match(sent[0].body.text,/Ringkasan kantor/);
    const second=await dispatchOfficeGroupEvent(store,env,fakeTelegram);
    assert.deepEqual(second,{sent:false});
    assert.equal(sent.length,1);
    now+=24*60*60_000;
    const weekend=await dispatchOfficeGroupEvent(store,env,fakeTelegram);
    assert.equal(weekend.sent,false);
  } finally {store.close();}
});

test('hourly dispatch alerts Bima after a real queued task waits two hours',async()=>{
  let now=day(9);
  const store=createStore(':memory:',()=>now);
  sent.length=0;
  try {
    const task=store.create({division:'operations',description:'Draf uji koneksi',
      project:'API',kind:'draft'});
    now=day(13); // After lunch; work-hours warning deliberately skips break.
    const first=await dispatchOfficeGroupEvent(store,env,fakeTelegram);
    assert.equal(first.kind,'queue-delay-alert');
    assert.equal(first.division,'operations');
    assert.ok(sent[0].url.includes(tokens.operations));
    assert.doesNotMatch(sent[0].body.text,/Draf uji koneksi/);
    const second=await dispatchOfficeGroupEvent(store,env,fakeTelegram);
    assert.deepEqual(second,{sent:false});
    assert.equal(store.state().tasks[0].id,task.id);
  } finally {store.close();}
});

test('routine notification retries explicit Telegram rejection, avoids repeat after success',async()=>{
  const store=createStore(':memory:',()=>day(17));
  const rejected=async()=>new Response(JSON.stringify({ok:false}),{status:429});
  try{
    await assert.rejects(dispatchOfficeGroupEvent(store,env,rejected),e=>
      e.status===502 && e.deliveryRejected===true);
    const recovered=await dispatchOfficeGroupEvent(store,env,fakeTelegram);
    assert.equal(recovered.kind,'daily-summary');
    assert.deepEqual(await dispatchOfficeGroupEvent(store,env,fakeTelegram),{sent:false});
  }finally{store.close();}
});

test('natural language creates only four allowlisted draft tasks, with idempotence and no Gemini',async()=>{
  assert.deepEqual(parseOwnerNaturalTask('Tolong Bima buat draf pemeriksaan layanan API'),{
    division:'operations',description:'draf pemeriksaan layanan API',kind:'draft',urgent:false,
  });
  assert.deepEqual(parseOwnerNaturalTask('Citra, tolong rangkum catatan rapat besok'),{
    division:'administration',description:'catatan rapat besok',kind:'draft',urgent:false,
  });
  for(const unsafe of ['Tolong Eka buat skrip untuk repositori',
    'Guys, tolong semua kerja sekarang', 'Bima, sudah cek server?', 'Bima, tolong bayar tagihan']) {
    assert.equal(parseOwnerNaturalTask(unsafe),null,unsafe);
  }
  const store=createStore(':memory:',()=>base);
  sent.length=0;
  try {
    const out=await prepareOfficeNaturalChat(store,env,msg(10001,'Tolong Bima buat draf pemeriksaan layanan API'),fakeTelegram);
    assert.equal(out.mode,'handled');
    assert.equal(out.division,'operations');
    assert.equal(store.state().counts.queued,1);
    assert.equal(store.state().tasks[0].status,'queued');
    assert.ok(sent[0].url.includes(tokens.operations));
    assert.match(sent[0].body.text,/masuk antrean/);
    const again=await prepareOfficeNaturalChat(store,env,msg(10001,'Tolong Bima buat draf pemeriksaan layanan API'),fakeTelegram);
    assert.equal(again.duplicate,true);
    assert.equal(store.state().tasks.length,1);
  }finally{store.close();}
});

test('telegram /aktivitas is real status, not paid Gemini; unrelated users still denied',async()=>{
  const store=createStore(':memory:',()=>base);
  sent.length=0;
  try{
    const out=await prepareOfficeNaturalChat(store,env,msg(22001,'/aktivitas'),fakeTelegram);
    assert.equal(out.mode,'handled');
    assert.equal(out.division,'management');
    assert.match(sent[0].body.text,/Aktivitas empat pegawai/);
    assert.ok(sent[0].url.includes(tokens.management));
    assert.equal(officeGroupReply(store.state(),'/monitor',env).division,'management');
    await assert.rejects(prepareOfficeNaturalChat(store,env,
      {...msg(22002,'/aktivitas'),userId:'1111'},fakeTelegram),e=>e.status===403);
  }finally{store.close();}
});

test('contextual noon checkin uses real task status and excludes actively executing bots',()=>{
  const state={now:day(12),people:{
    management:{activity:'coffee',executing:false},
    operations:{activity:'desk',executing:false},
    administration:{activity:'read',executing:false},
    hr:{activity:'talk',executing:true},
  },running:[],tasks:[{division:'operations',status:'queued',project:'API Project'}]};
  const conversation=officeVirtualCheckin(state,automaticOfficeDivisions);
  assert.ok(conversation);
  assert.equal(conversation.first,'operations');
  assert.notEqual(conversation.second,'hr');
  assert.match(conversation.text,/API Project/);
  assert.match(conversation.reply,/status di Anshel|catatan tugas|draf/i);
  assert.ok(!conversation.text.includes('Rahasia'));
});

test('owner-only monitor dashboard exists and displays tracked employee work',async()=>{
  const html=await readFile('public/index.html','utf8');
  const app=await readFile('public/app.js','utf8');
  assert.match(html,/data-panel="monitor"/);
  assert.match(app,/function renderMonitoring\(\)/);
  assert.match(app,/snapshot\.people/);
  assert.match(app,/t\.status==='completed'/);
  assert.match(app,/renderTasks\(results,false\)/);
  assert.match(app,/panel==='monitor'/);
});


test('owner can ask two employees to discuss grounded context; one Gemini call and threaded pair replies',async()=>{
  assert.deepEqual(requestedOfficeDiscussion('Alya dan Bima, diskusikan status pemeriksaan API terbaru'),[
    'management','operations',
  ]);
  assert.deepEqual(requestedOfficeDiscussion('Citra dan Dara, bahas catatan rapat yang kemarin'),[
    'administration','hr',
  ]);
  for(const question of ['Alya dan Alya, diskusikan catatan rapat',
    'Alya dan Eka, diskusikan tugas terbaru',
    'Bima, tolong cek kondisi layanan API',
    'Guys, ayo diskusi soal tugas'])assert.equal(requestedOfficeDiscussion(question),null);
  const store=createStore(':memory:',()=>base);
  sent.length=0;
  try {
    const prep=await prepareOfficeNaturalChat(store,env,msg(33001,
      'Alya dan Bima, diskusikan status pemeriksaan API terbaru'),fakeTelegram);
    assert.equal(prep.mode,'generate');
    assert.equal(prep.group,true);
    assert.deepEqual(prep.recipients,['management','operations']);
    assert.deepEqual(prep.request.generationConfig.responseSchema.required,['management','operations']);
    assert.equal(sent.length,0);
    const output=JSON.stringify({
      management:'Kalau belum ada pemeriksaan, kita bisa menyusun prioritas pengecekan nanti.',
      operations:'Setuju. Aku perlu gejala atau data pemeriksaan dulu supaya nggak menebak.',
      finance:'Aku juga ikut!',
    });
    const end=await deliverOfficeNaturalChat(store,env,{
      updateId:prep.updateId,ticket:prep.ticket,output},fakeTelegram);
    assert.deepEqual(end.divisions,['management','operations']);
    assert.equal(sent.length,2);
    assert.ok(sent[0].url.includes(tokens.management));
    assert.ok(sent[1].url.includes(tokens.operations));
    assert.equal(sent[1].body.reply_parameters.message_id,801);
    assert.ok(sent.every(x=>!x.body.text.includes('Aku juga ikut!')));
    await assert.rejects(deliverOfficeNaturalChat(store,env,{
      updateId:prep.updateId,ticket:prep.ticket,output},fakeTelegram),e=>e.status===409);
  }finally{store.close();}
});

test('busy target remains excluded from direct two-person discussion',async()=>{
  const store=createStore(':memory:',()=>base);
  try{
    const task=store.create({division:'operations',kind:'draft',
      description:'Menyiapkan draf spesifikasi API',urgent:true});
    assert.equal(store.claim(['draft']).id,task.id);
    const prep=await prepareOfficeNaturalChat(store,env,msg(33002,
      'Alya dan Bima, diskusikan penanganan layanan API yang terhambat'));
    assert.equal(prep.group,true);
    assert.deepEqual(prep.recipients,['management']);
    assert.deepEqual(prep.request.generationConfig.responseSchema.required,['management']);
  }finally{store.close();}
});


test('Telegram /aktivitas never prints undefined when a task has no project',()=>{
  const state={worker:false,people:{
    management:{activity:'read',executing:false},
    administration:{activity:'coffee',executing:false},
  },tasks:[
    {division:'management',status:'completed',sha256:'abc123',project:null},
    {division:'administration',status:'queued',project:'Agenda Rapat'},
  ]};
  const text=officeActivityReply(state);
  assert.doesNotMatch(text,/undefined|null|\[object Object\]/i);
  assert.match(text,/Alya:.*tanpa nama proyek, hasil draf tercatat/i);
  assert.match(text,/Citra:.*Agenda Rapat, antre/i);
});

test('responsive UI keeps all five tabs visible including Monitor on mobile',async()=>{
  const html=await readFile('public/index.html','utf8');
  const css=await readFile('public/office.css','utf8');
  const tabNames=['office','projects','monitor','audit','tasks'];
  for(const name of tabNames)assert.match(html,new RegExp('data-panel="'+name+'"'));
  assert.match(css,/\.actions\{left:10px;right:10px;bottom:10px;transform:none;/);
  assert.match(css,/\.floating-task\{right:10px;bottom:65px;/);
  assert.match(css,/\.nav-button\{position:relative;flex:1;min-width:0;/);
  assert.match(css,/\.nav-button span\{position:static;width:auto;height:auto;overflow:visible;/);
});
