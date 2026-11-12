import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createCloudApi } from '../api/route.ts';
import { createStore } from '../server/store.ts';

const workflow=JSON.parse(await readFile('workflows/office_gemini_pilot.json','utf8'));
const code=name=>workflow.nodes.find(node=>node.name===name).parameters.jsCode;
function run(name,json,prior={}) {
  return JSON.parse(JSON.stringify(runInNewContext(`(()=>{${code(name)}})()`,{
    $input:{first:()=>({json})},$:node=>({first:()=>({json:prior[node]})}),
  })));
}

test('pilot memilih satu draf, membatasi isi permintaan Gemini dan memverifikasi artefak',async()=>{
  const store=createStore(':memory:',()=>Date.parse('2026-11-12T04:30:00Z'));
  const env={OWNER_PASSWORD:'fixture-password-only',WORKER_TOKEN:'fixture-worker-token-only-24'};
  const sessions=new Set();
  const api=createCloudApi({...store,recordLogin:async()=>{},createSession:async token=>sessions.add(token),
    sessionActive:async token=>sessions.has(token)},env);
  const call=(path,{body,cookie,worker=false}={})=>api.fetch(new Request('https://anshel.fixture/api/'+path,{
    method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),
      ...(cookie?{Cookie:cookie}:{}),...(worker?{Authorization:'Bearer '+env.WORKER_TOKEN}:{})},
    body:body?JSON.stringify(body):undefined,
  }));
  try {
    assert.equal(workflow.active,false);
    assert.equal(workflow.nodes[0].type,'n8n-nodes-base.manualTrigger');
    assert.throws(()=>run('Tugas uji',{}),/Isi UUID/);
    const first=store.create({division:'development',description:'Draf lain yang tidak ikut pilot',kind:'draft',urgent:true,priority:2});
    const target=store.create({division:'management',description:'Tulis agenda fiktif tiga poin',kind:'draft',urgent:true});
    const claim={kinds:['draft'],taskId:target.id};
    assert.equal((await call('worker/claim-task',{body:claim})).status,401);
    assert.equal((await call('worker/claim-task',{body:{kinds:['draft']},worker:true})).status,400);
    const response=await call('worker/claim-task',{body:claim,worker:true});
    assert.equal(response.status,200);
    const {task}=await response.json();
    assert.equal(task.id,target.id);
    assert.equal(store.state().tasks.find(row=>row.id===first.id).status,'queued');
    assert.deepEqual(run('Siapkan draf',{task:null}),[]);
    const [{json:prepared}]=run('Siapkan draf',{task},{'Tugas uji':{taskId:target.id}});
    assert.equal(prepared.request.contents[0].parts[0].text,target.description);
    assert.match(prepared.request.systemInstruction.parts[0].text,/divisi Manajemen/);
    assert.match(prepared.request.systemInstruction.parts[0].text,/Jangan mengarang tanggal/);
    const [{json:financeDraft}]=run('Siapkan draf',{task:{...task,division:'finance',project:'Tester'}},{'Tugas uji':{taskId:target.id}});
    assert.match(financeDraft.request.systemInstruction.parts[0].text,/divisi Keuangan, proyek Tester/);
    assert.equal(workflow.connections['Periksa hasil'].main[0][0].node,'Perpanjang sewa');
    assert.equal(workflow.connections['Perpanjang sewa'].main[0][0].node,'Simpan hasil');
    assert.match(workflow.nodes.find(node=>node.name==='Simpan hasil').parameters.jsonBody,/Periksa hasil/);
    assert.doesNotMatch(JSON.stringify(prepared.request),new RegExp(task.token));
    assert.doesNotMatch(JSON.stringify(prepared.request),/Draf lain/);
    const [{json:finished}]=run('Periksa hasil',{
      statusCode:200,body:{candidates:[{finishReason:'STOP',content:{parts:[
        {thought:true,text:'Teks internal'},{text:'Agenda fiktif: cek prioritas dan rangkum keputusan.'},
      ]}}]},
    },{'Siapkan draf':prepared});
    assert.doesNotMatch(finished.output,/Teks internal/);
    assert.equal((await call('worker/finish',{body:finished,worker:true})).status,200);
    const url='tasks/'+target.id+'/artifact';
    assert.equal((await call(url)).status,401);
    const login=await call('login',{body:{password:env.OWNER_PASSWORD}});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const artifact=await call(url,{cookie});
    assert.equal(await artifact.text(),finished.output);
    assert.equal(artifact.headers.get('x-artifact-sha256'),createHash('sha256').update(finished.output).digest('hex'));
    assert.deepEqual(await (await call('worker/claim-task',{body:claim,worker:true})).json(),{task:null});
  } finally { store.close(); }
});

test('kuota dan gangguan provider tidak menghasilkan artefak sukses',()=>{
  const context={'Siapkan draf':{id:'id-uji',token:'lease-uji'}};
  for (const response of [{statusCode:429},{statusCode:503},{error:{message:'transport'}}]) {
    const [{json:result}]=run('Periksa hasil',response,context);
    assert.equal(result.unavailable,true);
    assert.equal(result.output,undefined);
  }
  const [{json:partial}]=run('Periksa hasil',{statusCode:200,body:{candidates:[{
    finishReason:'MAX_TOKENS',content:{parts:[{text:'hasil terpotong'}]},
  }]}},context);
  assert.equal(partial.output,undefined);
  assert.match(partial.error,/terpotong/);
});

test('draf memiliki sewa lebih panjang dan heartbeat memperpanjang masa kerja',()=>{
  let clock=Date.parse('2026-11-12T04:30:00Z');
  const store=createStore(':memory:',()=>clock);
  try {
    const draft=store.create({division:'finance',project:'Tester',description:'Agenda tiga poin',kind:'draft',urgent:true});
    const lease=store.claim(['draft'],draft.id);
    assert.ok(lease?.token);
    clock+=130_000; // Lebih dari batas lama dua menit.
    assert.doesNotThrow(()=>store.heartbeat(draft.id,lease.token));
    clock+=130_000;
    assert.doesNotThrow(()=>store.finish(draft.id,lease.token,{output:'Agenda keuangan: satu, dua, tiga.'}));
    assert.equal(store.state().tasks.find(item=>item.id===draft.id).status,'completed');
  } finally {store.close();}
});

test('diagnostik tetap menggunakan sewa singkat',()=>{
  let clock=Date.parse('2026-11-12T04:30:00Z');
  const store=createStore(':memory:',()=>clock);
  try {
    const task=store.create({division:'operations',description:'Uji diagnostik',kind:'diagnostic',urgent:true});
    const lease=store.claim(['diagnostic'],task.id);
    assert.ok(lease?.token);
    clock+=121_000;
    assert.throws(()=>store.heartbeat(task.id,lease.token),/Sewa eksekusi sudah berakhir/);
  } finally {store.close();}
});
