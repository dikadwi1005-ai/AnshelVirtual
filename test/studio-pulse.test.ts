import assert from 'node:assert/strict';
import test from 'node:test';
import {createStore} from '../server/store.ts';
import {createCloudApi} from '../api/route.ts';

const token='fixture-api-token-for-studio-000000';

test('owner Studio schedule shows only authenticated Auto Office contact, not fabricated job success',async()=>{
  const now=Date.now();
  const store=createStore(':memory:',()=>now);
  const env={N8N_TOKEN:token,
    TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
    TELEGRAM_BOT_TOKENS_JSON:'{}',STUDIO_SCHEDULER_ENABLED:'true',
    STUDIO_SCHEDULER_USE_AUTO_OFFICE:'true'};
  // SQLite does not implement cloud login/session storage. Inject only the
  // cloud session predicate so the API's cookie gate remains under test.
  const sessionFixture=new Proxy(store,{get(target,key){
    return key==='sessionActive'?async()=>true:target[key];
  }});
  const api=createCloudApi(sessionFixture,env);
  const req=(path,options)=>api.fetch(new Request('https://anshel.example'+path,options));
  try {
    const unauth=await req('/api/studio/schedule');
    assert.equal(unauth.status,401);
    const cookie='anshel='+('a'.repeat(64));
    const initial=await req('/api/studio/schedule',{headers:{cookie}});
    assert.equal(initial.status,200);
    const before=await initial.json();
    assert.equal(before.autoOffice,true);
    assert.equal(before.lastAutoOfficeDispatchAt,null);
    assert.deepEqual(before.plans,[]);
    const dispatch=await req('/api/integrations/office-group/dispatch',{
      method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:'{}',
    });
    assert.equal(dispatch.status,200);
    const result=await dispatch.json();
    assert.deepEqual(result.studio,{status:'checked',processed:0,phase:store.state().phase});
    const observed=await req('/api/studio/schedule',{headers:{cookie}});
    const after=await observed.json();
    assert.equal(after.lastAutoOfficeDispatchAt,now);
    assert.equal(after.plans.length,0);
    assert.equal(store.state().tasks.length,0);
  }finally{store.close();}
});
