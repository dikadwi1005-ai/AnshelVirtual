import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.ts';
import {divisions} from '../public/catalog.js';
import {officeScheduleReply,buildOfficeNaturalRequest} from '../server/telegram-natural.ts';
import {officeLocationReply,isOfficeLocationQuestion} from '../server/office-chat-replies.ts';
import {buildOfficeCollectiveRequest} from '../server/telegram-group.ts';
import {officeAvatarPresence} from '../server/office-avatar-status.ts';
import {officeVirtualCheckin} from '../server/telegram-office.ts';
import {randomUUID} from 'node:crypto';

const now=Date.parse('2026-11-14T12:30:00Z');
const actors=divisions.map(person=>({
 id:person.id,position:[35,16],y:.42,angle:0,stage:'seated',
 activity:'home',actual:'home',anchor:'home-'+person.id,animation:'sit',seat:1,path:[],
}));

test('Alya answers staff going home naturally, without an unrequested schedule dump',()=>{
 const s=createStore(':memory:',()=>now);
 try {
   const state=s.state();
   const q='Alya, sekarang para pegawai sudah pulang atau masih di kantor?';
   assert.equal(isOfficeLocationQuestion(q),true);
   assert.equal(isOfficeLocationQuestion('Alya, kamu lagi di kantor?'),true);
   const answer=officeScheduleReply('management',q,state);
   assert.match(answer,/Pak/i);
   assert.match(answer,/jam kerja udah selesai/i);
   assert.doesNotMatch(answer,/Jadwal kantor virtual yang tersimpan|snapshot|belum terverifikasi/i);
   assert.equal(officeScheduleReply('management','Alya, besok masuk jam berapa?',state)?.includes('08.45 WIB'),true);
 } finally{s.close();}
});

test('live snapshot, last seen, and expired records remain distinguishable',()=>{
 let clock=now;
 const s=createStore(':memory:',()=>clock);
 try {
  const client=randomUUID();
  s.officePresence({client});
  s.officePresence({client,snapshot:{actors}});
  const q='Alya, semua pegawai udah pulang?';
  assert.match(officeScheduleReply('management',q,s.state()),/semua 12 pegawai udah sampai rumah/i);
  clock+=6000;
  const stale=s.state();
  assert.equal(stale.avatarPresence.fresh,false);
  assert.match(officeScheduleReply('management',q,stale),/update terakhir|terakhir kebaca/i);
  assert.doesNotMatch(officeScheduleReply('management',q,stale),/dari simulasi yang lagi jalan/i);
  const expired=officeAvatarPresence({snapshot:{actors},savedAt:clock-19*3600_000,until:clock},clock);
  assert.deepEqual(expired.lastSeenPeople,{});
 }finally{s.close();}
});

test('Gemini sees last-seen only as last-seen; style expects Gen Z and Pak',()=>{
 const state={now,phase:'closed',people:{management:{executing:false}},
   tasks:[],counts:{},avatarPresence:{fresh:false,lastSeenAt:now-6000,
     lastSeenPeople:{management:{location:'Di rumah',activity:'Istirahat di rumah'}}}};
 const request=buildOfficeNaturalRequest('management','Alya, lagi ngapain?',state);
 const prompt=request.systemInstruction.parts[0].text;
 const facts=JSON.parse(prompt.split('DATA KANTOR TERPERCAYA: ')[1]);
 assert.equal(facts.lokasiTerakhirAvatar,'Di rumah');
 assert.equal(facts.lokasiAvatarDiSimulasi,undefined);
 assert.match(prompt,/Gen Z/);
 assert.match(prompt,/"Pak"/);
 const group=buildOfficeCollectiveRequest('Guys, masih di kantor?', ['management'],state);
 assert.match(group.systemInstruction.parts[0].text,/posisiTerakhir/);
 assert.match(group.systemInstruction.parts[0].text,/Gen Z/);
});

test('auto checkin does not fabricate avatar activity when presence unavailable',()=>{
 const state={phase:'work',now:Date.parse('2026-11-13T05:00:00Z'),
   people:Object.fromEntries(divisions.map(x=>[x.id,{activity:'coffee',executing:false}])),tasks:[]};
 const chat=officeVirtualCheckin(state,['management','operations','administration','hr']);
 assert.ok(chat);
 assert.doesNotMatch(chat.text+' '+chat.reply,/avatarku lagi mengambil kopi|aku lagi mengambil kopi/i);
});
