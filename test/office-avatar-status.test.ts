import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { divisions } from '../public/catalog.js';
import { createStore } from '../server/store.ts';
import { officeAvatarPresence } from '../server/office-avatar-status.ts';
import { officeScheduleReply,buildOfficeNaturalRequest } from '../server/telegram-natural.ts';
import { buildOfficeCollectiveRequest } from '../server/telegram-group.ts';
import { officeActivityReply } from '../server/office-monitoring.ts';

const time=Date.parse('2026-11-14T12:30:00Z'); // Saturday evening WIB
const snapshot={actors:divisions.map(person=>({
  id:person.id,position:[40,5],y:.42,angle:0,stage:'seated',
  activity:'home',actual:'home',anchor:'home-'+person.id,
  animation:'sit',seat:1,path:[],
}))};
const schedule={arrival:'08:45',open:'09:00',briefingEnd:'09:15',lunch:'12:00',
  lunchEnd:'13:00',review:'16:30',close:'17:00',days:[1,2,3,4,5],holidays:[]};

test('only fresh, leased presence is a source of avatar positions',()=>{
  const observed=officeAvatarPresence({snapshot,until:time+5500,savedAt:time},time);
  assert.equal(observed.fresh,true);
  assert.equal(observed.people.management.location,'Di rumah');
  const old=officeAvatarPresence({snapshot,until:time+5500,savedAt:time-13_000},time);
  assert.equal(old.fresh,false);
  assert.deepEqual(old.people,{});
  const released=officeAvatarPresence({snapshot,until:time,savedAt:time},time);
  assert.equal(released.fresh,false);
  const traveling={...snapshot,actors:snapshot.actors.map(actor=>actor.id==='management'
    ?{...actor,actual:'desk',activity:'home',stage:'walking',position:[10,24]}:actor)};
  assert.equal(officeAvatarPresence({snapshot:traveling,until:time+5500,savedAt:time},time)
    .people.management.location,'Dalam perjalanan pulang');
});

test('SQLite state exposes observed avatar homes but never mistakes estimates for location',()=>{
  let now=time;
  const store=createStore(':memory:',()=>now);
  try {
    const client=randomUUID();
    assert.equal(store.state().avatarPresence.fresh,false);
    store.officePresence({client,snapshot});
    const state=store.state();
    assert.equal(state.phase,'closed');
    assert.equal(state.avatarPresence.people.management.location,'Di rumah');
    const q='Alya, kamu masih di kantor sekarang?';
    const answer=officeScheduleReply('management',q,state);
    assert.match(answer,/lokasi avatar terpantau: di rumah/i);
    assert.doesNotMatch(answer,/avatar yang tercatat: bersosialisasi/i);
    const personal=buildOfficeNaturalRequest('management','Alya, lagi ngapain?',state);
    const facts=JSON.parse(personal.systemInstruction.parts[0].text.split('DATA KANTOR TERPERCAYA: ')[1]);
    assert.equal(facts.lokasiAvatarDiSimulasi,'Di rumah');
    const group=buildOfficeCollectiveRequest('Guys, lagi apa?', ['management'],state);
    assert.match(group.systemInstruction.parts[0].text,/Di rumah/);
    assert.match(officeActivityReply(state),/di rumah/i);
    now+=6000; // leader lease expires; old position is no longer current
    const stale=store.state();
    assert.equal(stale.avatarPresence.fresh,false);
    assert.match(officeScheduleReply('management',q,stale),/posisi avatar belum terverifikasi/i);
    assert.doesNotMatch(officeActivityReply(stale),/di rumah/i);
  } finally { store.close(); }
});
