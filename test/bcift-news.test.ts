import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.ts';
import {enabledOfficeDivisions,configuredOfficeBots} from '../server/telegram-office.ts';
import {requestedOfficeDiscussion} from '../server/telegram-group.ts';
import {buildOfficeNaturalRequest,prepareOfficeNaturalChat,deliverOfficeNaturalChat}
  from '../server/telegram-natural.ts';
import {
  isJihanNewsQuery,isOfficialBciftSource,newsWeekWindow,extractBciftBlogTitles,
  addJihanNewsGrounding,validateJihanNewsReply,jihanNoVerifiedNews,
} from '../server/bcift-news.ts';

const now=Date.parse('2026-11-13T06:00:00Z'); // 13:00 WIB
const tokens=Object.fromEntries(['management','operations','administration','hr','marketing','research','social']
  .map((id,i)=>[id,String(456000+i)+':'+('T'.repeat(35))]));
const basic=Object.fromEntries(['management','operations','administration','hr']
  .map(id=>[id,tokens[id]]));
const env={
  TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  N8N_TOKEN:'test-token-over-24-characters',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens),
};
const userMessage=(id,text)=>({
  chatId:env.TELEGRAM_CHAT_ID,userId:env.TELEGRAM_USER_ID,
  updateId:String(id),text,isBot:false,
});
const messages=[];
const transport=async(url,options)=>{
  if(url==='https://bcift.co.id/blog/')return new Response(
    '<a href="/blog/bcift-punya-autogate/">BCIFT Punya Autogate</a>'+
    '<a href="/blog/study-tour-bcift/"><h3>Study Tour di BCIFT: Belajar Terminal</h3></a>',
    {status:200,headers:{'content-type':'text/html'}}
  );
  if(url.includes('/sendMessage')){
    messages.push({url,body:JSON.parse(options.body)});
    return new Response(JSON.stringify({ok:true,result:{message_id:190+messages.length}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  }
  throw new Error('Unexpected test transport');
};

test('only bot identities with real tokens are active; no new enabled variable needed',()=>{
  const onlyFour={...env,TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(basic)};
  assert.deepEqual(enabledOfficeDivisions(onlyFour),['management','operations','administration','hr']);
  assert.deepEqual(enabledOfficeDivisions(env),[
    'management','operations','administration','hr','marketing','research','social'
  ]);
  assert.deepEqual(enabledOfficeDivisions({...env,ANSHEL_JIHAN_ENABLED:'false'}),
    enabledOfficeDivisions(env));
  assert.equal(configuredOfficeBots(env).configured.length,7);
  assert.equal(enabledOfficeDivisions({
    ...env,TELEGRAM_BOT_TOKENS_JSON:JSON.stringify({...tokens,development:'456999:'+('T'.repeat(35))})
  }).includes('development'),false);
  assert.deepEqual(requestedOfficeDiscussion('Indra dan Hana, bahas konten proyek lain',
    enabledOfficeDivisions(env)),['research','social']);
});

test('Jihan news requests use Google Search grounding and existing BCIFT blog titles',()=>{
  assert.equal(isJihanNewsQuery('Jihan, carikan hot news minggu ini'),true);
  assert.equal(isJihanNewsQuery('Jihan, strategi SEO BCIFT?'),false);
  assert.deepEqual(newsWeekWindow(now),{start:'2026-11-06',end:'2026-11-13'});
  const titles=extractBciftBlogTitles(
    '<a href="/blog/ranoh-island/"><h3>Ranoh Island Destinasi Pantai Batam</h3></a>'+
    '<a href="https://bcift.co.id/blog/study-tour-bcift/">Study Tour di BCIFT 2026</a>'
  );
  assert.deepEqual(titles,['Ranoh Island Destinasi Pantai Batam','Study Tour di BCIFT 2026']);
  const request=buildOfficeNaturalRequest('marketing','Jihan, carikan hot news minggu ini',
    {now,counts:{},tasks:[],people:{}});
  addJihanNewsGrounding(request,'Jihan, carikan hot news minggu ini',now,titles);
  assert.deepEqual(request.tools,[{google_search:{}}]);
  assert.match(request.systemInstruction.parts[0].text,/KHUSUS BCIFT/);
  assert.match(request.systemInstruction.parts[0].text,/2026-11-06/);
  assert.match(request.systemInstruction.parts[0].text,/Ranoh Island Destinasi Pantai/);
  assert.doesNotMatch(buildOfficeNaturalRequest('research','Indra, teliti sejarah',
    {now,counts:{},tasks:[],people:{}}).systemInstruction.parts[0].text,/BATAS PEKERJAAN: Jihan/);
  assert.match(buildOfficeNaturalRequest('social','Hana, buat caption proyek lain',
    {now,counts:{},tasks:[],people:{}}).systemInstruction.parts[0].text,/proyek APA SAJA/);
});

test('news replies require direct official URLs and dates inside the current seven-day window',()=>{
  const good='2026-11-10 — Ide pembaruan layanan imigrasi Batam, keyword imigrasi Batam. Sumber: https://batam.imigrasi.go.id/berita/2026';
  assert.equal(validateJihanNewsReply(good,now),true);
  assert.equal(validateJihanNewsReply(good.replace('2026-11-10','2026-10-10'),now),false);
  assert.equal(validateJihanNewsReply(good.replace('https://batam.imigrasi.go.id/berita/2026','https://example.com/news'),now),false);
  assert.equal(validateJihanNewsReply('TIDAK_ADA_SUMBER_RESMI',now),false);
  assert.equal(isOfficialBciftSource('https://bcift.co.id/blog/'),true);
  assert.equal(isOfficialBciftSource('https://www.ica.gov.sg/news-and-publications'),true);
  assert.equal(isOfficialBciftSource('https://gov.sg.evil.example/post'),false);
  assert.equal(isOfficialBciftSource('http://bpbatam.go.id/news'),false);
});

test('on-demand Jihan research passes through existing n8n prepare/finish, never publishes',async()=>{
  messages.length=0;
  const store=createStore(':memory:',()=>now);
  try {
    const prepared=await prepareOfficeNaturalChat(store,env,
      userMessage(880011,'Jihan, carikan hot news minggu ini untuk BCIFT'),transport);
    assert.equal(prepared.mode,'generate');
    assert.equal(prepared.division,'marketing');
    assert.deepEqual(prepared.request.tools,[{google_search:{}}]);
    assert.match(prepared.request.systemInstruction.parts[0].text,/Study Tour di BCIFT/);
    assert.equal(messages.length,0);
    const result=await deliverOfficeNaturalChat(store,env,{
      updateId:prepared.updateId,ticket:prepared.ticket,output:'Berita ramai! https://portal-berita.example/news'
    },transport);
    assert.equal(result.division,'marketing');
    assert.equal(result.ai,false);
    assert.equal(messages.length,1);
    assert.ok(messages[0].url.includes(tokens.marketing));
    assert.equal(messages[0].body.text,jihanNoVerifiedNews);
    assert.equal(store.state().tasks.length,0);
  }finally{store.close();}
});

test('Indra and Hana can answer about any project without forcing BCIFT scope',async()=>{
  messages.length=0;
  const store=createStore(':memory:',()=>now);
  try{
    const prepared=await prepareOfficeNaturalChat(store,env,
      userMessage(880022,'Indra, riset sejarah Indonesia untuk konten baru'),transport);
    assert.equal(prepared.mode,'generate');
    assert.equal(prepared.division,'research');
    assert.doesNotMatch(prepared.request.systemInstruction.parts[0].text,/BATAS PEKERJAAN: Jihan/);
    const sent=await deliverOfficeNaturalChat(store,env,{
      updateId:prepared.updateId,ticket:prepared.ticket,
      output:'Aku bisa meneliti dari sumber sejarah yang kamu pilih untuk proyek itu.'
    },transport);
    assert.equal(sent.division,'research');
    assert.ok(messages.at(-1).url.includes(tokens.research));
  }finally{store.close();}
});
