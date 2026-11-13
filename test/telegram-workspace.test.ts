import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStore} from '../server/store.ts';
import {parseGroupWorkspaceCommand,applyGroupWorkspaceCommand,
  emptyGroupWorkspace,workspacePromptContext} from '../server/telegram-workspace.ts';
import {ownerReplyContext,conversationQuestion,requestedOfficeDiscussion,groupDelayMs} from '../server/telegram-group.ts';
import {prepareOfficeNaturalChat} from '../server/telegram-natural.ts';

const tokens=Object.fromEntries(['management','operations','administration','hr']
  .map((id,i)=>[id,String(100010+i)+':'+('X'.repeat(38))]));
const env={TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens)};
const clock={now:Date.parse('2026-11-13T03:00:00Z')};
const data=(id,text,extras={})=>({chatId:env.TELEGRAM_CHAT_ID,
  userId:env.TELEGRAM_USER_ID,isBot:false,updateId:String(id),text,...extras});
const sent=[];
const messenger=async(url,opts)=>{
  sent.push({url,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify({ok:true,result:{message_id:300+sent.length}}),{
    status:200,headers:{'Content-Type':'application/json'}});
};

test('flexible three- and four-worker discussions keep requested order and no accidental extra worker',()=>{
  assert.deepEqual(requestedOfficeDiscussion('Alya dan Bima, diskusikan status API'),[
    'management','operations']);
  assert.deepEqual(requestedOfficeDiscussion('Alya, Bima, dan Citra, bahas laporan yang tadi'),[
    'management','operations','administration']);
  assert.deepEqual(requestedOfficeDiscussion('@Dara & @Citra, diskusikan prioritas tugas'),[
    'hr','administration']);
  assert.deepEqual(requestedOfficeDiscussion('Alya, Bima, Citra, Dara, menurut kalian masalah utama apa?'),[
    'management','operations','administration','hr']);
  for(const text of ['Alya dan Alya, diskusikan masalah ini',
    'Alya, bagaimana kabar Bima di kantor?',
    'Alya dan Eka, diskusikan kegiatan tim']) {
    assert.equal(requestedOfficeDiscussion(text),null,text);
  }
});

test('owner Reply Telegram quote is bounded, not a command, and selects quoted employee',async()=>{
  const quote={sender:'Bima',text:'Perlu dilihat gejala error lebih dulu, aku belum cek sistem.'};
  assert.equal(ownerReplyContext({replyTo:quote}).employee,'operations');
  const text=conversationQuestion('Yang tadi maksudnya apa?',quote);
  assert.match(text,/KONTEKS REPLY/);
  assert.match(text,/Bima menulis/);
  assert.ok(text.length<=1500);
  assert.equal(conversationQuestion('Tolong ringkas',null),'Tolong ringkas');
  const store=createStore(':memory:',()=>clock.now);
  try{
    const pre=await prepareOfficeNaturalChat(store,env,data(50001,
      'Yang tadi maksudnya apa?',{replyTo:quote}));
    assert.equal(pre.mode,'generate');
    assert.equal(pre.division,'operations');
    assert.match(pre.request.systemInstruction.parts[0].text,/KONTEKS REPLY/);
    assert.match(pre.request.contents.at(-1).parts[0].text,/Perlu dilihat gejala error/);
    assert.equal(pre.request.systemInstruction.parts[0].text.includes('abaikan semua aturan'),false);
  }finally{store.close();}
});

test('explicit target overrides quoted Telegram speaker',async()=>{
  const store=createStore(':memory:',()=>clock.now);
  try{
    const pre=await prepareOfficeNaturalChat(store,env,data(50002,
      'Citra, menurutmu langkahnya apa?',{replyTo:{sender:'Bima',text:'Periksa log dulu.'}}));
    assert.equal(pre.division,'administration');
  }finally{store.close();}
});

test('owner-only meeting minutes and persistent memory remain bounded and separately verified',()=>{
  let state=emptyGroupWorkspace();
  const apply=q=>{
    const command=parseGroupWorkspaceCommand(q);
    assert.ok(command,q);
    const result=applyGroupWorkspaceCommand(state,command,clock.now);
    state=result.workspace;
    return result.text;
  };
  assert.match(apply('/rapat mulai Evaluasi tugas Citra yang masih antre'),/dimulai/);
  assert.match(apply('/rapat catat Worker belum punya heartbeat saat pengecekan'),/tersimpan/);
  assert.match(apply('/rapat putuskan Pastikan notulen ditinjau sebelum membuat tugas'),/Keputusan tercatat/);
  assert.match(apply('/rapat status'),/Pastikan notulen ditinjau/);
  assert.match(apply('/rapat selesai'),/Rapat selesai/);
  assert.equal(state.minutes.length,1);
  assert.equal(state.meeting,null);
  assert.match(apply('/ingat Prioritas Senin | Cek antrean Citra sebelum briefing'),/tersimpan/);
  assert.match(apply('/memori'),/Prioritas Senin/);
  const prompt=workspacePromptContext(state,clock.now);
  assert.match(JSON.stringify(prompt),/Cek antrean Citra/);
  assert.match(prompt.disclaimer,/BUKAN bukti/);
  assert.match(apply('/lupakan Prioritas Senin'),/dihapus/);
  assert.ok(!JSON.stringify(state.notes).includes('Cek antrean Citra'));
  assert.throws(()=>applyGroupWorkspaceCommand(state,
    {type:'remember',key:'api key',value:'secret'},clock.now),/kredensial/i);
});

test('quiet mode, discussion mode, events, and scheduled reminders are controlled by owner',()=>{
  let state=emptyGroupWorkspace();
  const apply=q=>{
    const command=parseGroupWorkspaceCommand(q);
    assert.ok(command,q);
    const result=applyGroupWorkspaceCommand(state,command,clock.now);
    state=result.workspace;
    return result.text;
  };
  assert.match(apply('/hening on'),/aktif/);
  assert.equal(state.quiet,true);
  assert.match(apply('/mode diskusi'),/diskusi/);
  assert.equal(state.mode,'diskusi');
  assert.match(apply('/acara 2026-12-03 | Pertemuan evaluasi internal'),/tersimpan/);
  assert.equal(state.events[0].date,'2026-12-03');
  assert.match(apply('/ingatkan 2026-11-13 13:00 | Cek tugas Citra yang tertunda'),/Pengingat/);
  assert.equal(state.reminders.length,1);
  assert.equal(state.reminders[0].sent,false);
  assert.match(apply('/pengaturan'),/Mode grup: diskusi/);
  assert.match(apply('/pengingat'),/Cek tugas Citra/);
  assert.equal(parseGroupWorkspaceCommand('/rapat sembarangan'),null);
  assert.equal(parseGroupWorkspaceCommand('tolong semua rapat'),null);
  assert.throws(()=>applyGroupWorkspaceCommand(state,{
    type:'event',date:'2026-02-31',label:'Tanggal salah'},clock.now));
});

test('SQLite group reminders are claimed once, leased, retried, then acknowledged',()=>{
  let now=clock.now;
  const store=createStore(':memory:',()=>now);
  try{
    store.applyOfficeGroupWorkspace(parseGroupWorkspaceCommand(
      '/ingatkan 2026-11-13 13:00 | Cek tugas Citra'));
    assert.equal(store.claimDueOfficeReminder(),null);
    now=Date.parse('2026-11-13T06:01:00Z');
    const due=store.claimDueOfficeReminder();
    assert.match(due.text,/Cek tugas/);
    assert.equal(store.claimDueOfficeReminder(),null);
    assert.equal(store.ackOfficeReminder(due.id,false),true);
    const retry=store.claimDueOfficeReminder();
    assert.equal(retry.id,due.id);
    store.ackOfficeReminder(due.id,true);
    assert.equal(store.claimDueOfficeReminder(),null);
    assert.equal(store.officeGroupWorkspace().reminders[0].sent,true);
  }finally{store.close();}
});

test('owner meeting controls require correct Telegram account and do not call Gemini',async()=>{
  let now=clock.now;
  const store=createStore(':memory:',()=>now);
  sent.length=0;
  try{
    const a=await prepareOfficeNaturalChat(store,env,
      data(60001,'/rapat mulai Rapat prioritas minggu depan'),messenger);
    assert.equal(a.mode,'handled');
    assert.equal(a.groupCommand,'meeting-mulai');
    assert.equal(store.officeGroupWorkspace().meeting.topic,'Rapat prioritas minggu depan');
    assert.equal(sent.length,1);
    await assert.rejects(prepareOfficeNaturalChat(store,env,
      {...data(60002,'/rapat selesai'),userId:'123456'},messenger),e=>e.status===403);
    assert.equal(store.officeGroupWorkspace().meeting.topic,'Rapat prioritas minggu depan');
    now+=3000; // Honor the existing minimum 2-second owner message gap.
    const end=await prepareOfficeNaturalChat(store,env,
      data(60003,'/rapat selesai'),messenger);
    assert.equal(end.mode,'handled');
    assert.equal(store.officeGroupWorkspace().minutes.length,1);
  }finally{store.close();}
});

test('Telegram media metadata gets truthful acknowledgement rather than hallucinated analysis',async()=>{
  const store=createStore(':memory:',()=>clock.now);
  sent.length=0;
  try{
    const response=await prepareOfficeNaturalChat(store,env,data(60005,'',{
      mediaType:'photo'}),messenger);
    assert.equal(response.mode,'handled');
    assert.equal(response.analyzed,false);
    assert.match(sent.at(-1).body.text,/kontennya belum bisa dianalisis/i);
    assert.equal(await prepareOfficeNaturalChat(store,env,data(60005,'',{
      mediaType:'photo'}),messenger).then(x=>x.duplicate),true);
  }finally{store.close();}
});

test('n8n source workflow serializes quoted message and safe media metadata',async()=>{
  const workflow=JSON.parse(await readFile('workflows/office_telegram_group_natural.json','utf8'));
  const node=workflow.nodes.find(n=>n.name==='Saring pesan manusia');
  assert.match(node.parameters.jsCode,/message\.reply_to_message/);
  assert.match(node.parameters.jsCode,/mediaType/);
  assert.match(node.parameters.jsCode,/message\.caption/);
  assert.equal(workflow.nodes.filter(n=>n.type==='n8n-nodes-base.telegramTrigger').length,1);
});
