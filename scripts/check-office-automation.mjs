import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { officeServer } from '../server/http.ts';
import { createStore } from '../server/store.ts';
const {chromium}=await import(process.env.ANSHEL_PLAYWRIGHT_MODULE ?? 'playwright');
const output=process.env.ANSHEL_SCREENSHOTS;
if (!output) throw new Error('Set ANSHEL_SCREENSHOTS to an output directory.');
const now=Date.parse('2026-11-22T03:00:00Z');
const store=createStore(':memory:',()=>now);
const password='automation-fixture-local-only';
const server=officeServer(store,{OWNER_PASSWORD:password});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.ANSHEL_CHROME_PATH,headless:true});
const errors=[];
try {
  const desktop=await browser.newPage({viewport:{width:1440,height:1000}});
  desktop.on('pageerror',error=>errors.push(error.message));
  const login=await desktop.request.post(origin+'/api/login',{data:{password}});
  assert.equal(login.status(),200);
  await desktop.goto(origin+'/automation.html');
  await desktop.getByText('Data diperbarui',{exact:false}).first().waitFor();
  assert.match(await desktop.locator('#lead-list').innerText(),/Belum ada/);
  await desktop.locator('#lead-settings [name=maxAgeHours]').fill('6');
  await desktop.locator('#lead-settings button[type=submit]').click();
  await desktop.locator('#feedback').filter({hasText:'Perubahan tersimpan'}).waitFor();
  assert.equal(store.automation().leadSettings.maxAgeHours,6);
  await desktop.locator('[data-tab=flights]').click();
  await desktop.locator('#watch-settings button[type=submit]').click();
  await desktop.locator('#watch-list .watch-row').waitFor();
  const watch=store.automation().watches[0];
  assert.equal(watch.windowDays,30);
  assert.equal(watch.mode,'rolling');
  const offer=total=>({from:'SUB',to:'BTH',date:'2026-11-23',flight:'JT900',airline:'Lion Air',departure:'2026-11-23T07:00:00+07:00',
    arrival:'2026-11-23T09:00:00+07:00',cabin:'ECONOMY',passengers:1,fare:'fixture-economy',baggage:'20kg',
    currency:'IDR',total,mandatoryFeesIncluded:true,stops:0});
  let job=store.automation({action:'claim',module:'flights'});
  store.automation({action:'flight-ingest',...job,provider:'manual',offers:[offer(1000000)]});
  store.automation({action:'flight-ingest',...job,provider:'manual',offers:[offer(900000)]});
  await desktop.locator('#refresh').click();
  await desktop.locator('#feedback').filter({hasText:'Data diperbarui'}).waitFor();
  await desktop.locator('#flight-offers').getByText(/900.000/).waitFor();
  assert.ok(await desktop.locator('#price-chart > span').count()>=2);
  await desktop.screenshot({path:output+'/flight-desktop.png',fullPage:true});
  await desktop.locator('[data-control=pause]').click();
  await desktop.locator('#feedback').filter({hasText:'Perubahan tersimpan'}).waitFor();
  assert.equal(store.automation().watches[0].status,'paused');
  await desktop.reload();
  await desktop.locator('[data-tab=flights]').click();
  await desktop.locator('#watch-list').getByText(/paused/).waitFor();
  await desktop.locator('[data-control=resume]').click();
  await desktop.locator('#feedback').filter({hasText:'Perubahan tersimpan'}).waitFor();
  await desktop.locator('[data-edit-watch]').click();
  await desktop.locator('#watch-settings [name=windowDays]').selectOption('60');
  await desktop.locator('#watch-settings button[type=submit]').click();
  await desktop.locator('#feedback').filter({hasText:'Perubahan tersimpan'}).waitFor();
  assert.equal(store.automation().watches[0].windowDays,60);
  await desktop.locator('#stop-all').click();
  await desktop.locator('#feedback').filter({hasText:'Perubahan tersimpan'}).waitFor();
  assert.equal(store.automation().watches[0].status,'stopped');
  await desktop.locator('[data-tab=leads]').click();
  store.automation({action:'lead-ingest',manual:true,candidate:{
    url:'https://forum.example.org/post/fixture',text:'Butuh website untuk katalog usaha.',platform:'Forum fixture',
    publishedAt:now-3600000,dateEvidence:'owner_verified',publicationProof:'Fixture original published timestamp',
  },analysis:{intent:'buyer',score:90,summary:'Website katalog <img src=x onerror=alert(1)>',category:'website',
    reason:'Butuh pengembang',comment:'Halo kak, apa kebutuhan katalog usahanya?'}});
  await desktop.locator('#refresh').click();
  await desktop.locator('.lead-entry').waitFor();
  assert.equal(await desktop.locator('.lead-entry img').count(),0);
  await desktop.locator('[data-lead-id]').selectOption('negotiating');
  await desktop.locator('#feedback').filter({hasText:'Perubahan tersimpan'}).waitFor();
  assert.equal(store.automation().leads[0].status,'negotiating');
  await desktop.screenshot({path:output+'/lead-desktop.png',fullPage:true});
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  mobile.on('pageerror',error=>errors.push(error.message));
  await mobile.request.post(origin+'/api/login',{data:{password}});
  await mobile.goto(origin+'/automation.html');
  await mobile.locator('.lead-entry').waitFor();
  await mobile.screenshot({path:output+'/lead-mobile.png',fullPage:true});
  const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false);
  await mobile.locator('[data-tab=flights]').tap();
  await mobile.screenshot({path:output+'/flight-mobile.png',fullPage:true});
  await desktop.route('**/api/automation',route=>route.abort());
  await desktop.locator('#refresh').click();
  await desktop.locator('#feedback.error').waitFor();
  await desktop.unroute('**/api/automation');
  await desktop.locator('#refresh').click();
  await desktop.locator('#feedback:not(.error)').waitFor();
  assert.deepEqual(errors,[]);
  const report={desktop:true,mobileViewport:true,rollingWithoutDate:true,reload:true,statusControls:true,
    equivalentFareChart:true,xssEscaped:true,networkRecovery:true,errors};
  await writeFile(output+'/browser-check.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  store.close();
}
