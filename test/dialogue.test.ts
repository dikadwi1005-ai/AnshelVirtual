import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDialogue } from '../server/dialogue.ts';

const group={kind:'group',location:'hub',speakers:['management','hr']};
const solo={kind:'solo',location:'coffee',speakers:['administration']};
const lines=['Dara, dengar kabar soal biskuit itu?', 'Yang tinggal remahnya, kan?', 'Besok kita bawa satu toples.'];
const completion=lines=>Response.json({choices:[{message:{content:JSON.stringify({lines})}}]});

test('Groq menerima konteks fiktif dan mengembalikan teks dalam urutan pembicara',async()=>{
  let time=0;
  const calls=[];
  const dialogue=createDialogue({GROQ_API_KEY:'test-secret'},async (url,options)=>{
    calls.push({url,options});
    return completion(lines);
  },()=>time);
  assert.equal(dialogue.enabled,true);
  assert.deepEqual(await dialogue.generate({...group,description:'Rahasia tugas'}),{lines});
  assert.equal(calls[0].url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization,'Bearer test-secret');
  assert.doesNotMatch(calls[0].options.body,/Rahasia tugas|test-secret/);
  const request=JSON.parse(calls[0].options.body);
  const context=JSON.parse(request.messages[1].content);
  assert.deepEqual(context.urutanGiliran.map(voice=>voice.nama),['Alya','Dara','Alya']);
  assert.deepEqual(await dialogue.generate(group),{lines:[]});
  assert.equal(calls.length,1);
  time+=8_000;
  assert.deepEqual(await dialogue.generate(solo),{lines:[]});
  assert.equal(calls.length,2);
  await assert.rejects(dialogue.generate({...group,speakers:['management','management']}),{status:400});
});

test('kunci kosong dan Groq yang menolak permintaan beralih ke dialog bawaan',async()=>{
  let calls=0, time=0;
  const fetchGroq=async()=>{ calls++; return new Response(null,{status:429}); };
  const disabled=createDialogue({},fetchGroq,()=>time);
  assert.equal(disabled.enabled,false);
  assert.deepEqual(await disabled.generate(solo),{lines:[]});
  assert.equal(calls,0);
  const enabled=createDialogue({GROQ_API_KEY:'test-secret'},fetchGroq,()=>time);
  assert.deepEqual(await enabled.generate(solo),{lines:[]});
  time+=30_000;
  assert.deepEqual(await enabled.generate(solo),{lines:[]});
  assert.equal(calls,1);
  time+=30_000;
  await enabled.generate(solo);
  assert.equal(calls,2);
});
