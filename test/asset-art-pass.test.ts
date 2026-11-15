import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {divisions} from '../public/catalog.js';
import {houseDoor,homes} from '../public/layout.js';
import {homeFacadeDetails,homeVisualStyle,homeVisualStyles} from '../public/home-styles.js';
import {fittedModel} from '../public/district-models.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`Expected ${actual} ≈ ${expected}`);
function assetFixture() {
  const scene=new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(2,1,6),new THREE.MeshStandardMaterial()));
  const bounds=new THREE.Box3().setFromObject(scene);
  return {scene,bounds,size:bounds.getSize(new THREE.Vector3())};
}
function boxOf(model) {
  const bounds=new THREE.Box3().setFromObject(model);
  return {size:bounds.getSize(new THREE.Vector3()),min:bounds.min};
}

test('traffic models fit the allowed vehicle envelope without altering physical aspect ratios',()=>{
  const asset=assetFixture();
  const sized=fittedModel(asset,[1.9,1.44,4.1],{fit:'contain'});
  const result=boxOf(sized);
  const source=asset.size;
  close(result.size.x/source.x,result.size.y/source.y);
  close(result.size.y/source.y,result.size.z/source.z);
  assert.ok(result.size.x<=1.9+1e-5 && result.size.y<=1.44+1e-5 && result.size.z<=4.1+1e-5);
  close(result.min.y,0);
  // House facades retain exact target footprint and legacy collision alignment.
  const building=boxOf(fittedModel(asset,[8.2,4.7,8.3]));
  close(building.size.x,8.2);
  close(building.size.y,4.7);
  close(building.size.z,8.3);
  assert.throws(()=>fittedModel(asset,[0,2,3],{fit:'contain'}),RangeError);
  assert.throws(()=>fittedModel(asset,[1,2,3],{fit:'grow'}),RangeError);
});

test('each of 12 staff homes has a stable style and decorative details outside the doorway',()=>{
  assert.equal(homes.length,12);
  assert.deepEqual(Object.keys(homeVisualStyles).sort(),divisions.map(p=>p.id).sort());
  const identities=new Set();
  for(const home of homes) {
    const style=homeVisualStyle(home.person.id);
    assert.match(style.facade,/^#[0-9a-f]{6}$/i);
    assert.match(style.trim,/^#[0-9a-f]{6}$/i);
    assert.match(style.accent,/^#[0-9a-f]{6}$/i);
    identities.add(style.facade);
    const details=homeFacadeDetails(home);
    assert.equal(details.length,3+style.mark);
    for(const item of details) {
      assert.ok(Number.isFinite(item.u) && Number.isFinite(item.y) && Number.isFinite(item.v));
      assert.ok(Math.abs(item.u)+item.w/2<=home.width/2+.01);
      assert.ok(item.y-item.h/2>=0);
      assert.ok(item.v>home.depth/2,'decorations must sit in front of the facade');
      const insideDoor=Math.abs(item.u-home.doorOffset)<houseDoor.width/2+item.w/2;
      if(insideDoor) assert.ok(item.y-item.h/2>houseDoor.height,'no doorway blockage');
    }
    assert.deepEqual(homeFacadeDetails(home),details,'styles are deterministic across sessions');
  }
  assert.equal(identities.size,12);
  assert.throws(()=>homeVisualStyle('unknown'),/Unknown employee/);
});
