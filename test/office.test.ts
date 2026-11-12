import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createStore } from '../server/store.ts';
import { officeServer } from '../server/http.ts';
import { phase, defaults } from '../server/schedule.ts';
import { employeePlans } from '../public/behavior.js';

const payload = {description:'Periksa SQLite lokal',division:'operations',kind:'diagnostic'};
const working = Date.parse('2026-11-11T03:15:00Z');
const fault = status => error => error.status === status;

test('jadwal WIB, hari libur, jeda, dan pergantian sesi',()=>{
  const at = (time)=>new Date('2026-11-11T'+time+':00+07:00');
  assert.equal(phase(at('08:44')),'closed');
  assert.equal(phase(at('08:45')),'arrival');
  assert.equal(phase(at('09:00')),'briefing');
  assert.equal(phase(at('09:15')),'work');
  assert.equal(phase(at('12:00')),'lunch');
  assert.equal(phase(at('13:00')),'work');
  assert.equal(phase(at('16:30')),'review');
  assert.equal(phase(at('17:00')),'closed');
  assert.equal(phase(at('09:30'),{...defaults,holidays:['2026-11-11']}),'closed');
  assert.equal(phase(at('10:00'),defaults,'paused'),'paused');
});

test('antrean SQLite bertahan setelah database ditutup dan permintaan berulang aman',async()=>{
  const dir = await mkdtemp(join(tmpdir(),'anshel-'));
  const path = join(dir,'office.sqlite');
  let store = createStore(path,()=>working);
  try {
    const task=store.create(payload,'Dika','same-request');
    assert.equal(store.create(payload,'Dika','same-request').id,task.id);
    assert.throws(()=>store.create({...payload,description:'Lain'},'Dika','same-request'),fault(409));
    store.close();
    store=createStore(path,()=>working);
    assert.equal(store.state().tasks[0].id,task.id);
    assert.equal(store.state().audit.length,2);
  } finally { store.close(); await rm(dir,{recursive:true}); }
});

test('alih divisi, persetujuan, prioritas, artefak, dan akses ke hasil',()=>{
  const store=createStore(':memory:',()=>working);
  try {
    const first=store.create(payload);
    const second=store.create({...payload,priority:2});
    assert.throws(()=>store.artifact(second.id),fault(404));
    assert.throws(()=>store.action(first.id,'constructor'),fault(409));
    store.action(first.id,'assign',{division:'qa'});
    store.action(first.id,'review');
    assert.equal(store.state().counts.awaiting_approval,1);
    store.action(first.id,'approve');
    const task=store.claim(['diagnostic']);
    assert.equal(task.id,second.id);
    assert.throws(()=>store.finish(task.id,'wrong',{output:'uji'}),fault(409));
    assert.throws(()=>store.finish(task.id,task.token,{output:''}),fault(400));
    store.finish(task.id,task.token,{output:'hasil diagnostik'});
    assert.deepEqual(store.artifact(task.id),{output:'hasil diagnostik',hash:createHash('sha256').update('hasil diagnostik').digest('hex')});
    assert.equal(store.claim(['diagnostic']).division,'qa');
  } finally { store.close(); }
});

test('worker offline, lease kedaluwarsa, retry, jeda, dan pembatalan',()=>{
  let now = working;
  const store=createStore(':memory:',()=>now);
  try {
    const pending=store.create({...payload,kind:'draft'});
    assert.equal(store.claim(['diagnostic']),null);
    assert.equal(store.state().counts.queued,1);
    const running=store.claim(['draft']);
    now+=605_000;
    assert.equal(store.state().worker,false);
    assert.equal(store.state().counts.blocked,1);
    assert.throws(()=>store.finish(running.id,running.token,{output:'basi'}),fault(409));
    store.action(pending.id,'retry');
    const rerun=store.claim(['draft']);
    assert.equal(rerun.attempts,2);
    store.action(rerun.id,'pause');
    assert.equal(store.claim(['draft']),null);
    store.action(rerun.id,'resume');
    const next=store.claim(['draft']);
    assert.equal(next.id,pending.id);
    store.action(next.id,'cancel');
    assert.equal(store.state().counts.cancelled,1);
    assert.throws(()=>store.finish(next.id,next.token,{output:'basi'}),fault(409));
  } finally { store.close(); }
});

