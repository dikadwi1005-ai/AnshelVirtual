import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.ts';
import { scheduledDraftDay } from '../server/schedule.ts';
import {
  ownerMessageDailyLimit,ownerMessageMinimumGapMs,ownerUpdateHistorySize,
  evaluateOwnerGroupUpdate,
} from '../server/telegram-owner-limits.ts';

test('owner may send 1000 Telegram messages per WIB day without the old 20-message restriction',()=>{
  assert.equal(ownerMessageDailyLimit,1000);
  assert.equal(ownerMessageMinimumGapMs,2000);
  assert.ok(ownerUpdateHistorySize>=2*ownerMessageDailyLimit);
  const at=Date.parse('2026-11-12T03:00:00Z');
  const day=scheduledDraftDay(new Date(at));
  let record={seen:[],at:0,date:'',used:0};
  for(let index=1;index<=ownerMessageDailyLimit;index++) {
    const reservation=evaluateOwnerGroupUpdate(record,String(index),at+(index-1)*2000,day);
    assert.ok(reservation.checkpoint,'update '+index+' should be allowed');
    record=reservation.checkpoint;
  }
  assert.equal(record.used,1000);
  assert.equal(record.seen.length,1000);
  assert.deepEqual(evaluateOwnerGroupUpdate(record,'1000',at+1000*2000,day),{duplicate:true});
  assert.deepEqual(evaluateOwnerGroupUpdate(record,'1001',at+1000*2000,day),{reason:'daily-limit'});
});

test('too-fast rejection does not consume message quota; exact two-second spacing works',()=>{
  const at=Date.parse('2026-11-12T03:00:00Z');
  const day=scheduledDraftDay(new Date(at));
  const first=evaluateOwnerGroupUpdate({seen:[],at:0,date:'',used:0},'101',at,day);
  assert.equal(first.checkpoint.used,1);
  assert.deepEqual(evaluateOwnerGroupUpdate(first.checkpoint,'102',at+1999,day),{reason:'too-fast'});
  assert.equal(first.checkpoint.used,1);
  const second=evaluateOwnerGroupUpdate(first.checkpoint,'102',at+2000,day);
  assert.equal(second.checkpoint.used,2);
  assert.deepEqual(evaluateOwnerGroupUpdate(second.checkpoint,'101',at+2001,day),{duplicate:true});
});

test('old 20-message checkpoint is accepted immediately and quota rolls over in WIB',()=>{
  const before=Date.parse('2026-11-12T16:59:57Z');
  const day=scheduledDraftDay(new Date(before));
  const old={date:day,used:20,at:before-2000,seen:[{id:'old',at:before-1800}]};
  const u=evaluateOwnerGroupUpdate(old,'new-21',before,day);
  assert.equal(u.checkpoint.used,21);
  const after=Date.parse('2026-11-12T17:00:00Z');
  const nextDay=scheduledDraftDay(new Date(after));
  assert.notEqual(day,nextDay);
  const next=evaluateOwnerGroupUpdate({...u.checkpoint,used:1000},'first-next-day',after,nextDay);
  assert.equal(next.checkpoint.used,1);
  assert.equal(next.checkpoint.date,nextDay);
  assert.deepEqual(evaluateOwnerGroupUpdate(next.checkpoint,'new-21',after+2000,nextDay),{duplicate:true});
});

test('SQLite office-group store accepts more than 20 owner messages and identifies the correct throttle reason',()=>{
  let at=Date.parse('2026-11-12T03:00:00Z');
  const store=createStore(':memory:',()=>at);
  try {
    for(let i=0;i<27;i++){
      assert.equal(store.reserveOfficeGroupUpdate(String(1000+i)),true);
      at+=2000;
    }
    assert.equal(store.reserveOfficeGroupUpdate('1005'),false);
    assert.throws(()=>store.reserveOfficeGroupUpdate('2000'),
      e=>e.status===429&&/2 detik/.test(e.message));
    at+=2000;
    assert.equal(store.reserveOfficeGroupUpdate('2000'),true);
  }finally{store.close();}
});
