import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStore} from '../server/store.ts';
import {telegramMediaMaxBytes,telegramMediaMime,loadTelegramMedia,
  questionForMedia,attachMediaToGeminiRequest} from '../server/telegram-media.ts';
import {prepareOfficeNaturalChat} from '../server/telegram-natural.ts';

const tokens=Object.fromEntries(['management','operations','administration','hr']
  .map((id,i)=>[id,String(370001+i)+':'+('T'.repeat(38))]));
const env={TELEGRAM_CHAT_ID:'-1001234567890',TELEGRAM_USER_ID:'778899',
  TELEGRAM_BOT_TOKENS_JSON:JSON.stringify(tokens)};
const base=Date.parse('2026-11-13T03:00:00Z');
const msg=(id,text,media={})=>({chatId:env.TELEGRAM_CHAT_ID,userId:env.TELEGRAM_USER_ID,
  updateId:String(id),isBot:false,text,...media});
const fileId='AgACAgQAAxkBAAE121';
const bytes=new TextEncoder().encode('media demo content');
const fetchMedia=async(url,options)=>{
  if(url.endsWith('/getFile')){
    assert.equal(options.method,'POST');
    assert.equal(JSON.parse(options.body).file_id,fileId);
    return new Response(JSON.stringify({ok:true,result:{
      file_path:'photos/telegram.jpg',file_size:bytes.length}}),{
      status:200,headers:{'Content-Type':'application/json'}});
  }
  if(url.includes('/file/bot')){
    assert.equal(options.method,'GET');
    return new Response(bytes,{status:200,headers:{
      'Content-Type':'image/jpeg','Content-Length':String(bytes.length)}});
  }
  return new Response(JSON.stringify({ok:true,result:{message_id:100}}),{
    status:200,headers:{'Content-Type':'application/json'}});
};

test('MIME and byte limits reject unsupported file kinds and unsafe overlarge media',()=>{
  assert.equal(telegramMediaMaxBytes,1_500_000);
  assert.equal(telegramMediaMime({mediaType:'photo'}),'image/jpeg');
  assert.equal(telegramMediaMime({mediaType:'voice'}),'audio/ogg');
  assert.equal(telegramMediaMime({mediaType:'document',mimeType:'application/pdf'}),'application/pdf');
  assert.equal(telegramMediaMime({mediaType:'document',mimeType:'application/x-msdownload'}),null);
  assert.equal(telegramMediaMime({mediaType:'video',mimeType:'video/mp4'}),'video/mp4');
  assert.equal(telegramMediaMime({mediaType:'audio',mimeType:'audio/wav'}),'audio/wav');
  assert.equal(questionForMedia({mediaType:'voice'}).includes('pesan suara'),true);
  const noId=await loadTelegramMedia(env,{mediaType:'photo'});
  assert.equal(noId.reason,'no-file-id');
  const large=await loadTelegramMedia(env,{mediaType:'photo',fileId,
    fileSize:2_000_000},()=>{throw new Error('download should not happen');});
  assert.equal(large.reason,'too-large');
  const fake=await loadTelegramMedia(env,{mediaType:'document',mimeType:'application/zip',
    fileId,fileSize:20},()=>{throw new Error('should not fetch');});
  assert.equal(fake.reason,'unsupported-type');
});

test('Telegram file adapter downloads only from fixed Telegram API origins',async()=>{
  const loaded=await loadTelegramMedia(env,{mediaType:'photo',fileId,fileSize:bytes.length},
    fetchMedia);
  assert.equal(loaded.ok,true);
  assert.equal(loaded.inlineData.mime_type,'image/jpeg');
  assert.equal(loaded.inlineData.data,Buffer.from(bytes).toString('base64'));
  const escaped=await loadTelegramMedia(env,{mediaType:'photo',fileId},async()=>new Response(
    JSON.stringify({ok:true,result:{file_path:'../../private/key',file_size:30}}),{status:200}));
  assert.equal(escaped.reason,'invalid-file-path');
  const streamed=await loadTelegramMedia(env,{mediaType:'photo',fileId},async(url)=>{
    if(url.endsWith('/getFile'))return new Response(JSON.stringify({
      ok:true,result:{file_path:'photos/x.jpg',file_size:100}}),{status:200});
    return new Response(bytes,{status:200,headers:{'Content-Length':'1500001'}});
  });
  assert.equal(streamed.reason,'too-large-or-empty');
});

test('owner text+photo produces real Gemini inline_data without storing raw media as conversation history',async()=>{
  const store=createStore(':memory:',()=>base);
  try{
    const prep=await prepareOfficeNaturalChat(store,env,
      msg(80111,'Alya, coba jelaskan foto ini ya',{
        mediaType:'photo',fileId,mimeType:'image/jpeg',fileSize:bytes.length,
      }),fetchMedia);
    assert.equal(prep.mode,'generate');
    assert.equal(prep.division,'management');
    const parts=prep.request.contents.at(-1).parts;
    assert.equal(parts.length,2);
    assert.equal(parts[1].inline_data.mime_type,'image/jpeg');
    assert.equal(parts[1].inline_data.data,Buffer.from(bytes).toString('base64'));
    assert.match(prep.request.systemInstruction.parts[0].text,/LAMPIRAN:/);
    assert.equal(store.officeGroupWorkspace().notes.length,0);
    assert.ok(!JSON.stringify(store.state()).includes(Buffer.from(bytes).toString('base64')));
  }finally{store.close();}
});

test('a photo with Guys triggers just one structured Gemini request for available active bots',async()=>{
  const store=createStore(':memory:',()=>base);
  try{
    const prep=await prepareOfficeNaturalChat(store,env,
      msg(80112,'Guys, menurut kalian foto ini bagaimana?',{
        mediaType:'photo',fileId,mimeType:'image/jpeg',fileSize:bytes.length,
      }),fetchMedia);
    assert.equal(prep.mode,'generate');
    assert.equal(prep.group,true);
    assert.deepEqual(prep.recipients,['management','operations','administration','hr']);
    assert.equal(prep.request.contents[0].parts.at(-1).inline_data.mime_type,'image/jpeg');
    assert.equal(prep.request.generationConfig.responseMimeType,'application/json');
  }finally{store.close();}
});

test('media without file ID remains acknowledged truthfully, never claimed analyzed',async()=>{
  const store=createStore(':memory:',()=>base);
  try{
    const prep=await prepareOfficeNaturalChat(store,env,
      msg(80113,'',{mediaType:'photo'}),fetchMedia);
    assert.equal(prep.mode,'handled');
    assert.equal(prep.analyzed,false);
    assert.equal(prep.mediaReason,'no-file-id');
  }finally{store.close();}
});

test('media Code node contains Telegram file IDs but not raw bytes or secret tokens',async()=>{
  const wf=JSON.parse(await readFile('workflows/office_telegram_group_natural.json','utf8'));
  const node=wf.nodes.find(n=>n.name==='Saring pesan manusia');
  const standalone=await readFile('workflows/n8n_saring_pesan_manusia_telegram_2026.js','utf8');
  assert.match(node.parameters.jsCode,/fileId/);
  assert.match(node.parameters.jsCode,/fileSize/);
  assert.match(node.parameters.jsCode,/mimeType/);
  assert.match(standalone,/fileId/);
  assert.equal(wf.nodes.filter(n=>n.type==='n8n-nodes-base.telegramTrigger').length,1);
  assert.ok(!node.parameters.jsCode.includes('bot_token'));
});
