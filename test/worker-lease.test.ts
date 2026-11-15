import test from 'node:test';
import assert from 'node:assert/strict';
import {runWithLeaseHeartbeat} from '../server/worker-lease.ts';

test('worker lease: no heartbeat outlives a completed job',async()=>{
  let tick,cleared=false,heartbeats=0;
  const done=await runWithLeaseHeartbeat(async()=>({output:'saved'}),{
    heartbeat:async()=>{heartbeats++;},
    schedule:fn=>{tick=fn;return 1;},unschedule:()=>{cleared=true;},
  });
  assert.deepEqual(done,{result:{output:'saved'},leaseLost:false});
  assert.equal(cleared,true);
  tick();
  await Promise.resolve();
  assert.equal(heartbeats,0);
});

test('worker lease: overlapping interval ticks do not renew the same lease twice',async()=>{
  let tick,resolveHeartbeat,resolveWork,heartbeatCalls=0;
  const work=new Promise(resolve=>{resolveWork=resolve;});
  const inProgress=new Promise(resolve=>{resolveHeartbeat=resolve;});
  const running=runWithLeaseHeartbeat(async()=>work,{
    heartbeat:()=>{heartbeatCalls++;return inProgress;},
    schedule:fn=>{tick=fn;return 1;},unschedule:()=>{},
  });
  tick();tick();tick();
  await Promise.resolve();await Promise.resolve();
  assert.equal(heartbeatCalls,1);
  tick();
  assert.equal(heartbeatCalls,1);
  resolveHeartbeat();
  resolveWork('finished');
  assert.deepEqual(await running,{result:'finished',leaseLost:false});
});

test('worker lease: revoked lease aborts ongoing work and suppresses finishing',async()=>{
  let tick,observedSignal,resolveWork;
  const work=new Promise(resolve=>{resolveWork=resolve;});
  const running=runWithLeaseHeartbeat(async signal=>{
    observedSignal=signal;
    await work;
    return {output:'do not finish'};
  },{
    heartbeat:async()=>{const error=new Error('Lease revoked');error.status=409;throw error;},
    schedule:fn=>{tick=fn;return 1;},unschedule:()=>{},
  });
  tick();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  resolveWork();
  const result=await running;
  assert.equal(result.leaseLost,true);
  assert.equal(observedSignal.aborted,true);
});

test('worker lease: temporary upstream failure is uncertain, not an automatic revocation',async()=>{
  let tick,resolveWork;
  const work=new Promise(resolve=>{resolveWork=resolve;});
  const running=runWithLeaseHeartbeat(async signal=>{
    await work;
    return signal.aborted;
  },{
    heartbeat:async()=>{const error=new Error('Temporary');error.status=503;throw error;},
    schedule:fn=>{tick=fn;return 1;},unschedule:()=>{},
  });
  tick();
  await Promise.resolve();await Promise.resolve();
  resolveWork();
  assert.deepEqual(await running,{result:false,leaseLost:false});
});
