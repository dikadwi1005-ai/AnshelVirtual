import test from 'node:test';
import assert from 'node:assert/strict';
import { lowGraphics, sceneFailureMessage } from '../public/scene-support.js';

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
