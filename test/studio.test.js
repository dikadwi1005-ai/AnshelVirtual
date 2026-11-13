import assert from 'node:assert/strict';
import test from 'node:test';
import { checkLayout, editProp, layoutItems } from '../public/layout-editor.js';
import { historyEvent, localReminderTime, nationSnapshot, storyboard } from '../public/studio-data.js';
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

test('reminder time uses WIB and rejects normalized invalid calendar dates',()=>{
  assert.equal(localReminderTime('2026-11-13T00:30'),Date.parse('2026-11-12T17:30:00Z'));
  assert.ok(Number.isNaN(localReminderTime('2026-02-31T09:00')));
  assert.ok(Number.isNaN(localReminderTime('2026-11-13T00:30Z')));
});
