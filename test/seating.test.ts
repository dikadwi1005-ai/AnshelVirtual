import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Box3, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { divisions } from '../public/catalog.js';
import { employeeProfile } from '../public/employee-profiles.js';
import { activityAnchors, obstaclesFor } from '../public/furnishings.js';
import { rooms } from '../public/layout.js';
import { navigation } from '../public/navigation.js';
import { createSeatRig } from '../public/seat-pose.js';

test('setiap rig menjaga telapak di lantai dan pinggul di bantalan saat duduk',async()=>{
  const loader=new GLTFLoader().register(()=>({name:'test-texture',loadTexture:()=>Promise.resolve(new Texture())}));
  const assets=new Map();
  const nav=navigation(rooms.flatMap(room=>obstaclesFor(room)));
  const v=new Vector3();
  for (const person of divisions) {
    const profile=employeeProfile(person.id);
    if (!assets.has(profile.asset)) {
      const bytes=await readFile('public/models/people/character-'+profile.asset+'.glb');
      const model=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
      assets.set(profile.asset,model.scene);
    }
    const figure=clone(assets.get(profile.asset));
    figure.scale.setScalar(profile.stature/new Box3().setFromObject(figure).getSize(v).y);
    const rig=createSeatRig(figure);
    const body=figure.getObjectByName('body-mesh');
    const {position,skinIndex}=body.geometry.attributes;
    const feet:number[]=[], hips:number[]=[];
    for (let i=0;i<position.count;i++) {
      const bone=body.skeleton.bones[skinIndex.getX(i)];
      if (!bone.name.startsWith('leg-')) continue;
      if (position.getY(i)<.001) feet.push(i);
      if (position.getY(i)>.153 && position.getZ(i)<-.042) hips.push(i);
    }
    for (const activity of ['desk','meeting','rest','tv']) {
      for (const anchor of activityAnchors(person,activity)) {
        const height=anchor.height-(anchor.rug ? .016 : 0);
        const fit=rig.fit(height);
        const label=person.id+' / '+anchor.id;
        assert.ok(fit,label);
        const point=(forward:number)=>[anchor.point[0]+Math.sin(anchor.angle)*forward,
          anchor.point[1]+Math.cos(anchor.angle)*forward];
        const stand=point(rig.standingOffset(fit));
        assert.ok(nav.clear(anchor.approach,stand,anchor.support,.075),label);
        assert.ok(nav.clear(stand,point(-fit.hipDepth),anchor.support,.075),label);
        let depth:number|undefined;
        for (const progress of [0,.18,.41,.66,.87,1]) {
          const {rise,forward}=rig.apply(fit,progress);
          figure.updateMatrixWorld(true);
          const coords=(i:number)=>body.getVertexPosition(i,v).applyMatrix4(body.matrixWorld);
          const sole=feet.map(i=>coords(i).y+rise);
          assert.ok(sole.every(y=>Math.abs(y)<.006),label+' / telapak '+progress);
          const footDepth=feet.reduce((sum,i)=>sum+coords(i).z,0)/feet.length+forward;
          depth??=footDepth;
          assert.ok(Math.abs(depth-footDepth)<.006,label+' / geseran '+progress);
          if (progress===1) {
            const contact=hips.map(i=>coords(i).y+rise);
            assert.ok(Math.abs(Math.min(...contact)-height)<.006,label+' / bantalan');
          }
        }
      }
    }
  }
});
