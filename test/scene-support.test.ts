import test from 'node:test';
import assert from 'node:assert/strict';
import { importSceneWithRetry, loadSceneModule, lowGraphics, SceneModuleError, sceneFailureMessage } from '../public/scene-support.js';

test('HP mendapat grafis ringan otomatis, pilihan manual dihormati',()=>{
  const phone={compact:true,coarse:true,memory:6};
  assert.equal(lowGraphics(null,phone),true);
  assert.equal(lowGraphics('normal',phone),false);
  assert.equal(lowGraphics('low',{compact:false,coarse:false,memory:8}),true);
  assert.equal(lowGraphics(null,{compact:false,coarse:false,memory:8}),false);
  assert.equal(lowGraphics(null,{compact:false,coarse:false,memory:4}),true);
});

test('kesalahan pemuatan model tidak salah dilaporkan sebagai WebGL 2',()=>{
  const error=new Error('Model 3D gagal diunduh');
  assert.match(sceneFailureMessage(error),/Model 3D gagal diunduh/);
  assert.doesNotMatch(sceneFailureMessage(error),/WebGL 2/);
  assert.match(sceneFailureMessage(new Error('Error creating WebGL context')),/Konteks grafis 3D gagal dibuat/);
});

test('impor kantor 3D diulang dengan URL baru saat unduhan awal gagal',async()=>{
  const paths=[];
  const importer=async path=>{
    paths.push(path);
    if (paths.length===1) throw new Error('Jaringan putus sementara');
    return {officeScene:'ready'};
  };
  const original=console.warn;
  console.warn=()=>{};
  try {
    assert.deepEqual(await importSceneWithRetry(importer,()=>123),{officeScene:'ready'});
    assert.deepEqual(paths,['./scene.bundle.js','./scene.bundle.js?retry=123']);
  } finally { console.warn=original; }
});

test('entry baru membedakan kegagalan unduh dan modul versi tidak cocok',async()=>{
  const network=new TypeError('Failed to fetch dynamically imported module: /assets/scene-OLDHASH.js');
  await assert.rejects(loadSceneModule(async()=>{throw network;}),error=>{
    assert.ok(error instanceof SceneModuleError);
    assert.equal(error.cause,network);
    assert.match(sceneFailureMessage(error),/scene-OLDHASH\.js/);
    return true;
  });
  await assert.rejects(loadSceneModule(async()=>({officeScene:undefined})),{
    message:/Versi modul tidak cocok/,
  });
  const officeScene=()=>{};
  assert.equal(await loadSceneModule(async()=>({officeScene})),officeScene);
});
