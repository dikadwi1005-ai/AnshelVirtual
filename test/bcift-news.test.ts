import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.ts';
import {enabledOfficeDivisions,configuredOfficeBots} from '../server/telegram-office.ts';
import {requestedOfficeDiscussion} from '../server/telegram-group.ts';
import {buildOfficeNaturalRequest,prepareOfficeNaturalChat,deliverOfficeNaturalChat}
  from '../server/telegram-natural.ts';
import {
  isJihanNewsQuery,isOfficialBciftSource,newsWeekWindow,extractBciftBlogTitles,
  addJihanNewsGrounding,jihanNoVerifiedNews,
  verifyJihanNews,formatJihanNews,
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

test('verified news survives invalid siblings and checks title, date, operators and institutional social links',async()=>{
  const title='Pembaruan layanan penumpang ferry Batam';
  const day='2026-11-12';
  const candidate=(url,proof='',date=day,headline=title)=>[headline,date,'','Otoritas',url,'Penumpang BCIFT','ferry Batam','Panduan penumpang Batam',proof];
  const html='<title>'+title+'</title><meta property="article:published_time" content="'+day+'T10:00:00+07:00">';
  const institution='https://bpbatam.go.id/kontak';
  const officialPost='https://x.com/bpbatam/status/1';
  const fakePost='https://x.com/bpbatam-palsu/status/1';
  const fetcher=async(url,options)=>{
    assert.equal(options.redirect,'error');
    const body=url===institution?'<a href="https://x.com/bpbatam">X</a>':html;
    const status=url.includes('/redirect')?302:url.includes('/missing')?403:200;
    return new Response(body,{status,headers:{'content-type':'text/html'}});
  };
  for(const url of ['https://bpbatam.go.id/berita','https://ica.gov.sg/news','https://marine.gov.my/news','https://batamfast.com/news']) {
    assert.equal((await verifyJihanNews(JSON.stringify([candidate(url)]),now,fetcher)).length,1,url);
  }
  const rows=await verifyJihanNews(JSON.stringify([
    candidate(fakePost,institution),candidate(officialPost,institution),candidate('https://ica.gov.sg/redirect')
  ]),now,fetcher);
  assert.equal(rows.length,1);
  assert.equal(rows[0].type,'akun sosial resmi');
  assert.ok(formatJihanNews(rows).includes(officialPost));
  for(const row of [candidate('https://bpbatam.go.id/missing'),candidate('https://bpbatam.go.id/a','','2026-11-06'),
    candidate('https://bpbatam.go.id/a','','2026-11-31'),candidate('https://bpbatam.go.id/a','',day,'Judul karangan'),
    candidate('https://portal.example/berita'),candidate('https://bpbatam.go.id:123/a')]) {
    assert.equal((await verifyJihanNews(JSON.stringify([row]),now,fetcher)).length,0);
  }
  const duplicate=candidate('https://bpbatam.go.id/berita');
  duplicate[7]='BCIFT Punya Autogate: Perjalanan Jadi Lebih Mudah';
  const result=await verifyJihanNews(JSON.stringify([duplicate,duplicate]),now,fetcher);
  assert.equal(result.length,1);
  assert.match(formatJihanNews(result),/Cek duplikasi/);
});

test('verified result is saved privately through the existing prepare and finish contract',async()=>{
  const store=createStore(':memory:',()=>now);
  const title='Pengumuman ferry Batam terbaru';
  const url='https://marine.gov.my/notis-batam';
  const route=async(urlValue,options)=>urlValue===url?new Response(
    '<h1>'+title+'</h1><script type="application/ld+json">{"datePublished":"2026-11-11"}</script>',
    {headers:{'content-type':'text/html'}}):transport(urlValue,options);
  try {
    const prepared=await prepareOfficeNaturalChat(store,env,userMessage(880099,'Jihan, coba carikan berita BCIFT terbaru dan susun ide SEO-nya.'),route);
    const output=JSON.stringify([[title,'2026-11-11','','Otoritas',url,'Relevan untuk BCIFT','ferry Batam','Info ferry terkini','']]);
    const finished=await deliverOfficeNaturalChat(store,env,{...prepared,output},route);
    assert.equal(store.state().tasks[0].status,'completed');
    assert.equal(JSON.parse(store.artifact(finished.reportId).output)[0].source,url);
    assert.ok(messages.at(-1).body.text.length<=700);
    await assert.rejects(deliverOfficeNaturalChat(store,env,{...prepared,output},route),{status:409});
  } finally { store.close(); }
});

test('natural owner drafts use real statuses, deduplicate and wait for a verified source artifact',async()=>{
  let time=now;
  const store=createStore(':memory:',()=>time);
  const prepare=(id,text)=>{ time+=2100; return prepareOfficeNaturalChat(store,env,userMessage(id,text),transport); };
  try {
    const commands=['Indra, coba riset sejarah Tan Malaka tahun 1925.',
      'Hana, buatkan tiga ide Reels tentang sejarah.', 'Jihan, susun strategi SEO BCIFT.',
      'Bima, tolong periksa masalah API yang tadi.', 'Citra, buatkan ringkasan rapat hari ini.',
      'Dara, siapkan pembagian tugas tim minggu depan.', 'Alya, bantu susun prioritas pekerjaan kantor hari ini.'];
    for(const [i,command] of commands.entries()) {
      const msg=userMessage(881000+i,command);
      const result=await prepare(881000+i,command);
      assert.ok(result.createdTaskId,command);
      assert.match(result.message,/Worker draf belum tersedia/);
      const retry=await prepareOfficeNaturalChat(store,env,msg,transport);
      assert.equal(retry.duplicate,true);
    }
    const q=await prepare(881020,'Indra, sudah cek sejarah Tan Malaka?');
    assert.equal(q.mode,'generate');
    const ambiguous=await prepare(881021,'Citra, coba buat itu');
    assert.match(ambiguous.message,/jelaskan/);
    await assert.rejects(prepareOfficeNaturalChat(store,env,{...userMessage(881022,commands[0]),isBot:true},transport),{status:403});
    const dependency='Hana, buatkan tiga ide Reels dari riset Indra tadi.';
    const waiting=await prepare(881023,dependency);
    assert.match(waiting.message,/belum tersedia/);
    assert.equal(store.state().tasks.length,7);
    const source=store.state().tasks.find(task=>task.division==='research');
    store.settings({mode:'open'});
    const lease=store.claim(['draft'],source.id);
    store.finish(source.id,lease.token,{output:'Catatan arsip: tulisan Tan Malaka terbit pada 1925.'});
    const follow=await prepare(881024,dependency);
    assert.equal(follow.sourceTaskId,source.id);
    const task=store.state().tasks.find(task=>task.id===follow.createdTaskId);
    assert.match(task.description,/Catatan arsip/);
    assert.ok(task.description.includes(source.id));
  } finally { store.close(); }
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
  assert.deepEqual(newsWeekWindow(now),{start:'2026-11-07',end:'2026-11-13'});
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
  assert.match(request.systemInstruction.parts[0].text,/2026-11-07/);
  assert.match(request.systemInstruction.parts[0].text,/Ranoh Island Destinasi Pantai/);
  assert.doesNotMatch(buildOfficeNaturalRequest('research','Indra, teliti sejarah',
    {now,counts:{},tasks:[],people:{}}).systemInstruction.parts[0].text,/BATAS PEKERJAAN: Jihan/);
  assert.match(buildOfficeNaturalRequest('social','Hana, buat caption proyek lain',
    {now,counts:{},tasks:[],people:{}}).systemInstruction.parts[0].text,/proyek APA SAJA/);
});

test('official sources require HTTPS and genuine official domains',()=>{
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
    assert.ok(messages[0].body.text.startsWith(jihanNoVerifiedNews));
    assert.equal(store.state().tasks[0].status,'blocked');
    assert.throws(()=>store.artifact(result.reportId));
  }finally{store.close();}
});

test('Indra and Hana can answer about any project without forcing BCIFT scope',async()=>{
  messages.length=0;
  const store=createStore(':memory:',()=>now);
  try{
    const prepared=await prepareOfficeNaturalChat(store,env,
      userMessage(880022,'Indra, bagaimana pendapatmu tentang sejarah Indonesia untuk konten baru?'),transport);
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
