import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStore } from '../server/store.ts';
import { createCloudApi } from '../api/route.ts';
import { formatTelegramTaskNotification } from '../server/telegram-notifications.ts';

const config={ OWNER_PASSWORD:'test-password-long',
  N8N_TOKEN:'test-notifier-token-longer-than-24',TELEGRAM_CHAT_ID:'123456789' };
const workflow=JSON.parse(await readFile('workflows/office_telegram_notifications.json','utf8'));
function fixture(clock) {
  const sqlite=createStore(':memory:',()=>clock.value);
  const api=createCloudApi({...sqlite,sessionActive:async()=>false},config);
  async function call(path,payload={},authorized=true) {
    return api.fetch(new Request('https://anshel.example/api/integrations/notifications/'+path,{
      method:'POST',headers:{
        'Content-Type':'application/json',
        ...(authorized?{Authorization:'Bearer '+config.N8N_TOKEN}:{})
      },body:JSON.stringify(payload),
    }));
  }
  return {sqlite,call};
}
const taskInput=(division='finance')=>({
  division,kind:'draft',description:'Instruksi rahasia tidak boleh bocor',project:'Tester',urgent:true
});

test('workflow Telegram terisolasi dan tidak membawa credential',()=>{
  assert.equal(workflow.active,false);
  assert.equal(workflow.settings.timezone,'Asia/Jakarta');
  assert.equal(workflow.settings.saveDataSuccessExecution,'none');
  assert.equal(workflow.settings.saveDataErrorExecution,'none');
  assert.equal(workflow.nodes.length,5);
  assert.equal(workflow.nodes[0].type,'n8n-nodes-base.scheduleTrigger');
  assert.equal(workflow.nodes[0].parameters.rule.interval[0].expression,'*/30 * * * *');
  const names=['Periksa pembaruan','Ambil notifikasi','Siapkan pesan','Kirim ke Telegram','Konfirmasi terkirim'];
  assert.deepEqual(workflow.nodes.map(n=>n.name),names);
  assert.ok(workflow.nodes.every(n=>!n.credentials));
  assert.equal(workflow.nodes[1].parameters.url,'https://anshel-virtual.vercel.app/api/integrations/notifications/claim');
  assert.equal(workflow.nodes[4].parameters.url,'https://anshel-virtual.vercel.app/api/integrations/notifications/ack');
  for(let i=0;i<names.length-1;i++)
    assert.equal(workflow.connections[names[i]].main[0][0].node,names[i+1]);
  assert.match(workflow.nodes[4].parameters.jsonBody,/Siapkan pesan/);
  const code=workflow.nodes[2].parameters.jsCode;
  const prepare=json=>new Function('$input',code)({first:()=>({json})});
  assert.deepEqual(prepare({notification:null}),[]);
  assert.equal(prepare({notification:{eventId:7,token:'t',chatId:'123',text:'OK'}}).length,1);
});

test('polling pertama melewati riwayat lalu completed dikirim sekali dan privat',async()=>{
  const clock={value:Date.parse('2026-11-12T03:00:00Z')};
  const {sqlite,call}=fixture(clock);
  try {
    const old=sqlite.create(taskInput());
    const runningOld=sqlite.claim(['draft']);
    sqlite.finish(runningOld.id,runningOld.token,{output:'Arsip privat sebelumnya'});
    assert.equal((await call('claim',{},false)).status,401);
    assert.equal((await call('claim',{kinds:['draft']})).status,400);
    assert.deepEqual(await (await call('claim')).json(),{notification:null});
    const newer=sqlite.create(taskInput('management'));
    const running=sqlite.claim(['draft']);
    sqlite.finish(running.id,running.token,{output:'Isi draf privat jangan dikirim Telegram'});
    const response=await call('claim');
    assert.equal(response.status,200);
    const {notification}=await response.json();
    assert.ok(notification.eventId>0);
    assert.equal(notification.chatId,'123456789');
    assert.match(notification.text,/Selesai/);
    assert.match(notification.text,/Manajemen/);
    assert.ok(notification.text.includes(newer.id));
    assert.ok(!notification.text.includes('Instruksi rahasia'));
    assert.ok(!notification.text.includes('Isi draf privat'));
    assert.ok(!notification.text.includes(notification.token));
    assert.deepEqual(await (await call('claim')).json(),{notification:null});
    assert.equal((await call('ack',{eventId:notification.eventId,token:'wrong'})).status,409);
    assert.equal((await call('ack',{eventId:notification.eventId,token:notification.token})).status,200);
    assert.deepEqual(await (await call('claim')).json(),{notification:null});
  } finally {sqlite.close();}
});

test('failed dan blocked terdeteksi, lease kedaluwarsa bisa diulang',async()=>{
  const clock={value:Date.parse('2026-11-12T03:00:00Z')};
  const {sqlite,call}=fixture(clock);
  try {
    await call('claim'); // bootstrap
    const failed=sqlite.create(taskInput('qa'));
    let running=sqlite.claim(['draft']);
    sqlite.finish(running.id,running.token,{error:'Teks error sensitif'});
    const first=(await (await call('claim')).json()).notification;
    assert.match(first.text,/Gagal/);
    assert.ok(!first.text.includes('Teks error sensitif'));
    clock.value+=11*60_000;
    const retry=(await (await call('claim')).json()).notification;
    assert.equal(retry.eventId,first.eventId);
    assert.notEqual(retry.token,first.token);
    assert.equal((await call('ack',{eventId:first.eventId,token:first.token})).status,409);
    assert.equal((await call('ack',{eventId:retry.eventId,token:retry.token})).status,200);
    const blocked=sqlite.create(taskInput('finance'));
    running=sqlite.claim(['draft']);
    sqlite.finish(running.id,running.token,{error:'Kuota provider',unavailable:true});
    const second=(await (await call('claim')).json()).notification;
    assert.match(second.text,/Terhambat/);
    assert.ok(second.text.includes(blocked.id));
    assert.equal((await call('ack',{eventId:second.eventId,token:second.token})).status,200);
  } finally {sqlite.close();}
});

test('notifier tidak menerima chatId arbitrer atau token lemah, dan teks aman',async()=>{
  const clock={value:Date.parse('2026-11-12T03:00:00Z')};
  const {sqlite,call}=fixture(clock);
  try {
    assert.equal((await call('ack',{eventId:0,token:''})).status,400);
    assert.equal((await call('claim',{chatId:'999'})).status,400);
    const text=formatTelegramTaskNotification({action:'blocked',division:'finance',
      taskId:'fixture-uuid',project:'Tester',description:'Private detail',error:'Private error',
      token:'Private token',output:'Private output'});
    assert.match(text,/Terhambat/);
    assert.ok(!/Private/.test(text));
    const bad=createCloudApi({...sqlite,sessionActive:async()=>false},{
      ...config,TELEGRAM_CHAT_ID:undefined,
    });
    const res=await bad.fetch(new Request('https://anshel.example/api/integrations/notifications/claim',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.N8N_TOKEN},
      body:'{}',
    }));
    assert.equal(res.status,503);
  } finally {sqlite.close();}
});
