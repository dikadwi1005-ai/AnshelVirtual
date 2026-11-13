import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.ts';
import {officeIndonesiaDay,officeIndonesiaCalendarContext} from '../server/office-calendar.ts';
import {buildOfficeNaturalRequest,prepareOfficeNaturalChat,deliverOfficeNaturalChat,
  groupReplyIntervalMs,officeScheduleReply} from '../server/telegram-natural.ts';
import {buildOfficeCollectiveRequest} from '../server/telegram-group.ts';
import {officeGroupReply} from '../server/telegram-office.ts';

const four=['management','operations','administration','hr'];
const tokens=Object.fromEntries(four.map((id,i)=>[id,String(215001+i)+':'+('A'.repeat(38))]));
const env={TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens)};
const say=(updateId,text)=>({chatId:env.TELEGRAM_CHAT_ID,userId:env.TELEGRAM_USER_ID,
  updateId:String(updateId),isBot:false,text});
const schedule={days:[1,2,3,4,5],holidays:[],arrival:'08:45',open:'09:00',
  briefingEnd:'09:15',lunch:'12:00',lunchEnd:'13:00',review:'16:30',close:'17:00'};

test('Official holidays 2026-2027 and collective leave are distinct from office closure',()=>{
  const n=at=>Date.parse(at);
  const friday=officeIndonesiaDay(n('2026-11-13T00:00:00Z'),0,schedule);
  assert.equal(friday.date,'2026-11-13');
  assert.equal(friday.day,'Jumat');
  assert.equal(friday.event,null);
  const christmas=officeIndonesiaDay(n('2026-12-25T03:00:00Z'),0,schedule);
  assert.deepEqual(christmas.event,{type:'libur nasional',name:'Hari Natal'});
  assert.equal(christmas.officeScheduledClosed,false,'holiday is awareness, not an unapproved schedule change');
  const leave=officeIndonesiaDay(n('2026-12-24T03:00:00Z'),0,schedule);
  assert.equal(leave.event.type,'cuti bersama');
  assert.equal(leave.officeScheduledClosed,false);
  const custom=officeIndonesiaDay(n('2026-12-25T03:00:00Z'),0,{
    ...schedule,holidays:['2026-12-25']});
  assert.equal(custom.officeScheduledClosed,true);
  assert.match(custom.officeClosureReason,/pengaturan kantor/);
  const eid=officeIndonesiaDay(n('2027-03-10T02:00:00Z'),0,schedule);
  assert.equal(eid.event.name,'Idulfitri');
  assert.equal(eid.event.type,'libur nasional');
  const sumpah=officeIndonesiaDay(n('2027-10-28T02:00:00Z'),0,schedule);
  assert.deepEqual(sumpah.event,{type:'peringatan',name:'Hari Sumpah Pemuda'});
  const future=officeIndonesiaDay(n('2028-10-28T02:00:00Z'),0,schedule);
  assert.equal(future.calendarVerified,false);
  assert.equal(future.event,null,'future dates without an SKB must never be guessed as official');
});

test('Calendar query includes today/tomorrow WIB and named upcoming events, without assuming office holiday',()=>{
  const christmasEve=Date.parse('2026-12-24T02:00:00Z');
  const facts=officeIndonesiaCalendarContext(christmasEve,schedule,
    'Besok Natal, tanggal merah? Kantor libur?');
  assert.equal(facts.today.event.type,'cuti bersama');
  assert.equal(facts.tomorrow.date,'2026-12-25');
  assert.equal(facts.tomorrow.event.name,'Hari Natal');
  assert.equal(facts.tomorrow.officeScheduledClosed,false);
  assert.ok(facts.matchingNamedEvents.some(x=>x.date==='2026-12-25'));
  assert.match(facts.disclaimer,/tidak otomatis/);
  const normal=officeIndonesiaCalendarContext(Date.parse('2026-11-13T02:00:00Z'),
    schedule,'Guys, besok tetap semangat ya!');
  assert.equal(normal.tomorrow.day,'Sabtu');
  assert.equal(normal.tomorrow.officeScheduledClosed,true);
  assert.ok(!Object.hasOwn(normal,'upcomingOfficialHolidays'));
});

test('Both individual and team Gemini requests receive authoritative calendar instead of guessing dates',()=>{
  const at=Date.parse('2026-12-24T02:00:00Z');
  const state={now:at,schedule,counts:{},tasks:[],people:{}};
  const one=buildOfficeNaturalRequest('management','Besok Natal kantor libur?',state);
  const facts=JSON.parse(one.systemInstruction.parts[0].text.split('DATA KANTOR TERPERCAYA: ').at(-1));
  assert.equal(facts.kalenderIndonesia.tomorrow.event.name,'Hari Natal');
  assert.match(one.systemInstruction.parts[0].text,/Tidak semua perayaan|tidak semua perayaan/i);
  const all=buildOfficeCollectiveRequest('Guys, besok Natal kantor gimana?',four,state);
  const data=JSON.parse(all.systemInstruction.parts[0].text.split('DATA: ').at(-1));
  assert.equal(data.indonesiaCalendar.today.event.type,'cuti bersama');
  assert.equal(data.indonesiaCalendar.tomorrow.event.type,'libur nasional');
  assert.deepEqual(all.generationConfig.responseSchema.required,four);
  assert.match(all.systemInstruction.parts[0].text,/Libur nasional, cuti bersama/i);
});

