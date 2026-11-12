import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStore } from '../server/store.ts';
import { scheduledDraftDay, scheduledDraftDailyLimit } from '../server/schedule.ts';
import { createCloudApi } from '../api/route.ts';

const workflow=JSON.parse(await readFile('workflows/office_gemini_scheduled.json','utf8'));
const path='worker/claim-scheduled';
const env={ OWNER_PASSWORD:'local-test-password', WORKER_TOKEN:'local-fixture-worker-token-24' };

function fixture(clock) {
  const store=createStore(':memory:',()=>clock.value);
  const api=createCloudApi({
    ...store,sessionActive:async()=>false,
    recordLogin:async()=>{},createSession:async()=>{},
  },env);
  async function call(payload={},auth=true) {
    return api.fetch(new Request('https://fixture.example/api/'+path,{
      method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+env.WORKER_TOKEN}:{})},
      body:JSON.stringify(payload),
    }));
  }
  return {store,call};
}

test('trigger tetap nonaktif sampai dipublikasi; jam WIB, kredensial tak tersimpan',()=>{
  assert.equal(workflow.active,false);
  assert.equal(workflow.nodes.length,7);
  const trigger=workflow.nodes[0];
  assert.equal(trigger.name,'Jadwal kerja WIB');
  assert.equal(trigger.type,'n8n-nodes-base.scheduleTrigger');
  assert.equal(trigger.parameters.rule.interval[0].expression,'*/20 9-16 * * 1-5');
  assert.equal(workflow.settings.timezone,'Asia/Jakarta');
  assert.ok(workflow.nodes.every(node=>!node.credentials));
  assert.ok(!workflow.nodes.some(node=>node.type==='n8n-nodes-base.manualTrigger'));
  const claim=workflow.nodes[1];
  assert.equal(claim.parameters.url,'https://anshel-virtual.vercel.app/api/worker/claim-scheduled');
  assert.match(claim.parameters.jsonBody,/JSON\.stringify\(\{\}\)/);
  assert.equal(workflow.connections[trigger.name].main[0][0].node,claim.name);
  assert.equal(workflow.connections[claim.name].main[0][0].node,'Siapkan draf');
  assert.equal(workflow.connections['Periksa hasil'].main[0][0].node,'Perpanjang sewa');
  assert.equal(workflow.connections['Perpanjang sewa'].main[0][0].node,'Simpan hasil');
  assert.equal(scheduledDraftDailyLimit,3);
});

test('hanya satu reservasi per klaim; kuota tiga pada hari WIB yang sama',async()=>{
  const clock={value:Date.parse('2026-11-12T03:00:00Z')}; // Kamis 10.00 WIB
  const {store,call}=fixture(clock);
  try {
    for(const division of ['finance','management','creative','research','qa']) {
      store.create({division,kind:'draft',description:'Draf nonrahasia '+division,urgent:false});
    }
    assert.equal((await call({},false)).status,401);
    assert.equal((await call({kinds:['diagnostic']})).status,400);
    for(let i=0;i<3;i++){
      const result=await call();
      assert.equal(result.status,200);
      const {task}=await result.json();
      assert.ok(task?.id);
    }
    const limited=await (await call()).json();
    assert.deepEqual(limited,{task:null});
    const state=store.state();
    assert.equal(state.tasks.filter(task=>task.status==='running').length,3);
    assert.equal(state.tasks.filter(task=>task.status==='queued').length,2);
    assert.equal(state.audit.filter(event=>event.action==='scheduled_reserved').length,3);
    const manual=store.claim(['draft']);
    assert.ok(manual,'klaim manual tetap tersedia di luar kuota jadwal');
  } finally {store.close();}
});

test('kuota otomatis reset di tanggal WIB berikutnya; mengabaikan tugas kosong',async()=>{
  const clock={value:Date.parse('2026-11-12T03:00:00Z')};
  const {store,call}=fixture(clock);
  try {
    assert.deepEqual(await (await call()).json(),{task:null});
    for(const division of ['finance','management','creative','research']) {
      store.create({division,kind:'draft',description:'Draf kedua '+division});
    }
    for(let i=0;i<3;i++)assert.ok((await (await call()).json()).task);
    assert.deepEqual(await (await call()).json(),{task:null});
    clock.value=Date.parse('2026-11-13T03:00:00Z'); // Jumat 10.00 WIB
    const next=await (await call()).json();
    assert.ok(next.task?.id,'hari kerja berikutnya membuka kuota baru');
  } finally {store.close();}
});

test('hari libur/nonkerja tidak memanggil Gemini, walaupun tugas urgent',async()=>{
  const clock={value:Date.parse('2026-11-14T03:00:00Z')}; // Sabtu
  const {store,call}=fixture(clock);
  try {
    store.create({division:'finance',kind:'draft',description:'Tugas hari libur',urgent:true});
    assert.deepEqual(await (await call()).json(),{task:null});
    assert.equal(store.state().tasks[0].status,'queued');
    assert.ok(store.claim(['draft']),'manual tetap boleh mengambil urgent di luar jam kerja');
  } finally {store.close();}
});

test('tanggal quota mengikuti WIB dan bukan tanggal UTC',()=>{
  assert.equal(scheduledDraftDay(new Date('2026-11-12T16:59:00Z')),'2026-11-12');
  assert.equal(scheduledDraftDay(new Date('2026-11-12T17:01:00Z')),'2026-11-13');
});
