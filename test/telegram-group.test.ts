import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.ts';
import { buildOfficeNaturalRequest,prepareOfficeNaturalChat,deliverOfficeNaturalChat,
  cleanOfficeNaturalResponse,unverifiedCompletedWorkClaim } from '../server/telegram-natural.ts';
import { isCollectiveCall,availableOfficeResponders,buildOfficeCollectiveRequest,
  parseOfficeCollectiveResponse,resolveOfficeCollectiveResponse,
  summarizeSharedOfficeConversation } from '../server/telegram-group.ts';

const base=Date.parse('2026-11-12T03:00:00Z');
const four=['management','operations','administration','hr'];
const allTokens=Object.fromEntries(four.map((id,index)=>[id,String(210001+index)+':'+('A'.repeat(38))]));
const env={TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(allTokens)};
const ownerMessage=(id,text)=>({chatId:env.TELEGRAM_CHAT_ID,userId:env.TELEGRAM_USER_ID,
  updateId:String(id),isBot:false,text});
const messenger=sent=>async(url,opts)=>{
  sent.push({url,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify({ok:true,result:{message_id:200+sent.length}}),{status:200});
};

test('panggilan "guys" dan "semua" terdeteksi tanpa mencuri percakapan satu pegawai',()=>{
  for(const message of ['Guys, besok semua semangat ya!','Halo semuanya, gimana kabar?',
    'Eh guys lagi ngapain?', 'Teman-teman, bisa dengerin?', 'Oke, besok semua semangat ya',
    'Tim, siap buat besok?','Pagi semua!']) {
    assert.equal(isCollectiveCall(message),true,message);
  }
  for(const message of ['Alya, tolong cek semua tugas', 'Bima, guys, ada error nggak?',
    'Semua tugas selesai?', 'Halo Citra', '/tugas Bima | cek semua mesin', 'Ada tugas untuk semua divisi']) {
    assert.equal(isCollectiveCall(message),false,message);
  }
});

test('hanya empat bot aktif dan hanya yang tidak mengerjakan tugas yang menanggapi panggilan grup',()=>{
  const state={running:[{division:'operations',status:'running'}],
    tasks:[{division:'hr',status:'running'},{division:'administration',status:'queued'}],
    people:{management:{executing:false},operations:{executing:true},
      administration:{executing:false},hr:{executing:true}}};
  assert.deepEqual(availableOfficeResponders(state,four),['management','administration']);
  assert.deepEqual(availableOfficeResponders(state,['hr','management']),['management']);
  assert.deepEqual(availableOfficeResponders({...state,running:[],tasks:[],
    people:{operations:{executing:true}}},four),['management','administration','hr']);
  assert.deepEqual(availableOfficeResponders({},['development','creative']),[]);
});

test('panggilan kolektif membangun satu Gemini JSON tanpa nama/identitas sensitif pemilik',()=>{
  const state={counts:{completed:5},people:{operations:{activity:'game',executing:false}},
    tasks:[{division:'operations',project:'Sistem',status:'completed',description:'Password privat'}]};
  const req=buildOfficeCollectiveRequest('Hai guys, ada yang menarik?',four,state);
  const prompt=req.systemInstruction.parts[0].text;
  assert.match(prompt,/PEMILIK sekaligus pimpinan/);
  assert.match(prompt,/PALING BANYAK SATU|paling banyak SATU/i);
  assert.match(prompt,/pegawai yang sedang bebas/i);
  assert.match(prompt,/operations/);
  assert.match(prompt,/Bermain PS5/);
  assert.ok(!prompt.includes('Password privat'));
  assert.equal(req.generationConfig.responseMimeType,'application/json');
  assert.ok(req.generationConfig.maxOutputTokens>=1400,'allow thinking + four distinct responses');
  assert.equal(req.generationConfig.responseSchema.type,'OBJECT');
  assert.deepEqual(req.generationConfig.responseSchema.required,four);
  assert.deepEqual(Object.keys(req.generationConfig.responseSchema.properties),four);
  assert.equal(req.contents.length,1);
  assert.throws(()=>buildOfficeCollectiveRequest('Hai guys', ['finance'],state),e=>e.status===400);
});

test('single employee Gemini recognizes the owner without repeating their name or "Pak"',()=>{
  const req=buildOfficeNaturalRequest('operations','Bima, apa kabar?',{tasks:[],counts:{}});
  const instructions=req.systemInstruction.parts[0].text;
  assert.match(instructions,/pemilik sekaligus pimpinan/i);
  assert.match(instructions,/boleh kadang menyebut "Pak"/i);
  assert.match(instructions,/JANGAN setiap balasan/);
  assert.match(instructions,/Jangan sebut nama pemilik/i);
  assert.match(instructions,/Jangan bersikap seperti bot layanan pelanggan/i);
});

test('panggilan "guys" dari pemilik memakai satu request dan tiga bot bebas, exclude Bima saat running',async()=>{
  let now=base;
  const store=createStore(':memory:',()=>now);
  const sent=[];
  try {
    const task=store.create({division:'operations',kind:'draft',description:'Perbaiki server demo',
      project:'Tester',urgent:true});
    assert.equal(store.claim(['draft']).id,task.id);
    const preparation=await prepareOfficeNaturalChat(store,env,ownerMessage(10001,
      'Guys, besok semua semangat ya!'),messenger(sent));
    assert.equal(preparation.mode,'generate');
    assert.equal(preparation.group,true);
    assert.deepEqual(preparation.recipients,['management','administration','hr']);
    assert.equal(sent.length,0);
    assert.equal(preparation.request.contents.length,1);
    assert.ok(!JSON.stringify(preparation.request).includes(allTokens.operations));
    const output=JSON.stringify({
      management:'Makasih, Pak. Besok kita koordinasi sesuai jadwal ya.',
      operations:'Aku juga ikut meskipun sibuk!', // Must not be sent.
      administration:'Makasih! Aku siap menyusun catatan yang diperlukan.',
      hr:'Oke, semoga teman-teman besok makin kompak.',
      finance:'Halo semua, aku bot yang belum aktif!', // Must not be sent.
    });
    const done=await deliverOfficeNaturalChat(store,env,{
      updateId:preparation.updateId,ticket:preparation.ticket,output},messenger(sent));
    assert.equal(done.sent,true);
    assert.equal(done.group,true);
    assert.equal(done.ai,true);
    assert.deepEqual(done.divisions,['management','administration','hr']);
    assert.equal(done.failed,0);
    assert.equal(sent.length,3);
    assert.ok(sent[0].url.includes(allTokens.management));
    assert.ok(sent[1].url.includes(allTokens.administration));
    assert.ok(sent[2].url.includes(allTokens.hr));
    assert.ok(sent.every(x=>!x.body.text.includes('Aku juga ikut meskipun sibuk')));
    assert.ok(sent.every(x=>!x.body.text.includes('bot yang belum aktif')));
    await assert.rejects(deliverOfficeNaturalChat(store,env,{
      updateId:preparation.updateId,ticket:preparation.ticket,output},messenger(sent)),e=>e.status===409);
    assert.equal(sent.length,3);
  } finally {store.close();}
});

test('pegawai yang menjadi sibuk setelah prepare juga tidak mengirim balasan',async()=>{
  let now=base;
  const store=createStore(':memory:',()=>now);
  const sent=[];
  try {
    const prep=await prepareOfficeNaturalChat(store,env,ownerMessage(10010,
      'Halo guys, ada kabar?'),messenger(sent));
    assert.deepEqual(prep.recipients,four);
    const job=store.create({division:'hr',kind:'draft',description:'Tugas simulasi',urgent:true});
    assert.equal(store.claim(['draft']).id,job.id);
    const result=await deliverOfficeNaturalChat(store,env,{updateId:prep.updateId,ticket:prep.ticket,
      output:JSON.stringify({management:'Ada, Pak. Kita pantau progres tugas yang tercatat.',
        operations:'Aku ada, kalau ada kendala teknis jelaskan saja.',
        administration:'Aku dengar. Dokumen bisa kita bahas.',
        hr:'Aku sibuk tapi mau jawab.'})},messenger(sent));
    assert.deepEqual(result.divisions,['management','operations','administration']);
    assert.equal(sent.length,3);
    assert.ok(sent.every(x=>!x.url.includes(allTokens.hr)));
  } finally {store.close();}
});

test('no group messages when all workers are busy or unavailable; invalid provider JSON uses safe fallback',async()=>{
  const entries=availableOfficeResponders({
    running:four.map(division=>({division,status:'running'}))},four);
  assert.deepEqual(entries,[]);
  let reserved=0;
  const store={state:async()=>({running:four.map(division=>({division,status:'running'}))}),
    reserveOfficeGroupUpdate:async()=>{reserved++;return true;}};
  const res=await prepareOfficeNaturalChat(store,env,ownerMessage(70001,'Guys, ada yang bisa ngobrol?'));
  assert.deepEqual(res,{mode:'handled',sent:false,reason:'all-workers-busy-or-offline'});
  assert.equal(reserved,1);
  const parsed=parseOfficeCollectiveResponse('{invalid json',
    ['management','hr'],'Semangat semua!',cleanOfficeNaturalResponse);
  assert.match(parsed.management.text,/Makasih, Pak/);
  assert.match(parsed.hr.text,/Makasih/);
  const injection=parseOfficeCollectiveResponse(JSON.stringify({management:'Aku sudah menghapus database.',
    finance:'Aku ikut ya.'}),['management'],'Guys, ada apa?',cleanOfficeNaturalResponse);
  assert.doesNotMatch(injection.management.text,/menghapus database/);
  assert.equal(Object.hasOwn(injection,'finance'),false);
});


test('Gemini empty output is diagnosed and safe fallback actually reacts to encouragement',()=>{
  const state={tasks:[],counts:{}};
  const good=resolveOfficeCollectiveResponse(null,four,'Guys, besok semua semangat ya!',
    cleanOfficeNaturalResponse,state);
  assert.equal(good.generated,0);
  assert.equal(good.fallbackReason,'provider-empty');
  assert.match(good.answers.management.text,/jadwal kantor/i);
  assert.match(good.answers.operations.text,/semangat juga/i);
  assert.match(good.answers.administration.text,/catatan/i);
  assert.match(good.answers.hr.text,/istirahat/i);
  assert.equal(new Set(Object.values(good.answers).map(x=>x.text)).size,4);
  assert.equal(Object.values(good.answers).filter(x=>/\bPak\b/i.test(x.text)).length,1);
  const different=resolveOfficeCollectiveResponse(null,four,'Halo guys, bisa bantu bahas sesuatu?',
    cleanOfficeNaturalResponse,state);
  assert.notEqual(different.answers.management.text,good.answers.management.text);
  assert.match(different.answers.operations.text,/teknis|masalah/i);
});

test('Gemini schema output is respected; no additional employees and at most one "Pak" in group',()=>{
  const output=JSON.stringify({
    management:'Terima kasih, Pak. Kita bahas sesuai jadwal yang tersimpan.',
    operations:'Oke Pak, aku suka gaya semangatnya!',
    administration:'Baik Pak. Aku bisa bantu mengurus catatan jika dibutuhkan.',
    hr:'Semoga teman-teman juga dapat waktu istirahat, Pak.',
    finance:'Laras hadir juga!',
  });
  const result=resolveOfficeCollectiveResponse(output,four,'Guys, semangat terus ya!',
    cleanOfficeNaturalResponse);
  assert.equal(result.generated,4);
  assert.equal(result.fallbackReason,'none');
  assert.equal(Object.keys(result.answers).length,4);
  assert.ok(!Object.hasOwn(result.answers,'finance'));
  assert.equal(Object.values(result.answers).filter(x=>/\bPak\b/i.test(x.text)).length,1);
  assert.ok(Object.values(result.answers).every(x=>x.ai));
});

test('Malformed JSON and disallowed actions are distinguishable and use truthful fallback',()=>{
  const malformed=resolveOfficeCollectiveResponse('{bad json',
    ['management'],'Guys, progres?',cleanOfficeNaturalResponse);
  assert.equal(malformed.fallbackReason,'provider-invalid-json');
  assert.equal(malformed.generated,0);
  const partial=resolveOfficeCollectiveResponse(JSON.stringify({
    management:'Oke, prioritas kita dibahas sesuai jadwal ya.',
    operations:'Aku sudah menghapus semua database.',
  }),['management','operations'],'Guys, kabar?',cleanOfficeNaturalResponse);
  assert.equal(partial.fallbackReason,'provider-partial-fallback');
  assert.equal(partial.generated,1);
  assert.doesNotMatch(partial.answers.operations.text,/menghapus/i);
});

test('end-to-end fallback diagnostics return from n8n finish without exposing Gemini payload',async()=>{
  let now=base;
  const store=createStore(':memory:',()=>now);
  const messages=[];
  try{
    const prep=await prepareOfficeNaturalChat(store,env,
      ownerMessage(30001,'Guys, besok semua semangat ya!'),messenger(messages));
    assert.equal(prep.mode,'generate');
    const done=await deliverOfficeNaturalChat(store,env,
      {updateId:prep.updateId,ticket:prep.ticket,output:null},messenger(messages));
    assert.equal(done.sent,true);
    assert.equal(done.group,true);
    assert.equal(done.ai,false);
    assert.equal(done.generated,0);
    assert.equal(done.fallbackReason,'provider-empty');
    assert.equal(messages.length,4);
    assert.ok(messages.some(x=>/jadwal kantor/i.test(x.body.text)));
    assert.ok(messages.some(x=>/istirahat/i.test(x.body.text)));
    assert.ok(!JSON.stringify(done).includes(allTokens.management));
  }finally {store.close();}
});


test('penyaring memblokir dua klaim kerja palsu dari screenshot Telegram',()=>{
  const owner='Guys, besok semua semangat ya! Ada yang mau disampaikan?';
  const alya='Jadwal dan koordinasi untuk besok sudah saya siapkan ya.';
  const citra='Catatan penting sudah saya rapikan untuk di cek kembali.';
  assert.equal(unverifiedCompletedWorkClaim(alya),true);
  assert.equal(unverifiedCompletedWorkClaim(citra),true);
  assert.notEqual(cleanOfficeNaturalResponse(alya,'Tidak ada pekerjaan tercatat.',owner),alya);
  assert.notEqual(cleanOfficeNaturalResponse(citra,'Tidak ada pekerjaan tercatat.',owner),citra);
  const group=resolveOfficeCollectiveResponse(JSON.stringify({
    management:alya,
    operations:'Aman, gas terus pokoknya.',
    administration:citra,
    hr:'Tetap jaga kesehatan dan semangat buat semuanya.',
  }),four,owner,cleanOfficeNaturalResponse,{tasks:[],counts:{}});
  assert.equal(group.generated,2);
  assert.equal(group.fallbackReason,'provider-partial-fallback');
  assert.match(group.answers.management.text,/prioritas|jadwal kantor/i);
  assert.match(group.answers.administration.text,/catatan/i);
  assert.doesNotMatch(group.answers.management.text,/sudah saya siapkan/i);
  assert.doesNotMatch(group.answers.administration.text,/sudah saya rapikan/i);
  assert.equal(group.answers.operations.ai,true);
  assert.equal(group.answers.hr.ai,true);
});

test('tetap membolehkan bahasa natural, tawaran bantuan, dan status draf yang tercatat',()=>{
  for(const sentence of [
    'Kalau butuh, nanti kita bahas prioritas buat besok.',
    'Aku bisa bantu merapikan catatan kalau memang diperlukan.',
    'Jadwal masuk Senin sampai Jumat sudah tercatat di pengaturan kantor.',
    'Ada hasil draf yang tercatat selesai, tapi belum ditinjau.',
    'Makasih, Pak. Semoga besok lancar.',
  ]) {
    assert.equal(unverifiedCompletedWorkClaim(sentence),false,sentence);
    assert.equal(cleanOfficeNaturalResponse(sentence,'fallback','Guys, ada yang mau disampaikan?'),sentence);
  }
  for(const sentence of [
    'Aku sudah menyusun laporan untuk besok.',
    'Tadi kami mengirim dokumennya.',
    'Udah aku rapihin catatan penting.',
    'Sudah saya cek sistemnya, semuanya aman.',
  ])assert.equal(unverifiedCompletedWorkClaim(sentence),true,sentence);
});

test('balasan tunggal pegawai tidak lagi mengaku sudah menyelesaikan pekerjaan yang tidak tercatat',()=>{
  const question='Citra, besok ada yang perlu dicatat?';
  const reply='Aku sudah menyiapkan jadwal dan merapikan catatan untuk besok.';
  assert.equal(cleanOfficeNaturalResponse(reply,'Belum ada dokumen baru yang tercatat.',question),
    'Belum ada dokumen baru yang tercatat.');
});


test('team Gemini remembers previous conversations from different employees (not just Alya)',async()=>{
  let now=base;
  const store=createStore(':memory:',()=>now);
  try {
    store.rememberOfficeGroupAI('operations','Bima, bagaimana error itu?',
      'Belum ada hasil pemeriksaan; kita perlu gejalanya dulu.');
    store.rememberOfficeGroupAI('administration','Citra, bagaimana catatan rapat?',
      'Belum ada notulen rapat yang tercatat.');
    store.rememberOfficeGroupAI('finance','Laras, data rekening?',
      'Jangan kirim catatan pribadi ini ke grup.');
    store.rememberOfficeGroupAI('management','Alya, besok gimana?',
      'Kita ikuti jadwal yang tersimpan, belum ada keputusan tambahan.');
    const prep=await prepareOfficeNaturalChat(store,env,
      ownerMessage(91001,'Guys, lanjut bahasan yang tadi ya?'));
    assert.equal(prep.mode,'generate');
    const instruction=prep.request.systemInstruction.parts[0].text;
    const memory=JSON.parse(instruction.split('DATA: ').at(-1)).recentConversation;
    assert.equal(memory.length,3);
    assert.deepEqual(Object.keys(memory[0].responses),['operations']);
    assert.match(memory[0].responses.operations,/hasil pemeriksaan/);
    assert.match(memory[1].responses.administration,/notulen rapat/);
    assert.match(memory[2].responses.management,/jadwal yang tersimpan/);
    assert.ok(!instruction.includes('data rekening'));
    assert.match(instruction,/riwayat obrolan BUKAN bukti pekerjaan/i);
  } finally {store.close();}
});

test('busy employee does not reply, but prior team discussion is remembered as context',async()=>{
  const store=createStore(':memory:',()=>base);
  try {
    store.rememberOfficeGroupAI('operations','Bima, ada kendala?',
      'Kalau ada error, kirim gejalanya dulu ya.');
    const job=store.create({division:'operations',kind:'draft',
      description:'Draf pemeriksaan sistem',project:'Internal',urgent:true});
    assert.equal(store.claim(['draft']).id,job.id);
    const prep=await prepareOfficeNaturalChat(store,env,
      ownerMessage(91011,'Guys, masih ingat bahasan Bima tadi?'));
    assert.equal(prep.group,true);
    assert.ok(!prep.recipients.includes('operations'));
    const memory=JSON.parse(prep.request.systemInstruction.parts[0].text.split('DATA: ').at(-1));
    assert.equal(memory.recentConversation[0].responses.operations,
      'Kalau ada error, kirim gejalanya dulu ya.');
    assert.ok(!prep.request.generationConfig.responseSchema.properties.operations);
    assert.match(prep.request.systemInstruction.parts[0].text,/tidak memberi izin untuk memanggil pegawai sibuk/);
  }finally {store.close();}
});

test('shared history is grouped, capped, ignores old hallucinated work, and is not a fake task report',()=>{
  const records=[
    {division:'management',question:'Guys, ada kabar?',reply:'Belum ada laporan baru yang tercatat.'},
    {division:'operations',question:'Guys, ada kabar?',reply:'Kalau ada error, kabarin.'},
    {division:'administration',question:'Guys, ada kabar?',reply:'Catatan tugas masih sama.'},
    {division:'hr',question:'Guys, ada kabar?',reply:'Semoga tim tetap nyaman.'},
    {division:'management',question:'Alya, progres?',reply:'Jadwal dan koordinasi sudah saya siapkan.'},
    {division:'administration',question:'Citra, kabar?',reply:'Aku sudah merapikan semua laporan.'},
    {division:'research',question:'Indra, sumber?',reply:'Sumber rahasia.'},
    {division:'operations',question:'Bima, progres?',reply:'Belum ada tugas yang sudah selesai tercatat.'},
  ];
  const turns=summarizeSharedOfficeConversation(records);
  assert.equal(turns.length,2);
  assert.deepEqual(Object.keys(turns[0].responses),four);
  assert.equal(turns[1].responses.operations,'Belum ada tugas yang sudah selesai tercatat.');
  assert.ok(!JSON.stringify(turns).includes('Sumber rahasia'));
  assert.ok(!JSON.stringify(turns).includes('sudah saya siapkan'));
  assert.ok(!JSON.stringify(turns).includes('Aku sudah merapikan'));
  assert.equal(summarizeSharedOfficeConversation(records.slice(0,4).concat(records.slice(0,4))).length,1);
});

test('shared group memory expires after seven days in store and remains bounded',()=>{
  let clock=base;
  const store=createStore(':memory:',()=>clock);
  try{
    store.rememberOfficeGroupAI('hr','Dara, ada kabar?','Belum ada perkembangan baru.');
    const initial=store.prepareOfficeGroupAI('92001','management','Guys, ada kabar?',four);
    assert.equal(initial.groupHistory.length,1);
    clock+=8*24*3600_000;
    const later=store.prepareOfficeGroupAI('92002','management','Guys, bagaimana?',four);
    assert.deepEqual(later.groupHistory,[]);
  } finally {store.close();}
});
