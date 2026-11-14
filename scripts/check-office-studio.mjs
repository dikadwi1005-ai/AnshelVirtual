import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium }=await import(process.env.ANSHEL_PLAYWRIGHT_MODULE ?? 'playwright');
import { officeServer } from '../server/http.ts';
import { createStore } from '../server/store.ts';
const store=createStore(':memory:');
const password='local-fixture-password';
store.settings({mode:'open'});
const server=officeServer(store,{OWNER_PASSWORD:password});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.ANSHEL_CHROME_PATH,headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader']});
const errors=[];
async function open(options) {
  const page=await browser.newPage(options);
  page.on('pageerror',error=>errors.push(String(error)));
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
const shot=(p,name)=>process.env.ANSHEL_SCREENSHOTS && p.screenshot({path:process.env.ANSHEL_SCREENSHOTS+'/phase8-'+name+'.png'});
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
  const desktop=await open({viewport:{width:1440,height:900}});
  const metrics={live:await perf(desktop)};
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
  await desktop.waitForFunction(()=>document.querySelector('#studio-attendance')?.textContent.match(/Hadir/g)?.length===4,{},{timeout:90000});
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
  await click(desktop,'replay-start');
  await desktop.locator('#studio-camera').selectOption('meeting');
  await desktop.locator('#studio-video [name=end]').fill('2');
  await desktop.locator('#studio-video [name=heading]').fill('Anshel · Rapat');
  await submit(desktop,'video');
  await desktop.locator('#studio-output video').waitFor({timeout:30000});
  const bytes=await desktop.locator('#studio-output video').evaluate(async video=>(await (await fetch(video.src)).blob()).size);
  if (process.env.ANSHEL_SCREENSHOTS) {
    const encoded=await desktop.locator('#studio-output video').evaluate(async video=>{
      const data=new Uint8Array(await (await fetch(video.src)).arrayBuffer());
      let binary='';
      for (let i=0;i<data.length;i+=16384) binary+=String.fromCharCode(...data.subarray(i,i+16384));
      return btoa(binary);
    });
    await writeFile(process.env.ANSHEL_SCREENSHOTS+'/phase8-replay.webm',Buffer.from(encoded,'base64'));
  }
  assert.ok(bytes>2000); await desktop.waitForFunction(()=>document.querySelector('#studio-output video')?.readyState>=2); const dimensions=await desktop.locator('#studio-output video').evaluate(v=>[v.videoWidth,v.videoHeight]); assert.deepEqual(dimensions,[960,540]);
  metrics.replay=await perf(desktop);
  await shot(desktop,'replay'); await desktop.locator('#studio-video [name=ratio]').selectOption('portrait'); await submit(desktop,'video'); await desktop.waitForFunction(()=>document.querySelector('#studio-output video')?.videoHeight===960,{},{timeout:30000});
  let mp4=false;
  if (await desktop.evaluate(()=>MediaRecorder.isTypeSupported('video/mp4'))) {
    await desktop.locator('#studio-video [name=format]').selectOption('mp4');
    await submit(desktop,'video');
    await desktop.locator('#studio-output a[download$=".mp4"]').waitFor({timeout:30000});
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
  await tab(desktop,'city');
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
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({videoBytes:bytes,mp4,metrics,errors}));
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  store.close();
}
