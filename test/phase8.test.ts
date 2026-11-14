import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.ts';
import { runAutomation } from '../server/studio-schedule.ts';
import { createNationCity } from '../server/nation-city.ts';
import { createCloudApi } from '../api/route.ts';

test('rapat melindungi revisi dan mempertahankan empat peserta, notulen dan kehadiran',()=>{
  const store=createStore(':memory:');
  try {
    const id=randomUUID(), participants=['qa','research','marketing','development'];
    const opened=store.studioMeeting({action:'start',revision:0,id,agenda:'Rapat',participants});
    assert.throws(()=>store.studioMeeting({action:'close',revision:0,id}),{status:409});
    assert.throws(()=>store.studioMeeting({action:'close',revision:1,id,notes:'',decisions:'',attended:['video']}),{status:400});
    store.studioMeeting({action:'save',revision:opened.revision,id,notes:'Catatan',decisions:'',attended:participants.slice(0,2)});
    store.studioMeeting({action:'close',revision:2,id,notes:'Catatan akhir',decisions:'Selesai',attended:participants.slice(2)});
    const saved=store.studioMeeting();
    assert.equal(saved.active,null);
    assert.deepEqual(saved.history[0].attended,participants);
    assert.equal(saved.history[0].notes,'Catatan akhir');
  } finally { store.close(); }
});

test('scheduler berjalan tanpa browser, default nonaktif, mematuhi kalender dan membuat satu tugas',async()=>{
  let now=Date.parse('2026-11-16T03:00:00Z');
  const store=createStore(':memory:',()=>now);
  try {
    const id=randomUUID();
    store.studioSchedule({action:'add',id,label:'Periksa alat',kind:'task',when:now});
    assert.equal((await runAutomation(store,now)).processed,0);
    store.studioSchedule({action:'enable',id});
    store.settings({mode:'closed'});
    assert.equal((await runAutomation(store,now)).processed,0);
    store.settings({mode:'auto'});
    await Promise.all([runAutomation(store,now),runAutomation(store,now)]);
    assert.equal(store.state().tasks.length,1);
    assert.equal(store.state().tasks[0].kind,'diagnostic');
    assert.equal(store.studioSchedule()[0].status,'completed');
    now+=1000;
    assert.equal((await runAutomation(store,now)).processed,0);
  } finally { store.close(); }
});

test('Nation City is opt-in, streams a bounded response and keeps a short last-good cache',async()=>{
  let now=0,calls=0,valid=true;
  const snapshot={version:1,status:'online',updatedAt:'2026-11-14T02:00:00Z',events:[]};
  const fetcher=async (url,options)=>{
    calls++;
    assert.equal(url.hostname,'api.example.org');
    assert.equal(options.redirect,'error');
    return new Response(valid?JSON.stringify(snapshot):'x'.repeat(64001),{headers:{'Content-Type':'application/json'}});
  };
  const env={NATION_CITY_READ_URL:'https://api.example.org/snapshot'};
  assert.equal((await createNationCity(env,fetcher)()).connection,'unconfigured');
  const read=createNationCity({...env,NATION_CITY_ENABLED:'true'},fetcher,()=>now);
  assert.deepEqual(await read(),{connection:'live',snapshot});
  await read();
  assert.equal(calls,1);
  valid=false;
  now=31000;
  assert.deepEqual(await read(),{connection:'offline',snapshot});
  now=310000;
  assert.deepEqual(await read(),{connection:'offline',snapshot:null});
});

test('cloud Studio stays private and scheduler token cannot bypass the disabled flag',async()=>{
  const store=createStore(':memory:');
  const token='test-fixture-token-for-scheduler';
  const api=createCloudApi(store,{N8N_TOKEN:token});
  try {
    const request=(path,options)=>api.fetch(new Request('https://anshel.example/api/'+path,options));
    assert.equal((await request('studio/meetings')).status,401);
    assert.equal((await request('studio/nation-city')).status,401);
    assert.equal((await request('studio/schedule',{method:'POST',headers:{origin:'https://other.example'}})).status,403);
    const path='integrations/studio-tick';
    assert.equal((await request(path,{method:'POST'})).status,401);
    assert.equal((await request(path,{method:'POST',headers:{authorization:'Bearer '+token}})).status,404);
  } finally { store.close(); }
});

test('SQLite backup restores Studio meeting and server schedule in a separate file',()=>{
  const root=mkdtempSync(join(tmpdir(),'anshel-phase8-'));
  const source=join(root,'office.sqlite'), target=join(root,'restored.sqlite');
  try {
    const id=randomUUID(), store=createStore(source);
    try {
      store.studioMeeting({action:'start',revision:0,id,agenda:'Fixture',participants:['qa','research']});
      store.studioSchedule({action:'add',id:randomUUID(),kind:'report',label:'Fixture',when:Date.now()});
    } finally { store.close(); }
    const reader=new DatabaseSync(source,{readOnly:true});
    try { reader.prepare('VACUUM INTO ?').run(target); } finally { reader.close(); }
    const restored=createStore(target);
    try {
      assert.equal(restored.studioMeeting().active.id,id);
      assert.equal(restored.studioSchedule()[0].status,'disabled');
    } finally { restored.close(); }
  } finally {
    for (const file of [source,target]) for (const suffix of ['','-wal','-shm','-journal']) {
      try { unlinkSync(file+suffix); } catch (error) { if (error.code!=='ENOENT') throw error; }
    }
    rmdirSync(root);
  }
});
