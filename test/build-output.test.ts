import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { officeServer } from '../server/http.ts';
import { createStore } from '../server/store.ts';

test('output deploy menyajikan graph ESM yang konsisten dan memberi 404 untuk hash lama',async()=>{
  const config=JSON.parse(await readFile('vercel.json','utf8'));
  assert.equal(config.outputDirectory,'.vercel-public');
  assert.equal(config.buildCommand,'npm run build');
  await access('.vercel-public/index.html').catch(()=>
    promisify(execFile)(process.execPath,['scripts/prepare-public.ts']));
  const store=createStore(':memory:');
  const server=officeServer(store,{});
  try {
    await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
    const base='http://127.0.0.1:'+server.address().port;
    const page=await fetch(base+'/');
    assert.equal(page.headers.get('cache-control'),'no-store');
    const html=await page.text();
    assert.doesNotMatch(html,/importmap/);
    const entry=html.match(/src="(\/assets\/app-[A-Z0-9]+\.js)"/)?.[1];
    assert.ok(entry);
    async function module(path,immutable=false) {
      const response=await fetch(base+path);
      assert.equal(response.status,200,path);
      assert.match(response.headers.get('content-type'),/javascript/,path);
      assert.equal(response.headers.get('cache-control'),immutable?'public, max-age=31536000, immutable':'no-store');
      const content=await response.text();
      assert.doesNotMatch(content,/^<!doctype/i,path);
      return content;
    }
    const app=await module(entry,true);
    const scene=app.match(/\.\/scene-([A-Z0-9]+)\.js/)?.[0];
    assert.ok(scene);
    const scenePath='/assets/'+scene.slice(2);
    const bundle=await module(scenePath,true);
    const shared=new Set([...`${app}\n${bundle}`.matchAll(/\.\/(chunk-[A-Z0-9]+\.js)/g)].map(match=>match[1]));
    assert.ok(shared.size);
    for (const chunk of shared) await module('/assets/'+chunk,true);
    assert.match(await module('/app.js'),new RegExp(entry));
    for (const alias of ['/scene.js','/scene.bundle.js?retry=123']) {
      assert.match(await module(alias),new RegExp(scenePath));
    }
    assert.match(await module('/lib/three/build/three.module.js'),/\.\/three\.core\.js/);
    await module('/lib/three/build/three.core.js');
    const stale=await fetch(base+'/assets/scene-STALE000.js');
    assert.equal(stale.status,404);
    assert.match(stale.headers.get('content-type'),/application\/json/);
  } finally {
    if (server.listening) await new Promise(resolve=>server.close(resolve));
    store.close();
  }
});
