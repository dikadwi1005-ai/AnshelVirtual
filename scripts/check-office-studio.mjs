import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium }=await import(process.env.ANSHEL_PLAYWRIGHT_MODULE ?? 'playwright');
import { officeServer } from '../server/http.ts';
import { createStore } from '../server/store.ts';
import { divisions } from '../public/catalog.js';
import { activityAnchors } from '../public/furnishings.js';
let testClock=null;
const store=createStore(':memory:',()=>testClock ?? Date.now());
const password='local-fixture-password';
store.settings({mode:'open'});
const server=officeServer(store,{OWNER_PASSWORD:password});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.ANSHEL_CHROME_PATH,headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader']});
const errors=[];
async function open(options) {
  const page=await browser.newPage(options);
  await page.addInitScript(()=>{
    let seed=47017;
    Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  });
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('response',response=>{
    if (response.url().endsWith('/api/office-presence') && response.status()===400) {
      const {snapshot}=response.request().postDataJSON();
      errors.push('Snapshot presence ditolak: '+JSON.stringify({delivery:snapshot?.traffic?.delivery,
        poses:snapshot?.traffic?.poses, actors:snapshot?.actors?.map(({id,stage,anchor,position,y,path})=>({id,stage,anchor,position,y,
          waypoints:path.length}))}));
    }
  });
  page.on('console',msg=>{if(msg.type()==='error' && !msg.text().includes('401')) console.log('browser',msg.text().slice(0,250));});
  await page.goto(url);
  assert.equal((await page.request.get(url+'/api/state')).status(),401);
  await page.locator('#password').fill(password);
  await page.locator('#login-form button').click();
  await page.locator('#character-mode:enabled').waitFor({timeout:90000});
  return page;
}
const click=(p,id)=>p.locator('[data-studio-action="'+id+'"]').click();
const tab=(p,id)=>p.locator('[data-studio-tab="'+id+'"]').click();
const submit=(p,id)=>p.locator('#studio-'+id+' button[type=submit]').click();
function testAudio() {
  const samples=16000, wave=Buffer.alloc(44+samples*2);
  wave.write('RIFF'); wave.writeUInt32LE(wave.length-8,4); wave.write('WAVEfmt ',8);
  wave.writeUInt32LE(16,16); wave.writeUInt16LE(1,20); wave.writeUInt16LE(1,22);
  wave.writeUInt32LE(8000,24); wave.writeUInt32LE(16000,28); wave.writeUInt16LE(2,32);
  wave.writeUInt16LE(16,34); wave.write('data',36); wave.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++) wave.writeInt16LE(Math.round(Math.sin(i*Math.PI*.11)*1600),44+i*2);
  return {name:'fixture.wav',mimeType:'audio/wav',buffer:wave};
}
const shot=(p,name)=>process.env.ANSHEL_SCREENSHOTS && p.screenshot({path:process.env.ANSHEL_SCREENSHOTS+'/phase10-'+name+'.png'});
async function recordScene(page,selector='#scene canvas') {
  if (!process.env.ANSHEL_SCREENSHOTS) return async()=>{};
  await page.evaluate(selector=>{
    const stream=document.querySelector(selector).captureStream(15);
    const recorder=new MediaRecorder(stream,{videoBitsPerSecond:1800000});
    const chunks=[];
    recorder.ondataavailable=event=>chunks.push(event.data);
    window.finishSceneRecording=()=>new Promise(resolve=>{
      recorder.onstop=()=>{
        stream.getTracks().forEach(track=>track.stop());
        resolve(URL.createObjectURL(new Blob(chunks,{type:recorder.mimeType})));
      };
      recorder.stop();
    });
    recorder.start();
  },selector);
  return async name=>{
    const clip=await page.evaluate(()=>window.finishSceneRecording());
    const bytes=Buffer.from(await page.evaluate(async url=>{
      const data=new Uint8Array(await (await fetch(url)).arrayBuffer());
      URL.revokeObjectURL(url);
      let binary='';
      for (let i=0;i<data.length;i+=16384) binary+=String.fromCharCode(...data.subarray(i,i+16384));
      return btoa(binary);
    },clip),'base64');
    assert.ok(bytes.length>2000);
    await writeFile(process.env.ANSHEL_SCREENSHOTS+'/phase10-'+name+'.webm',bytes);
  };
}
async function inspectActivities(page) {
  const report=await page.evaluate(async()=>{
    const {officeScene}=await import('/scene.js');
    const host=document.getElementById('scene');
    const worldHost=document.createElement('div');
    worldHost.id='activity-qa-scene';
    const labels=document.createElement('div');
    worldHost.style.cssText='position:fixed;inset:0;z-index:900;background:#273346';
    worldHost.append(labels);
    host.after(worldHost);
    const world=officeScene(worldHost,labels,()=>{},()=>{},()=>{},null,{low:true});
    window.activityWorld={world,worldHost};
    const now=Date.parse('2026-11-16T05:12:00Z');
    world.state({now,phase:'lunch',people:{},audit:[],tasks:[]});
    await world.load();
    return true;
  });
  assert.equal(report,true);
  const cases=[
    ['management','nap','desk-nap','seated','management'],
    ['operations','phone','phone','seated','operations'],
    ['administration','brew','brew','arrived','pantry'],
    ['hr','coffee','drink','arrived','pantry'],
    ['development','snack','snack','arrived','pantry'],
    ['creative','read','read','seated','relaxation'],
    ['video','game','game-play','seated','gaming'],
    ['social','stretch','stretch','seated','social'],
    ['research','home-sleep','home-sleep','seated',null],
    ['marketing','talk','speak','arrived','hub'],
  ];
  const seed=(person,activity,clip,stage)=>{
    const options=activityAnchors(person,activity);
    const goal=options.find(anchor=>anchor.id.endsWith('-'+(person.index-2))) ?? options[0];
    const seated=stage==='seated';
    return {id:person.id,position:goal.point,y:seated?.021+goal.height:.021,angle:goal.angle,
      stage,activity,actual:activity,anchor:goal.id,animation:clip,seat:seated?1:0,path:[]};
  };
  const snapshots=divisions.map(person=>{
    const item=cases.find(([id])=>id===person.id);
    return item?seed(person,...item.slice(1,4)):seed(person,'desk','sit','seated');
  });
  await page.evaluate(actors=>window.activityWorld.world.sharedOffice({leader:false,snapshot:{actors,
    turn:{id:'marketing',text:'Selesai makan, kita ketemu lagi di ruang rapat.'}}}),snapshots);
  const source=page.locator('canvas[aria-label="Kantor 3D interaktif"]').last();
  await source.waitFor();
  const finish=await recordScene(page,'#activity-qa-scene canvas');
  for (const [id,activity,clip,stage,room] of cases) {
    await page.evaluate(({id,room})=>{
      const {world}=window.activityWorld;
      if (room) world.focusRoom(room);
      else world.focusDistrict(id);
    },{id,room});
    await page.waitForTimeout(1500);
    const pose=await page.evaluate(id=>window.activityWorld.world.actorState(id),id);
    assert.deepEqual([pose.activity,pose.animation,pose.stage],[activity,clip,stage]);
    if (process.env.ANSHEL_SCREENSHOTS) await source.screenshot({path:process.env.ANSHEL_SCREENSHOTS+'/phase10-activity-'+activity+'.png'});
  }
  await page.evaluate(actors=>{
    const {world}=window.activityWorld;
    const now=Date.parse('2026-11-16T06:15:00Z');
    world.state({now,phase:'work',people:{management:{executing:true}},audit:[],tasks:[]});
    world.sharedOffice({leader:true,resume:true,age:0,snapshot:{actors}});
    world.focusRoom('management');
  },snapshots);
  await page.waitForFunction(()=>window.activityWorld.world.actorState('management')?.animation==='desk-work');
  await page.waitForTimeout(2100);
  await page.evaluate(()=>window.activityWorld.world.focusDistrict('research'));
  await page.waitForFunction(()=>window.activityWorld.world.actorState('research')?.activity!=='home-sleep');
  await page.waitForTimeout(2100);
  await finish('activities-shared-poses');
  await page.evaluate(()=>{
    const {world,worldHost}=window.activityWorld;
    world.dispose();
    worldHost.remove();
    delete window.activityWorld;
  });
}
async function perf(page) {
  return page.evaluate(()=>new Promise(resolve=>{
    const samples=[];
    let previous=performance.now();
    function sample(now) {
      samples.push(now-previous); previous=now;
      if(samples.length<60) requestAnimationFrame(sample);
      else {
        samples.sort((a,b)=>a-b);
        const scene=document.getElementById('scene');
        const loadMs=performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd;
        resolve({medianMs:+samples[30].toFixed(1),p95Ms:+samples[56].toFixed(1),heapMiB:Math.round((performance.memory?.usedJSHeapSize ?? 0)/1048576),
          drawCalls:Number(scene.dataset.drawCalls),employees:Number(scene.dataset.activeEmployees),domReadyMs:Math.round(loadMs??0)});
      }
    }
    requestAnimationFrame(sample);
  }));
}
try {
  const metrics={};
  let bytes=0, mp4=false;
  if (!process.env.ANSHEL_PHASE10_FOCUS) {
  const desktop=await open({viewport:{width:1440,height:900}});
  metrics.live=await perf(desktop);
  await desktop.locator('#building-toggle').click();
  await desktop.waitForFunction(()=>document.getElementById('scene').dataset.buildings==='exterior');
  await shot(desktop,'building-front');
  await desktop.locator('[data-panel=district]').click();
  await desktop.locator('[data-district=area]').click();
  await desktop.waitForTimeout(1150);
  await shot(desktop,'district');
  await desktop.locator('[data-district=research]').click();
  await desktop.waitForTimeout(1150);
  await shot(desktop,'home-exterior');
  await desktop.locator('#building-toggle').click();
  await desktop.waitForFunction(()=>document.getElementById('scene').dataset.buildings==='interior');
  await shot(desktop,'home-interior');
  if (process.env.ANSHEL_SCREENSHOTS) {
    for (const home of ['management','operations','administration','hr','development','creative','video',
      'social','research','marketing','qa','finance']) {
      await desktop.locator('[data-district='+home+']').click();
      await desktop.locator('#inspector-back').click();
      await desktop.waitForTimeout(900);
      await shot(desktop,'house-'+home);
      await desktop.locator('[data-panel=district]').click();
    }
  }
  await desktop.locator('[data-district=office]').click();
  await desktop.waitForTimeout(950);
  await desktop.locator('#inspector-back').click();
  await desktop.waitForFunction(()=>Number(document.getElementById('scene').dataset.campusActors)>0);
  if (await desktop.locator('#light-toggle').getAttribute('data-next')==='day') await desktop.locator('#light-toggle').click();
  await desktop.waitForTimeout(900);
  await shot(desktop,'campus-day');
  const stage=desktop.locator('#scene canvas');
  const bounds=await stage.boundingBox();
  await desktop.mouse.move(bounds.width*.53,bounds.height*.43);
  await desktop.mouse.down();
  await desktop.mouse.move(bounds.width*.82,bounds.height*.45,{steps:20});
  await desktop.mouse.up();
  await desktop.locator('#light-toggle').click();
  await desktop.waitForTimeout(900);
  await shot(desktop,'campus-night');
  await desktop.locator('#building-toggle').click();
  await desktop.waitForFunction(()=>document.getElementById('scene').dataset.buildings==='exterior');
  await shot(desktop,'building-rear');
  await desktop.locator('#building-toggle').click();
  if (process.env.ANSHEL_SCREENSHOTS) {
    for(const room of ['management','operations','administration','hr','development','creative','video','social','research',
      'marketing','qa','finance','executive','reception','meeting','gaming','pantry','restroom','garden','relaxation','hub']) {
      await desktop.locator('[data-panel=office]').click();
      await desktop.locator('[data-room='+room+']').click();
      await desktop.locator('#inspector-back').click();
      await desktop.waitForTimeout(620);
      await shot(desktop,'room-'+room);
    }
  }
  await desktop.locator('[data-panel=office]').click();
  await desktop.locator('[data-room=development]').click();
  await desktop.locator('[data-workstation=development]').click();
  await desktop.locator('[data-focus-display=monitor]').click();
  await desktop.locator('#minimize-display').click();
  assert.match(await desktop.locator('#panel-content').innerText(),/Antrean/);
  await desktop.locator('[data-panel=studio]').click();
  await desktop.locator('[name=agenda]').fill('Verifikasi video kantor');
  await desktop.locator('[name=first]').selectOption('research');
  await desktop.locator('[name=second]').selectOption('development');
  await desktop.locator('[name=third]').selectOption('marketing');
  await desktop.locator('[name=fourth]').selectOption('qa');
  await submit(desktop,'meeting');
  try {
    await desktop.waitForFunction(()=>document.querySelector('#studio-attendance')?.textContent.match(/Hadir/g)?.length===4,{},{timeout:110000});
  } catch (error) {
    console.log('Kehadiran:',await desktop.locator('#studio-attendance').textContent());
    console.log('Presence:',await desktop.evaluate(async()=>{
      const response=await fetch('/api/office-presence',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({client:crypto.randomUUID()})});
      const data=await response.json();
      return data.snapshot?.actors.filter(actor=>['research','development','marketing','qa'].includes(actor.id))
        .map(({id,stage,actual,anchor,position,path})=>({id,stage,actual,anchor,position,path}));
    }));
    throw error;
  }
  metrics.meeting=await perf(desktop);
  await click(desktop,'presentation'); await desktop.waitForTimeout(900); await shot(desktop,'presentation'); await click(desktop,'presentation-close'); await shot(desktop,'meeting');
  await desktop.locator('[name=notes]').fill('Empat peserta tiba di Pod Rapat.');
  await desktop.locator('[name=decisions]').fill('Siapkan video pendek.');
  await click(desktop,'followup');
  assert.equal(await desktop.locator('#task-form [name=description]').inputValue(),'Siapkan video pendek.');
  await desktop.locator('#task-form [data-close]').click();
  await Promise.all([desktop.waitForResponse(response=>response.url().endsWith('/api/studio/meetings') &&
    response.request().method()==='POST' && response.ok()),desktop.locator('#studio-minutes button[value=save]').click()]);
  await desktop.waitForTimeout(1000);
  await tab(desktop,'replay');
  await click(desktop,'archive-now');
  await desktop.locator('#studio-archive option[value^="local:"]').first().waitFor({state:'attached'});
  await desktop.reload();
  await desktop.locator('#character-mode:enabled').waitFor({timeout:90000});
  await desktop.locator('[data-panel=studio]').click();
  await desktop.locator('#studio-minutes').waitFor();
  assert.match(await desktop.locator('[name=notes]').inputValue(),/Empat peserta tiba/);
  await desktop.locator('#studio-minutes button[value=close]').click();
  await desktop.locator('#studio-meeting').waitFor();
  await tab(desktop,'plan');
  await desktop.locator('[name=instruction]').fill('Jadikan rapat tadi video pendek');
  await submit(desktop,'plan');
  assert.match(await desktop.locator('#studio-storyboard').innerText(),/Empat peserta tiba/);
  await tab(desktop,'replay');
  await desktop.locator('#studio-archive option').nth(1).waitFor({state:'attached'});
  await desktop.locator('#studio-archive').selectOption({index:1});
  const upload=desktop.waitForResponse(response=>response.url().endsWith('/api/studio/replay') &&
    response.request().postDataJSON()?.action==='save');
  await click(desktop,'cloud-save');
  const uploaded=await upload;
  assert.equal(uploaded.status(),200,await uploaded.text());
  await desktop.locator('#studio-archive option[value^="cloud:"]').first().waitFor({state:'attached'});
  await desktop.locator('#studio-archive').selectOption({index:1});
  await click(desktop,'replay-start');
  await desktop.waitForFunction(()=>Number(document.querySelector('#studio-seek')?.max)>0);
  await desktop.locator('#studio-camera').selectOption('meeting');
  const clipEnd=Math.min(2,Number(await desktop.locator('#studio-video [name=end]').inputValue()));
  assert.ok(clipEnd>=.5);
  await desktop.locator('#studio-video [name=end]').fill(String(clipEnd));
  await desktop.locator('#studio-video [name=heading]').fill('Anshel · Rapat');
  await click(desktop,'clip-add');
  await click(desktop,'clip-add');
  await click(desktop,'clip-up-1');
  await desktop.locator('#studio-video [name=audio]').setInputFiles(testAudio());
  await desktop.locator('#studio-video [name=background]').setInputFiles(testAudio());
  await submit(desktop,'video');
  await desktop.locator('#studio-output video').waitFor({timeout:30000});
  bytes=await desktop.locator('#studio-output video').evaluate(async video=>(await (await fetch(video.src)).blob()).size);
  if (process.env.ANSHEL_SCREENSHOTS) {
    const encoded=await desktop.locator('#studio-output video').evaluate(async video=>{
      const data=new Uint8Array(await (await fetch(video.src)).arrayBuffer());
      let binary='';
      for (let i=0;i<data.length;i+=16384) binary+=String.fromCharCode(...data.subarray(i,i+16384));
      return btoa(binary);
    });
    await writeFile(process.env.ANSHEL_SCREENSHOTS+'/phase10-replay.webm',Buffer.from(encoded,'base64'));
  }
  assert.ok(bytes>2000); await desktop.waitForFunction(()=>document.querySelector('#studio-output video')?.readyState>=2); const dimensions=await desktop.locator('#studio-output video').evaluate(v=>[v.videoWidth,v.videoHeight]); assert.deepEqual(dimensions,[960,540]);
  metrics.replay=await perf(desktop);
  await shot(desktop,'replay'); await desktop.locator('#studio-video [name=ratio]').selectOption('portrait'); await submit(desktop,'video'); await desktop.waitForFunction(()=>document.querySelector('#studio-output video')?.videoHeight===960,{},{timeout:30000});
  if (await desktop.evaluate(()=>MediaRecorder.isTypeSupported('video/mp4'))) {
    await desktop.locator('#studio-video [name=format]').selectOption('mp4');
    await submit(desktop,'video');
    await desktop.locator('#studio-output a[download$=".mp4"]').waitFor({timeout:30000});
    await desktop.waitForFunction(()=>document.querySelector('#studio-output video')?.readyState>=2);
    mp4=await desktop.locator('#studio-output video').evaluate(async video=>{
      const data=new Uint8Array(await (await fetch(video.src)).arrayBuffer());
      return String.fromCharCode(...data.slice(4,8))==='ftyp';
    });
    assert.ok(mp4);
  }
  await click(desktop,'replay-stop');
  await tab(desktop,'layout');
  await desktop.locator('#studio-layout [name=v0]').fill('.25');
  await click(desktop,'layout-preview');
  await desktop.waitForTimeout(1200);
  await shot(desktop,'layout');
  await submit(desktop,'layout');
  await click(desktop,'save');
  assert.match(await desktop.evaluate(()=>localStorage.getItem('anshel-layout-v1')),/0.25/);
  await click(desktop,'undo');
  assert.equal(await desktop.locator('#studio-layout [name=v0]').inputValue(),'0');
  await click(desktop,'redo');
  assert.equal(await desktop.locator('#studio-layout [name=v0]').inputValue(),'0.25');
  await click(desktop,'reset');
  await tab(desktop,'schedule');
  await desktop.locator('#studio-schedule [name=label]').fill('Uji pengingat');
  await desktop.locator('#studio-schedule [name=when]').fill('2026-01-01T09:00');
  await submit(desktop,'schedule');
  await desktop.locator('[data-studio-plan]').click();
  assert.equal(await desktop.locator('#task-form [name=description]').inputValue(),'Uji pengingat');
  await desktop.locator('#task-form [data-close]').click();
  const cityReady=desktop.waitForResponse(response=>response.url().endsWith('/api/studio/nation-city'));
  await tab(desktop,'city');
  await cityReady;
  await desktop.waitForTimeout(350);
  const at=new Date().toISOString();
  await desktop.locator('[name=snapshot]').setInputFiles({name:'city.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
    version:1,status:'offline',updatedAt:at,events:[{id:'e-1',type:'city.service',at,label:'<img src=x onerror=alert(1)>'}]
  }))});
  await submit(desktop,'city');
  await desktop.locator('#studio-body h3').filter({hasText:'offline'}).waitFor();
  assert.equal(await desktop.locator('#studio-body img').count(),0);
  await desktop.close();
  const mobile=await open({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  metrics.mobile=await perf(mobile);
  await mobile.locator('#character-mode').tap();
  await mobile.locator('[data-panel=office]').tap();
  await mobile.locator('[data-room=development]').tap();
  await mobile.locator('[data-workstation=development]').tap();
  await mobile.locator('[data-focus-display=monitor]').tap();
  await mobile.locator('#minimize-display').tap();
  await mobile.locator('[data-panel=studio]').tap();
  await shot(mobile,'mobile');
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
  await mobile.close();
  }
  testClock=Date.parse('2026-11-16T05:10:00Z');
  store.settings({mode:'auto'});
  const lunch=await open({viewport:{width:1280,height:800}});
  await lunch.locator('[data-panel=district]').click();
  await lunch.waitForTimeout(5000);
  assert.equal(await lunch.locator('#scene').getAttribute('data-food-courier'),'false');
  assert.equal(await lunch.locator('#district-delivery').textContent(),'');
  await lunch.locator('[data-district=gate]').click();
  await lunch.locator('#district-food [name=employee]').selectOption('marketing');
  await lunch.locator('#district-food [name=food]').selectOption('Nasi uduk');
  const finishBeforeSwitch=await recordScene(lunch);
  await lunch.locator('#district-food button').click();
  await lunch.locator('#district-delivery').filter({hasText:'Kurir Saji Kampung'}).waitFor({timeout:40000});
  assert.match(await lunch.locator('#district-delivery').innerText(),/Nasi uduk · Jihan/);
  const observer=await open({viewport:{width:900,height:650},deviceScaleFactor:1});
  await observer.waitForFunction(()=>document.getElementById('scene').dataset.foodCourier==='true',{},{timeout:25000});
  await shot(lunch,'scooter');
  const snapshotOrder=page=>page.evaluate(async()=>{
    const response=await fetch('/api/office-presence',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({client:crypto.randomUUID()})});
    return (await response.json()).snapshot?.traffic?.delivery?.order;
  });
  const before=await snapshotOrder(observer);
  assert.equal(before?.id,'marketing');
  const takeOver=observer.waitForResponse(response=>response.url().endsWith('/api/office-presence') &&
    response.request().postDataJSON()?.takeOver===true);
  await observer.locator('#character-mode').click();
  const newOwner=await (await takeOver).json();
  assert.equal(newOwner.leader,true);
  assert.equal(newOwner.snapshot.traffic.delivery.order.orderId,before.orderId);
  await observer.locator('#character-mode').click();
  await observer.locator('[data-panel=district]').click();
  await observer.locator('[data-district=gate]').click();
  const finishAfterSwitch=await recordScene(observer);
  await finishBeforeSwitch('food-before-takeover');
  await lunch.close();
  await observer.locator('#district-delivery').filter({hasText:'Pesanan diserahkan'}).waitFor({timeout:145000}).catch(async error=>{
    console.log('Status pengantaran:',await observer.locator('#district-delivery').textContent(),await snapshotOrder(observer));
    throw error;
  });
  assert.equal((await snapshotOrder(observer)).orderId,before.orderId);
  await shot(observer,'food-handoff');
  await observer.waitForFunction(()=>document.getElementById('scene').dataset.foodCourier==='false',{},{timeout:90000});
  await finishAfterSwitch('food-after-takeover');
  await observer.close();
  if (process.env.ANSHEL_SCREENSHOTS) {
    const activities=await open({viewport:{width:1280,height:800}});
    await inspectActivities(activities);
    await activities.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({videoBytes:bytes,mp4,metrics,errors}));
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  store.close();
}
