import * as THREE from 'three';
import { fenceRuns, gate, outdoorSeats, planterBoxes } from './layout.js';
const treeSites=[[-29,-22,2],[-28,-18,1.4],[28,-15,2.2],[29,-8,1.3],[-29,11,2.5],[-28,14,1.65],
  [18,-25,2.3],[23,-25,1.5],[-22,25.5,2],[-16,25.5,1.65],[22,25,1.8],[28,25,2.1]];

export function addOutdoors(scene) {
  const boxes=new Map(), halos=[];
  const material=new THREE.MeshStandardMaterial({roughness:.88});
  const cube=new THREE.BoxGeometry(), crown=new THREE.IcosahedronGeometry(1,1);
  function piece(color,x,y,z,w,h,d,angle=0,geometry=cube) {
    if (!boxes.has(geometry)) boxes.set(geometry,[]);
    boxes.get(geometry).push({color,x,y,z,w,h,d,angle});
  }
  const terrain=new THREE.BoxGeometry();
  const ground=(color,x,z,w,d,y=-.015)=>piece(color,x,y-.035,z,w,.07,d,0,terrain);
  ground('#596c5b',0,0,178,175,-.09);
  ground('#657e51',0,0,68,58,-.025);
  ground('#384554',0,36,176,10);
  ground('#a1a498',0,31.1,155,1.65);
  ground('#87928b',gate.walkway,25.7,2.65,14.5);
  ground('#474f59',gate.vehicle,27.3,7.0,11.7);
  ground('#474f59',13.4,24.2,16.8,4.7);
  ground('#8b9386',-15.4,23.0,11.4,2.6);
  ground('#969b8d',-10.1,22.2,13,1.45);
  ground('#7c8981',-25.4,1,1.5,44);
  ground('#7c8981',25.4,-1,1.5,44);
  ground('#829184',0,-22.7,50,1.5);
  for(let x=-72;x<76;x+=6) ground('#c8a464',x,36,2.5,.105,.034);
  for(let x=14;x<21;x+=2.6) ground('#bbbbb0',x,24.6,.065,3.45,.034);
  for(let x=5.45;x<12;x+=.65) ground('#dbddce',x,30.3,.25,1.45,.028);
  for(const [x1,z1,x2,z2] of planterBoxes) {
    ground('#3b5140',(x1+x2)/2,(z1+z2)/2,x2-x1,z2-z1,.022);
    for(let i=0;i<6;i++) {
      const t=(i+.5)/6;
      piece(i%2?'#798b52':'#54734a',x1+(x2-x1)*t,.26,z1+.65+Math.sin(i*2)*.29,.40,.30,.38,i,crown);
    }
  }
  for(const [x,z,s] of treeSites) {
    piece('#5e4836',x,s*.55,z,.25,s*1.1,.25);
    piece('#58784d',x,s*1.25,z,s*.51,s*.63,s*.48,x,crown);
    piece('#728b55',x+s*.16,s*1.62,z-.22,s*.39,s*.48,s*.41,z,crown);
  }
  for(const [x,z,w,d,angle] of [[-49,-35,18,8,.15],[39,-46,26,12,-.14],[-44,19,8,15,.12],
    [47,16,12,22,-.15],[-29,46,18,8,-.08],[31,49,27,10,.13]]) {
    piece('#657b5c',x,-.66,z,w,1.15,d,angle,crown);
    for(let i=0;i<3;i++) {
      const tx=x+(i-1)*w*.42,tz=z+Math.sin(x+i*4)*d*.42,h=1.8+(i%2)*.6;
      piece('#566e58',tx,h*.6,tz,h*.65,h,h*.5,angle+i,crown);
    }
  }
  for(const [x,z,tx,tz] of fenceRuns) {
    const length=Math.hypot(tx-x,tz-z), angle=-Math.atan2(tz-z,tx-x);
    const midX=(tx+x)/2,midZ=(tz+z)/2;
    piece('#748078',midX,.16,midZ,length,.32,.31,angle);
    for(const y of [.52,1.12]) piece('#273b40',midX,y,midZ,length,.07,.11,angle);
    const count=Math.ceil(length/.52);
    for(let i=0;i<=count;i++) {
      const post=i===0 || i===count || i%8===0;
      piece(post?'#40565b':'#30464a',x+(tx-x)*i/count,.76,z+(tz-z)*i/count,post?.24:.055,post?1.58:1.12,post?.24:.065);
    }
  }
  for(const x of [-3.3,-.3,4.9,12.1]) piece('#526c66',x,1.37,gate.z,.32,2.74,.43);
  piece('#273b40',8.5,2.66,gate.z,7.4,.29,.43);
  for(const [x,z] of outdoorSeats) {
    piece('#8b654d',x,.43,z,1.57,.15,.53);
    piece('#8b654d',x,.72,z+.23,1.57,.41,.075);
    for(const leg of [-.56,.56]) piece('#263d42',x+leg,.22,z,.095,.44,.43);
  }
  for(const [x,z,h] of [[-4.5,26,2.8],[2.7,25.8,2.8],[12.8,26.8,3.7],[-21,22.7,2.6],[-26,-8,2.6],[26,5,2.6],
    [-14,-23.8,2.6],[15,-23.8,2.6],[22,29.8,3.7]]) {
    piece('#293d40',x,h/2,z,.10,h,.10);
    piece('#344c4e',x,h,z,.43,.14,.43);
    halos.push([x,h-.09,z]);
  }
  const object=new THREE.Object3D(), tint=new THREE.Color();
  for(const [geometry,instances] of boxes) {
    const group=new THREE.InstancedMesh(geometry,material,instances.length);
    instances.forEach(({color,x,y,z,w,h,d,angle},index)=>{
      object.position.set(x,y,z); object.scale.set(w,h,d); object.rotation.y=angle; object.updateMatrix();
      group.setMatrixAt(index,object.matrix); group.setColorAt(index,tint.set(color));
    });
    group.receiveShadow=true;
    group.castShadow=geometry===crown;
    group.computeBoundingSphere();
    scene.add(group);
  }
  const bulb=new THREE.MeshBasicMaterial({color:'#ffdc9d'});
  const lamps=new THREE.InstancedMesh(cube,bulb,halos.length);
  halos.forEach(([x,y,z],index)=>{
    object.position.set(x,y,z); object.scale.set(.32,.07,.32); object.rotation.y=0; object.updateMatrix();
    lamps.setMatrixAt(index,object.matrix);
  });
  scene.add(lamps);
  const sign=document.createElement('canvas');
  sign.width=768; sign.height=100;
  const ink=sign.getContext('2d');
  ink.fillStyle='#233738'; ink.fillRect(0,0,768,100);
  ink.fillStyle='#8bd7bf'; ink.fillRect(25,23,8,54);
  ink.fillStyle='#f2f6ee'; ink.font='bold 43px sans-serif'; ink.textBaseline='middle';
  ink.fillText('ANSHEL VIRTUAL TECH',56,53);
  const texture=new THREE.CanvasTexture(sign);
  texture.colorSpace=THREE.SRGBColorSpace;
  const board=new THREE.Mesh(new THREE.PlaneGeometry(6.6,.86),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
  board.position.set(gate.vehicle,3.03,gate.z);
  scene.add(board);
  return {
    lighting(night) { bulb.color.set('#dbcdb1').lerp(tint.set('#ffb35f'),night); },
    dispose() { for(const asset of [cube,terrain,crown,material,bulb,texture,board.geometry,board.material]) asset.dispose(); },
  };
}
