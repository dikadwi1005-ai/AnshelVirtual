import assert from 'node:assert/strict';
import { narrationCues } from '../public/studio-captions.js';
import test from 'node:test';
import { checkLayout, editProp, layoutItems } from '../public/layout-editor.js';
import { episodeFromReplay, episodeWebVtt, historyEvent, localReminderTime, nationSnapshot, storyboard } from '../public/studio-data.js';
import { createConversations } from '../public/conversations.js';

test('layout snaps movable props, rejects unsafe placements and protects furniture supports',()=>{
  const {id,prop}=layoutItems[0];
  assert.equal(editProp(id,.17,0,8).at[0],prop.at[0]+.25);
  assert.equal(editProp(id,.17,0,8).angle,prop.angle+Math.PI/12);
  assert.ok(checkLayout({[id]:[.25,0,0]}));
  assert.equal(checkLayout({[id]:[50,0,0]}),null);
  assert.equal(checkLayout({[id]:[NaN,0,0]}),null);
  assert.equal(checkLayout({'video-chair':[.25,0,0]}),null);
});

test('explicit meetings use the existing dialogue turns and real agenda',()=>{
  const agenda='Review hasil riset';
  const members=['Satu','Dua'].map(employee=>({person:{employee},anchor:{center:[0,0]}}));
  const dialogue=createConversations();
  let requests=0;
  dialogue.update(.5,new Map([['meeting',members]]),{meeting:{agenda}},{x:0,z:0},()=>{requests++;});
  assert.match(dialogue.turns.get('meeting').text,/Review hasil riset/);
  assert.equal(requests,0);
});

test('replay history records changes without copying dialogue text into metadata',()=>{
  const actors=[{stage:'walking'}], turn={id:'qa',text:'private line'};
  const frame={at:100,actors,turn};
  assert.deepEqual(historyEvent({actors},frame),{at:100,source:'simulation',kind:'dialogue',employee:'qa'});
  assert.equal(historyEvent(frame,{...frame,at:101}),null);
});

test('storyboard includes recorded evidence and treats missing work as unavailable',()=>{
  const people=[{id:'research',employee:'Indra'}];
  const tasks=[{status:'queued',division:'research',description:'Riset yang belum selesai'}];
  assert.deepEqual(storyboard('Buat Reels dari hasil riset Indra',{tasks,people}).items,[]);
  tasks.push({status:'completed',division:'research',description:'Hasil riset'});
  assert.deepEqual(storyboard('Buat Reels dari hasil riset Indra',{tasks,people}).items,['Hasil riset']);
});

test('Nation City snapshots retain allowlisted fields and reject invalid or duplicate events',()=>{
  const at='2026-11-13T03:00:00Z';
  const event={id:'maintenance-1',type:'city.service',at,label:'Pemeliharaan jaringan'};
  const snapshot={version:1,status:'offline',updatedAt:at,events:[event]};
  assert.deepEqual(nationSnapshot({...snapshot,events:[{...event,private:'discard'}]}),snapshot);
  assert.equal(nationSnapshot({...snapshot,events:[event,event]}),null);
  assert.equal(nationSnapshot({...snapshot,events:[{...event,type:'task.run'}]}),null);
});

test('prompt episode uses recorded actors, produces valid captions, and never invents missing poses',()=>{
  const people=[{id:'management',employee:'Alya'},{id:'operations',employee:'Bima'}];
  const frames=Array.from({length:80},(_,index)=>({
    at:100000+index*400,
    actors:[{animation:'desk-work'}, {animation:index<15?'read':'walk'}],
  }));
  assert.equal(episodeFromReplay('Bima pulang',frames.slice(0,12),people),null);
  const shots=episodeFromReplay('Bima pulang dari kantor',frames,people);
  assert.ok(shots.length>=3 && shots.length<=5);
  assert.equal(shots[0].camera,'campus');
  assert.ok(shots.slice(1).every(shot=>shot.camera==='employee-operations'));
  assert.ok(shots.some(shot=>/Bima sedang berjalan/.test(shot.caption)));
  assert.ok(shots.every(shot=>shot.end>shot.start && shot.end<=frames.at(-1).at &&
    shot.frames.length===frames.length));
  const vtt=episodeWebVtt(shots);
  const cues=narrationCues(vtt,shots.reduce((sum,shot)=>sum+shot.end-shot.start,0));
  assert.equal(cues.length,shots.length);
  assert.equal(cues[0].start,0);
  assert.equal(cues.at(-1).end,shots.reduce((sum,shot)=>sum+shot.end-shot.start,0));
  assert.equal(episodeFromReplay('Bima',[
    {at:0,actors:[]},{at:10500,actors:[]}],people),null);
  const unknown=episodeFromReplay('status kantor',[
    {at:0,actors:[{animation:'unknown'}]},
    {at:11000,actors:[{animation:'unknown'}]}],people);
  assert.ok(unknown && unknown.every(shot=>!shot.caption.includes('sedang bekerja')));
  assert.equal(episodeFromReplay('',frames,people),null);
});

test('reminder time uses WIB and rejects normalized invalid calendar dates',()=>{
  assert.equal(localReminderTime('2026-11-13T00:30'),Date.parse('2026-11-12T17:30:00Z'));
  assert.ok(Number.isNaN(localReminderTime('2026-02-31T09:00')));
  assert.ok(Number.isNaN(localReminderTime('2026-11-13T00:30Z')));
});
test('WebVTT narration accepts millisecond timing and rejects overlapping or out-of-range cues',()=>{
  const first='WEBVTT\r\n\r\n00:00.500 --> 00:02.000\r\nSelamat pagi.';
  assert.deepEqual(narrationCues(first,2000),[{start:500,end:2000,text:'Selamat pagi.'}]);
  assert.throws(()=>narrationCues(first,1998),/durasi/);
  assert.throws(()=>narrationCues(first+'\n\n00:01.500 --> 00:02.100\nOverlap',3000),/bertumpuk/);
  assert.throws(()=>narrationCues(first.replace('Selamat pagi.','<b>Halo</b>'),2000),/teks biasa/);
});
