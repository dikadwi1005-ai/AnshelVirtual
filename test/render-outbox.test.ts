import assert from 'node:assert/strict';
import test from 'node:test';
import { isolatedRenderQueue, renderManifest } from '../server/studio-render-jobs.ts';
import { nationOutbox } from '../server/nation-outbox.ts';

test('portrait queue deduplicates manifests, permits one lease, and fences an expired or cancelled runner',()=>{
  let now=0;
  const queue=isolatedRenderQueue(':memory:',()=>now);
  try {
    const input={version:1,sceneBuild:'b'.repeat(64),shots:[{replay:'a'.repeat(64),camera:'campus',start:0,end:1200}]};
    const first=queue.enqueue(input);
    assert.equal(queue.enqueue({...input,untracked:'ignored'}).id,first.id);
    assert.throws(()=>renderManifest({...input,shots:[{...input.shots[0],end:90001}]}),/90 detik/);
    const other=queue.enqueue({...input,shots:[{...input.shots[0],camera:'employee-hr'}]});
    const worker=queue.claim();
    assert.ok(worker);
    assert.equal(queue.claim(),null);
    assert.ok(queue.pulse(worker.id,worker.lease,41));
    now+=61000;
    const successor=queue.claim();
    assert.ok(successor);
    assert.equal(queue.finish(worker.id,worker.lease,'a'.repeat(64)),false);
    assert.ok(queue.cancel(successor.id));
    assert.equal(queue.pulse(successor.id,successor.lease,70),false);
    assert.ok(queue.retry(successor.id));
    const retry=queue.claim();
    assert.ok(queue.finish(retry.id,retry.lease,'c'.repeat(64)));
    assert.equal(queue.get(retry.id).state,'completed');
    assert.ok(queue.get(retry.id===first.id?other.id:first.id));
  } finally { queue.close(); }
});

test('Nation outbox retries a network failure with the same idempotency key and excludes task data',async()=>{
  let now=0, requests=0;
  const config={enabled:true,url:'https://nation.example.org/events',token:'fixture-token',regionId:'anshel-district'};
  const outbox=nationOutbox(':memory:',config,async (url,options)=>{
    requests++;
    assert.equal(url.origin,'https://nation.example.org');
    assert.equal(options.redirect,'error');
    const event=JSON.parse(options.body as string);
    assert.equal((options.headers as Record<string,string>)['Idempotency-Key'],event.eventId);
    assert.deepEqual(Object.keys(event).sort(),['entityId','eventId','occurredAt','regionId','type','version']);
    if (requests===1) throw new Error('network fixture');
    return new Response(null,{status:204});
  },()=>now);
  try {
    const input={entityId:'anshel:agent:management',type:'milestone.awarded',sourceId:'first',occurredAt:0,privateTask:'secret fixture'};
    const id=outbox.publish(input);
    assert.equal(outbox.publish(input),id);
    assert.equal((await outbox.flush()).health,'degraded');
    assert.equal((await outbox.flush()).health,'idle');
    now+=10000;
    assert.deepEqual(await outbox.flush(),{health:'connected',id});
    assert.equal((await outbox.flush()).health,'idle');
    assert.equal(requests,2);
    assert.throws(()=>outbox.publish({...input,type:'task.result'}));
  } finally { outbox.close(); }
});
