import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { point, roomById } from './layout.js';

const shell=new THREE.MeshStandardMaterial({color:'#e0e8ed',roughness:.45});
const dark=new THREE.MeshStandardMaterial({color:'#131d31',roughness:.52});
const buttons=new THREE.MeshStandardMaterial({color:'#496078',roughness:.49});
const cyan=new THREE.MeshStandardMaterial({color:'#56dded',emissive:'#1db6ed',emissiveIntensity:1.25,roughness:.4});

function piece(group,size,position,material,radius=.015) {
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,2,radius),material);
  mesh.position.set(...position);
  mesh.castShadow=true;
  group.add(mesh);
  return mesh;
}

export function gamepad() {
  const group=new THREE.Group();
  piece(group,[.54,.080,.205],[0,0,0],shell,.039);
  piece(group,[.25,.086,.171],[0,.002,-.013],dark,.028);
  for (const side of [-1,1]) {
    piece(group,[.165,.089,.24],[side*.194,-.009,-.056],shell,.039).rotation.y=-side*.23;
    piece(group,[.056,.038,.056],[side*.082,.050,-.035],buttons,.017);
    piece(group,[.12,.026,.044],[side*.172,.017,.108],dark);
  }
  piece(group,[.076,.017,.020],[-.174,.045,.024],dark,.008);
  piece(group,[.020,.017,.076],[-.174,.045,.024],dark,.008);
  for (const [x,z] of [[.174,.055],[.205,.024],[.174,-.007],[.143,.024]]) {
    piece(group,[.025,.017,.025],[x,.045,z],buttons,.008);
  }
  piece(group,[.081,.009,.014],[0,.052,.043],cyan,.004);
  group.traverse(object=>{ if (object.isMesh) object.castShadow=false; });
  return group;
}

function consoleModel() {
  const group=new THREE.Group();
  piece(group,[.245,.028,.340],[0,.014,0],dark,.014);
  piece(group,[.152,.454,.252],[0,.25,0],dark,.030);
  for (const side of [-1,1]) {
    piece(group,[.038,.501,.298],[side*.086,.271,0],shell,.019).rotation.z=-side*.075;
    piece(group,[.014,.405,.015],[side*.065,.274,.119],cyan,.006);
  }
  piece(group,[.041,.009,.010],[.015,.17,.129],buttons,.004);
  return group;
}

export function addLounge(parent) {
  const room=roomById.gaming;
  const place=(group,x,y,depth,angle)=>{
    const [worldX,worldZ]=point(room,x,depth);
    group.position.set(worldX,y+.016,worldZ);
    group.rotation.y=angle;
    parent.add(group);
    return group;
  };
  place(consoleModel(),.87,.55,-1.24,Math.PI/2);
  const dock=[.69,1.30].map((x,i)=>place(gamepad(),x,.51,-2.20,(i-.5)*.36));
  const fixture=new THREE.Group();
  piece(fixture,[1.48,.023,.023],[0,0,0],cyan,.009);
  place(fixture,1.10,.19,-.62,Math.PI/2);
  const art=new THREE.Group();
  piece(art,[1.34,.50,.047],[0,0,0],dark,.022);
  const stripes=[[-.43,.14,shell],[-.13,.32,cyan],[.17,.48,shell],[.47,.64,buttons]];
  for (const [x,angle,material] of stripes) {
    piece(art,[.11,.29,.015],[x,0,.027],material,.007).rotation.z=angle;
  }
  place(art,-.50,.48,3.28,0);
  const light=new THREE.PointLight('#779cff',1.35,3.5,2);
  place(light,.94,1.22,-.62,0);
  return active=>dock.forEach((pad,index)=>{pad.visible=!active.has(index);});
}