test('di luar jam kerja hanya tugas darurat yang dapat diambil',()=>{
  const store=createStore(':memory:',()=>Date.parse('2026-11-11T13:00:00Z'));
  try {
    store.create(payload);
    assert.equal(store.claim(['diagnostic']),null);
    const emergency=store.create({...payload,urgent:true});
    assert.equal(store.claim(['diagnostic']).id,emergency.id);
    store.settings({mode:'paused'});
    assert.equal(store.claim(['diagnostic']),null);
  } finally { store.close(); }
});

test('rencana karyawan membedakan tugas dalam antrean dari eksekusi worker',()=>{
  const a=employeePlans(working,'closed',[]);
  assert.deepEqual(employeePlans(working,'closed',[]),a);
  const task={id:'id',division:'operations',description:'uji'};
  const b=employeePlans(working,'closed',[task]);
  assert.equal(b.operations.activity,'work');
  assert.equal(b.operations.task,task);
  assert.equal(b.operations.executing,true);
  assert.notEqual(a.operations.activity,'work');
  const queued={...task,status:'queued'};
  assert.deepEqual(employeePlans(working,'closed',[],[queued]).operations,{
    activity:'desk',task:queued,executing:false,mood:'Siap',energy:80,
  });
  assert.deepEqual(employeePlans(working,'closed',[]).operations,a.operations);
});

test('sesi privat, pembatasan origin, token, allowlist Telegram, dan kontrak n8n',async()=>{
  const store=createStore(':memory:',()=>working);
  const config={OWNER_PASSWORD:'ownerpass123',WORKER_TOKEN:'test-worker-long-random-token',
    N8N_TOKEN:'test-n8n-long-random-token',TELEGRAM_USER_ID:'42',TELEGRAM_CHAT_ID:'7'};
  const server=officeServer(store,config);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const post=(path,data,headers={})=>fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  try {
    assert.equal((await fetch(base+'/api/state')).status,401);
    assert.equal((await post('login',{password:'wrong'})).status,401);
    assert.equal((await post('login',{password:config.OWNER_PASSWORD},{Origin:'https://elsewhere.example'})).status,403);
    const login=await post('login',{password:config.OWNER_PASSWORD});
    assert.equal(login.status,200);
    assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    const Cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base+'/api/state',{headers:{Cookie}})).status,200);
    assert.equal((await post('worker/claim',{kinds:['diagnostic']},{Cookie})).status,401);
    const data={userId:42,chatId:7,updateId:1,text:'Suruh tim SEO audit website BCIFT'};
    const Authorization='Bearer '+config.N8N_TOKEN;
    assert.equal((await post('integrations/telegram',data)).status,401);
    assert.equal((await post('integrations/telegram',{...data,userId:41},{Authorization})).status,403);
    const first=await post('integrations/telegram',data,{Authorization}).then(response=>response.json());
    const repeat=await post('integrations/telegram',data,{Authorization}).then(response=>response.json());
    assert.equal(first.reply,repeat.reply);
    assert.equal(store.state().tasks.length,1);
    assert.equal(store.state().tasks[0].division,'marketing');
    const report=await post('integrations/report',{},{Authorization}).then(response=>response.json());
    assert.equal(report.chatId,'7');
    assert.match(report.reply,/Antrean: 1/);
    assert.equal((await post('logout',{},{Cookie})).status,200);
    assert.equal((await fetch(base+'/api/state',{headers:{Cookie}})).status,401);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    store.close();
  }
});

test('proses worker yang sebenarnya menghasilkan artefak diagnostik dari Node dan SQLite',async()=>{
  const store=createStore(':memory:',()=>working);
  const token='test-worker-long-random-token';
  const server=officeServer(store,{WORKER_TOKEN:token});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address='http://127.0.0.1:'+server.address().port;
  const task=store.create(payload);
  const worker=spawn(process.execPath,['server/worker.ts'],{
    env:{...process.env,WORKER_TOKEN:token,OFFICE_URL:address,OLLAMA_MODEL:''},stdio:'ignore',
  });
  const exit = new Promise(resolve=>worker.once('close',resolve));
  try {
    for (let i=0;i<100 && !store.state().counts.completed;i++) await delay(50);
    const {output,hash}=store.artifact(task.id);
    const result=JSON.parse(output);
    assert.equal(result.node,process.version);
    assert.equal(result.sqliteDalamMemori,'ok');
    assert.ok(result.memoriTotalByte>0);
    assert.equal(hash,createHash('sha256').update(output).digest('hex'));
    assert.ok(store.state().audit.some(entry=>entry.action==='running'));
  } finally {
    worker.kill();
    await exit;
    await new Promise(resolve=>server.close(resolve));
    store.close();
  }
});