test('Telegram /kalender answers with official date and explains office schedule distinction',()=>{
  const state={now:Date.parse('2026-12-24T04:00:00Z'),schedule,counts:{},tasks:[]};
  const info=officeGroupReply(state,'/kalender',env);
  assert.equal(info.division,'management');
  assert.match(info.text,/2026-12-24/);
  assert.match(info.text,/cuti bersama/i);
  assert.match(info.text,/2026-12-25 Hari Natal/i);
  assert.match(info.text,/pengaturan|keputusan pemilik/i);
  assert.doesNotMatch(info.text,/undefined|null/);
});

test('All-hands Telegram replies arrive one at a time with three 2-second pacing steps',async()=>{
  let clock=Date.parse('2026-11-13T03:00:00Z');
  const store=createStore(':memory:',()=>clock);
  const calls=[];
  const pacing=[];
  const fakeSend=async(url,opts)=>{
    const body=JSON.parse(opts.body);
    calls.push({division:four.find(id=>url.includes(tokens[id])),text:body.text,replyTo:body.reply_parameters?.message_id});
    return new Response(JSON.stringify({ok:true,result:{message_id:100+calls.length}}),{
      status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    const pre=await prepareOfficeNaturalChat(store,env,
      say(80001,'Guys, besok semangat terus ya!'));
    assert.deepEqual(pre.recipients,four);
    const output=JSON.stringify({
      management:'Semoga prioritas besok bisa kita bicarakan dengan rapi.',
      operations:'Oke, semangat! Kalau ada kendala teknis, kabari aja.',
      administration:'Makasih, kalau perlu catatan nanti kita rapikan bareng.',
      hr:'Jaga kesehatan juga ya, semoga semua tetap nyaman.',
    });
    const result=await deliverOfficeNaturalChat(store,env,
      {updateId:pre.updateId,ticket:pre.ticket,output},fakeSend,
      async(ms)=>pacing.push({ms,beforeCount:calls.length}));
    assert.equal(groupReplyIntervalMs,2000);
    assert.equal(result.sent,true);
    assert.deepEqual(result.divisions,four);
    assert.deepEqual(calls.map(x=>x.division),four);
    assert.deepEqual(pacing,[{ms:2000,beforeCount:1},{ms:2000,beforeCount:2},
      {ms:2000,beforeCount:3}]);
    assert.ok(calls.every(x=>x.replyTo===undefined));
  }finally{store.close();}
});

test('Two-employee discussions wait two seconds before the threaded second reply',async()=>{
  let clock=Date.parse('2026-11-13T03:00:00Z');
  const store=createStore(':memory:',()=>clock);
  const sent=[];
  const delays=[];
  const fakeSend=async(url,opts)=>{
    const body=JSON.parse(opts.body);
    sent.push({url,body});
    return new Response(JSON.stringify({ok:true,result:{message_id:900+sent.length}}),{
      status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const pre=await prepareOfficeNaturalChat(store,env,
      say(80002,'Alya dan Bima, diskusikan status pemeriksaan API terbaru'));
    assert.deepEqual(pre.recipients,['management','operations']);
    const output=JSON.stringify({
      management:'Kita bahas prioritasnya dulu, belum ada pemeriksaan API yang bisa kupastikan.',
      operations:'Setuju. Detail error dan gejalanya perlu dicatat sebelum mengambil kesimpulan.',
    });
    const done=await deliverOfficeNaturalChat(store,env,
      {updateId:pre.updateId,ticket:pre.ticket,output},fakeSend,
      async(ms)=>delays.push(ms));
    assert.equal(done.sent,true);
    assert.deepEqual(delays,[2000]);
    assert.equal(sent.length,2);
    assert.equal(sent[1].body.reply_parameters.message_id,901);
  }finally{store.close();}
});


test('schedule reply says national holiday is separate from company operating calendar',()=>{
  const state={now:Date.parse('2026-12-24T09:00:00Z'),schedule,phase:'work',
    mode:'auto',people:{management:{activity:'desk'}}};
  const tomorrow=officeScheduleReply('management','Alya, besok kantor libur nggak?',state);
  assert.match(tomorrow,/dijadwalkan masuk kantor virtual/i);
  assert.match(tomorrow,/Hari Natal \(libur nasional\)/i);
  assert.match(tomorrow,/tidak otomatis mengubah jadwal/i);
  const dayOff=officeScheduleReply('management','Besok kantor libur?',{
    ...state,schedule:{...schedule,holidays:['2026-12-25']}});
  assert.match(dayOff,/tidak ada jadwal masuk kantor virtual/);
  assert.match(dayOff,/Hari Natal/i);
});
