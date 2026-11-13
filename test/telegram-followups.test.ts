import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.ts';
import {parseOwnerTaskAction,dispatchOfficeGroupEvent,dispatchOfficeGroupCheckin} from '../server/telegram-office.ts';
import {prepareOfficeNaturalChat} from '../server/telegram-natural.ts';

const tokens=Object.fromEntries(['management','operations','administration','hr']
  .map((id,i)=>[id,String(270000+i)+':'+('Z'.repeat(37))]));
const env={TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens)};
const message=(id,text,extras={})=>({chatId:env.TELEGRAM_CHAT_ID,
  userId:env.TELEGRAM_USER_ID,isBot:false,updateId:String(id),text,...extras});
const sent=[];
const messenger=async(url,opts)=>{
  sent.push({url,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify({ok:true,result:{message_id:800+sent.length}}),
    {status:200,headers:{'Content-Type':'application/json'}});
};

test('explicit actions use task IDs, allowlisted people and never parse chat as side-effects',()=>{
  const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  assert.deepEqual(parseOwnerTaskAction('/serahkan '+id+' | Bima'),
    {type:'assign',id,division:'operations'});
  assert.deepEqual(parseOwnerTaskAction('/tinjau '+id),{type:'review',id});
  assert.deepEqual(parseOwnerTaskAction('/setujui '+id),{type:'approve',id});
  assert.deepEqual(parseOwnerTaskAction('/revisi '+id+' | Tambahkan dua penjelasan rinci'),
    {type:'revise',id,description:'Tambahkan dua penjelasan rinci'});
  assert.deepEqual(parseOwnerTaskAction('/rapat tugas Citra | Susun draf notulen evaluasi'),
    {type:'meeting-task',division:'administration',description:'Susun draf notulen evaluasi'});
  for(const q of ['Bima, tugasnya coba diserahkan saja ke Citra',
    '/serahkan '+id+' | Eka',
    '/revisi '+id+' | ok',
    '/rapat tugas Eka | Buat notulen'])assert.equal(parseOwnerTaskAction(q),null,q);
});

test('meeting follow-up creates a real queued draft, links its ID, then owner handoffs and reviews it',async()=>{
  let now=Date.parse('2026-11-13T03:00:00Z');
  const store=createStore(':memory:',()=>now);
  sent.length=0;
  const send=async(id,text)=>{
    const result=await prepareOfficeNaturalChat(store,env,message(id,text),messenger);
    now+=3000;
    return result;
  };
  try{
    const began=await send(91001,'/rapat mulai Bahas antrean tugas Citra');
    assert.equal(began.mode,'handled');
    const result=await send(91002,'/rapat tugas Citra | Susun draf agenda dan keputusan rapat yang jelas');
    assert.equal(result.mode,'handled');
    assert.equal(result.source,'meeting');
    assert.ok(result.createdTaskId);
    const id=result.createdTaskId;
    const task=store.state().tasks.find(t=>t.id===id);
    assert.equal(task.status,'queued');
    assert.equal(task.division,'administration');
    assert.ok(store.officeGroupWorkspace().meeting.notes.some(n=>n.includes(id)));
    const handoff=await send(91003,'/serahkan '+id+' | Bima');
    assert.equal(handoff.action,'assign');
    assert.equal(store.state().tasks.find(t=>t.id===id).division,'operations');
    const reviewed=await send(91004,'/tinjau '+id);
    assert.equal(reviewed.action,'review');
    assert.equal(store.state().tasks.find(t=>t.id===id).status,'awaiting_approval');
    const approved=await send(91005,'/setujui '+id);
    assert.equal(approved.action,'approve');
    assert.equal(store.state().tasks.find(t=>t.id===id).status,'queued');
    const revision=await send(91006,'/revisi '+id+' | Perjelas risiko dan tindak lanjut hasil rapat');
    assert.equal(revision.source,'revision');
    assert.notEqual(revision.createdTaskId,id);
    assert.equal(store.state().tasks.find(t=>t.id===id).status,'queued');
    assert.equal(store.state().tasks.find(t=>t.id===revision.createdTaskId).division,'operations');
    assert.match(store.state().tasks.find(t=>t.id===revision.createdTaskId).description,/Revisi atas tugas/);
    const close=await send(91007,'/rapat selesai');
    assert.equal(close.mode,'handled');
    assert.ok(store.officeGroupWorkspace().minutes[0].notes.some(x=>x.includes(id)));
  }finally{store.close();}
});

test('next meeting turn is an owner-triggered Gemini call that includes recorded decisions',async()=>{
  let now=Date.parse('2026-11-13T04:00:00Z');
  const store=createStore(':memory:',()=>now);
  try{
    store.applyOfficeGroupWorkspace({type:'meeting-mulai',value:'Evaluasi antrean tugas'});
    store.applyOfficeGroupWorkspace({type:'meeting-putuskan',
      value:'Tinjau draf sebelum publikasi'});
    const round=await prepareOfficeNaturalChat(store,env,message(92001,'/rapat lanjut'));
    assert.equal(round.mode,'generate');
    assert.equal(round.group,true);
    assert.deepEqual(round.recipients,['management','operations','administration','hr']);
    const text=round.request.systemInstruction.parts[0].text;
    assert.match(text,/Evaluasi antrean tugas/);
    assert.match(text,/Tinjau draf sebelum publikasi/);
    // The group cannot continue talking unless the owner sends another message.
    now+=3000;
    store.applyOfficeGroupWorkspace({type:'mode',mode:'diskusi'});
    const next=await prepareOfficeNaturalChat(store,env,message(92002,'Lanjutkan'));
    assert.equal(next.mode,'generate');
    assert.equal(next.group,true);
    now+=3000;
    await assert.rejects(prepareOfficeNaturalChat(store,env,{
      ...message(92003,'/rapat lanjut'),userId:'4321'}),e=>e.status===403);
  }finally{store.close();}
});

test('one registered internal event can notify automatically, important mode suppresses casual checkin',async()=>{
  let now=Date.parse('2026-11-13T03:00:00Z');
  const store=createStore(':memory:',()=>now);
  sent.length=0;
  try{
    store.applyOfficeGroupWorkspace({type:'event',date:'2026-11-13',
      label:'Evaluasi internal tim'});
    const first=await dispatchOfficeGroupEvent(store,env,messenger);
    assert.equal(first.kind,'internal-event');
    assert.equal(first.division,'management');
    assert.match(sent.at(-1).body.text,/Evaluasi internal tim/);
    const second=await dispatchOfficeGroupEvent(store,env,messenger);
    assert.equal(second.sent,false);
    store.applyOfficeGroupWorkspace({type:'notifications',mode:'important'});
    now=Date.parse('2026-11-13T05:00:00Z');
    const ignored=await dispatchOfficeGroupCheckin(store,env,messenger);
    assert.equal(ignored.sent,false);
    assert.equal(ignored.reason,'non-essential-messages-disabled');
  }finally{store.close();}
});

test('owner-only task controls reject unknown status changes without making tasks up',async()=>{
  let now=Date.parse('2026-11-13T03:00:00Z');
  const store=createStore(':memory:',()=>now);
  sent.length=0;
  try{
    await assert.rejects(prepareOfficeNaturalChat(store,env,message(93001,
      '/rapat tugas Citra | Buat laporan rapat uji sistem'),messenger),e=>e.status===409);
    assert.equal(store.state().tasks.length,0);
    now+=3000;
    const created=store.create({division:'administration',
      kind:'draft',description:'Agenda khusus',project:'Meeting'});
    await assert.rejects(prepareOfficeNaturalChat(store,env,message(93002,
      '/setujui '+created.id),messenger),e=>e.status===409);
    assert.equal(store.state().tasks.find(t=>t.id===created.id).status,'queued');
  }finally{store.close();}
});
