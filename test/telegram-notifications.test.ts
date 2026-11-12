import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.ts';

const start=Date.parse('2026-11-12T03:00:00Z');
const task=division=>({division,kind:'draft',description:'Draf uji privat',project:'Tester',urgent:true});

test('outbox Telegram mulai dari audit sekarang, tanpa membanjiri hasil lama',()=>{
  const s=createStore(':memory:',()=>start);
  try {
    s.create(task('finance'));
    let running=s.claim(['draft']);
    s.finish(running.id,running.token,{output:'Hasil lama'});
    assert.equal(s.claimTelegramNotification(),null);
    const fresh=s.create(task('management'));
    running=s.claim(['draft']);
    s.finish(running.id,running.token,{output:'Hasil baru'});
    const event=s.claimTelegramNotification();
    assert.equal(event.taskId,fresh.id);
    assert.equal(event.division,'management');
    assert.equal(event.action,'completed');
    assert.equal(s.claimTelegramNotification(),null,'sewa aktif menahan pengiriman kedua');
    assert.throws(()=>s.ackTelegramNotification(event.eventId,'salah'),e=>e.status===409);
    s.ackTelegramNotification(event.eventId,event.token);
    assert.equal(s.claimTelegramNotification(),null);
  } finally {s.close();}
});

test('saat kirim gagal event dapat diulang setelah lease, dengan token baru',()=>{
  let now=start;
  const s=createStore(':memory:',()=>now);
  try {
    s.claimTelegramNotification();
    s.create(task('qa'));
    const running=s.claim(['draft']);
    s.finish(running.id,running.token,{error:'Kesalahan provider'});
    const first=s.claimTelegramNotification();
    assert.equal(first.action,'failed');
    now+=11*60_000;
    const retried=s.claimTelegramNotification();
    assert.equal(retried.eventId,first.eventId);
    assert.notEqual(retried.token,first.token);
    assert.throws(()=>s.ackTelegramNotification(first.eventId,first.token),e=>e.status===409);
    s.ackTelegramNotification(retried.eventId,retried.token);
    now+=60*60_000; // Notification throttle now requires a one-hour gap.
    s.create(task('finance'));
    const next=s.claim(['draft']);
    s.finish(next.id,next.token,{error:'Kuota terbatas',unavailable:true});
    const blocked=s.claimTelegramNotification();
    assert.equal(blocked.action,'blocked');
    assert.equal(blocked.division,'finance');
    s.ackTelegramNotification(blocked.eventId,blocked.token);
  } finally {s.close();}
});

test('update grup dicegah duplikat dan spam cepat',()=>{
  let now=start;
  const s=createStore(':memory:',()=>now);
  try {
    assert.equal(s.reserveOfficeGroupUpdate('100'),true);
    assert.equal(s.reserveOfficeGroupUpdate('100'),false);
    assert.throws(()=>s.reserveOfficeGroupUpdate('101'),e=>e.status===429);
    now+=9000;
    assert.equal(s.reserveOfficeGroupUpdate('101'),true);
    assert.throws(()=>s.reserveOfficeGroupUpdate('bad'),e=>e.status===400);
  } finally {s.close();}
});
