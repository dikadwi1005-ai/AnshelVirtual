import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  avatarAnimationInterval,settleCarriedProp,releaseCarriedProp,speechGesture,deskGesture,
} from '../public/actor-motion.js';
import {divisions} from '../public/catalog.js';

test('12 employee gesture variants are deterministic, with seated voices distinct from standing',()=>{
  assert.equal(divisions.length,12);
  const standing=new Set(),seated=new Set(),desks=new Set();
  for(const [index] of divisions.entries()) {
    standing.add(speechGesture(index,false));
    seated.add(speechGesture(index,true));
    desks.add(deskGesture(index,false));
    assert.equal(speechGesture(index,false),speechGesture(index,false));
    assert.equal(deskGesture(index,true),'desk-work','active task remains focused');
  }
  assert.deepEqual([...standing].sort(),['speak','speak-explain','speak-soft'].sort());
  assert.deepEqual([...seated].sort(),['seated-speak','seated-speak-explain'].sort());
  assert.deepEqual([...desks].sort(),['desk-review','desk-work'].sort());
});

test('locomotion and carried-object gestures get more samples than idle distant avatars',()=>{
  assert.equal(avatarAnimationInterval('walking','walk'),1/30);
  assert.equal(avatarAnimationInterval('sitting','sit'),1/30);
  assert.equal(avatarAnimationInterval('departing','idle'),1/30);
  assert.equal(avatarAnimationInterval('seated','speak-explain'),1/24);
  assert.equal(avatarAnimationInterval('seated','phone'),1/24);
  assert.equal(avatarAnimationInterval('seated','idle'),1/15);
  assert.equal(avatarAnimationInterval('seated','idle',true),1/30);
});

test('hand-held props snap once, smoothly follow thereafter and reset on hide',()=>{
  const prop=new THREE.Object3D();
  const target=new THREE.Vector3(2,.7,-1);
  assert.equal(settleCarriedProp(prop,target,.02),true);
  assert.deepEqual(prop.position.toArray(),target.toArray());
  target.x=3;
  assert.equal(settleCarriedProp(prop,target,.016),true);
  assert.ok(prop.position.x>2 && prop.position.x<3,'small pose blend prevents popping');
  assert.equal(settleCarriedProp(prop,target,0),true);
  assert.equal(prop.position.x,3,'replay frames remain deterministic');
  releaseCarriedProp(prop);
  assert.equal(prop.userData.gripSettled,false);
  assert.equal(settleCarriedProp(prop,new THREE.Vector3(-2,1,0),.033),true);
  assert.equal(prop.position.x,-2,'first visible frame attaches immediately');
  assert.equal(settleCarriedProp(prop,new THREE.Vector3(NaN,0,0),.033),false);
  assert.equal(prop.position.x,-2,'bad rig values cannot move the prop');
});
