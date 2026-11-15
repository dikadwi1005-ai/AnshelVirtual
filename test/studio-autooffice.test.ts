import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/store.ts';
import { createCloudApi } from '../api/route.ts';

const clock=Date.parse('2026-11-16T03:00:00Z'); // Monday, 10.00 WIB
const token='example-scheduler-token-000000000000';
const baseEnv={
  N8N_TOKEN:token,
  TELEGRAM_CHAT_ID:'-1001234567890',
  TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:'{}',
};
function createRequest(extra={},body={}) {
  return new Request('https://anshel.example/api/integrations/office-group/dispatch',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(body),
  });
}
function schedule(store) {
  const id=randomUUID();
  store.settings({mode:'auto'});
  store.studioSchedule({action:'add',id,label:'Pemeriksaan berkala',kind:'task',when:clock});
  store.studioSchedule({action:'enable',id});
  return id;
}

test('Auto Office dispatch executes explicitly enabled Studio plans once without extra Telegram bots',async()=>{
  const store=createStore(':memory:',()=>clock);
  try {
    const id=schedule(store);
    const api=createCloudApi(store,{...baseEnv,STUDIO_SCHEDULER_ENABLED:'true',
      STUDIO_SCHEDULER_USE_AUTO_OFFICE:'true'});
    const first=await api.fetch(createRequest());
    assert.equal(first.status,200);
    const body=await first.json();
    assert.equal(body.sent,false);
    assert.deepEqual(body.studio,{status:'checked',processed:1,phase:'work'});
    assert.equal(store.studioSchedule().find(plan=>plan.id===id).status,'completed');
    assert.equal(store.state().tasks.length,1);
    assert.equal(store.state().tasks[0].kind,'diagnostic');
    const second=await api.fetch(createRequest());
    assert.equal(second.status,200);
    assert.equal((await second.json()).studio.processed,0);
    assert.equal(store.state().tasks.length,1);
  }finally{store.close();}
});

test('Auto Office Studio integration is opt-in and rejects unauthorized or unexpected requests',async()=>{
  for (const extra of [{},{STUDIO_SCHEDULER_ENABLED:'true'},
    {STUDIO_SCHEDULER_USE_AUTO_OFFICE:'true'}]) {
    const store=createStore(':memory:',()=>clock);
    try {
      const id=schedule(store);
      const api=createCloudApi(store,{...baseEnv,...extra});
      const response=await api.fetch(createRequest());
      assert.equal(response.status,200);
      const data=await response.json();
      assert.equal(data.sent,false);
      assert.equal(data.studio,undefined);
      assert.equal(store.studioSchedule().find(plan=>plan.id===id).status,'planned');
      assert.equal(store.state().tasks.length,0);
      const invalid=await api.fetch(createRequest(extra,{unknown:true}));
      assert.equal(invalid.status,400);
      assert.equal(store.state().tasks.length,0);
      const noToken=await api.fetch(new Request('https://anshel.example/api/integrations/office-group/dispatch',{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
      }));
      assert.equal(noToken.status,401);
    }finally{store.close();}
  }
});
