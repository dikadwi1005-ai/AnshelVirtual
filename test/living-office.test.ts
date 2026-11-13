import assert from 'node:assert/strict';
import { test } from 'node:test';
import { divisions } from '../public/catalog.js';
import { createLivingOffice } from '../public/living-office.js';
import { navigation, segmentHits } from '../public/navigation.js';
import { createOfficeVoice } from '../public/office-voice.js';

test('12 pegawai berganti aktivitas saat offline, berhenti saat jeda, dan mendahulukan tugas aktif',()=>{
  const living=createLivingOffice({random:()=>.5});
  const actors=divisions.map(person=>({person,stage:'seated',actual:'desk'}));
  const task={kind:'draft',status:'queued'};
  const state={phase:'briefing',worker:false,people:{management:{task}}};
  const observed=new Map(divisions.map(person=>[person.id,new Set()]));
  let meeting=false;
  for (let tick=0;tick<600;tick++) {
    const plans=living.step(.5,state,actors);
    for (const actor of actors) {
      actor.actual=plans[actor.person.id].activity;
      observed.get(actor.person.id).add(actor.actual);
    }
    if (Object.values(plans).filter(plan=>plan.activity==='meeting').length===2) meeting=true;
  }
  assert.ok(meeting);
  for (const [id,activities] of observed) {
    assert.ok(activities.size>=3,id+': '+[...activities]);
    for (const value of Object.values(living.snapshot(id).needs)) assert.ok(value>=0 && value<=100);
  }
  const before=living.snapshot('management');
  living.step(100,{phase:'paused'},actors);
  assert.deepEqual(living.snapshot('management'),before);
  const online={...state,worker:true,capabilities:['draft']};
  assert.equal(living.step(.01,online,actors).management.activity,'desk');
  assert.equal(living.step(.01,{...online,people:{management:{task,executing:true}}},actors).management.activity,'work');
});

test('riwayat, hubungan simetris, dan kebutuhan dapat dibuka kembali tanpa layanan eksternal',()=>{
  let data=null;
  const storage={getItem:()=>data,setItem:(_,value)=>{data=value;}};
  const living=createLivingOffice({storage,now:()=>123});
  const [speaker,listener]=divisions.slice(0,2).map(person=>({person}));
  for (let i=0;i<130;i++) living.record({speaker,text:'Halo '+i},[speaker,listener],'hub');
  living.persist();
  assert.equal(JSON.parse(data).history.length,120);
  const restored=createLivingOffice({storage});
  assert.deepEqual(restored.snapshot('management'),living.snapshot('management'));
  assert.equal(restored.snapshot('operations').relations[0].id,'management');
  assert.equal(restored.snapshot('operations').history[0].text,'Halo 129');
  assert.equal(createLivingOffice({storage:{getItem(){throw new Error();}}}).snapshot('management').history.length,0);
});

test('rute menghindari pejalan kaki dan tidak masuk ke tujuan yang sedang terhalang',()=>{
  const nav=navigation([]);
  const path=nav.route([-2,0],[2,0],[[0,0]]);
  assert.ok(path?.length>1);
  const points=[[-2,0],...path];
  for (let i=1;i<points.length;i++) assert.ok(!segmentHits(points[i-1],points[i],[-.3,-.3,.3,.3]));
  assert.equal(nav.route([-2,0],[2,0],[[2,0]]),null);
});

test('audio opsional memilih suara Indonesia lokal dan tidak mengulang bubble yang sama',()=>{
  const spoken=[];
  let cancelled=0;
  const engine={getVoices:()=>[{lang:'id-ID',localService:false},{lang:'id-ID',localService:true}],
    speak:utterance=>spoken.push(utterance),cancel:()=>{cancelled++;}};
  const voice=createOfficeVoice({speechSynthesis:engine,SpeechSynthesisUtterance:class {
    text;
    constructor(text) { this.text=text; }
  }});
  const turn={text:'Sampai nanti',speaker:{person:divisions[0]}};
  voice.show(turn);
  assert.equal(spoken.length,0);
  voice.enable(true);
  voice.show({...turn});
  assert.equal(spoken[0].voice.localService,true);
  voice.show(turn);
  voice.show(turn);
  assert.equal(spoken.length,2);
  voice.show(null);
  assert.equal(cancelled,2);
});
