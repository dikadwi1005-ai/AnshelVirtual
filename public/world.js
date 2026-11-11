import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { doorway, entrance, point, rooms, site } from './layout.js';
import { furniture, lobbyProps, obstaclesFor, partitions, propBounds, propsFor } from './furnishings.js';
import { emission, finish, floorMaterial, objectMaterial, radialTexture } from './materials.js';

const loader = new GLTFLoader();
const assets = new Map();

export function model(path) {
  if (!assets.has(path)) assets.set(path,loader.loadAsync('/models/'+path+'.glb').then(gltf=>{
    const bounds=new THREE.Box3().setFromObject(gltf.scene);
    return {...gltf,bounds,size:bounds.getSize(new THREE.Vector3())};
  }).catch(error=>{assets.delete(path);throw error;}));
  return assets.get(path);
}

export function box(parent,size,position,material) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
  mesh.position.set(...position);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}

const flat = new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
export function flatMesh(parent,width,depth,[x,z],y,material) {
  const mesh=new THREE.Mesh(flat,material);
  mesh.scale.set(width,1,depth);
  mesh.position.set(x,y,z);
  parent.add(mesh);
  return mesh;
}

function surface(parent,width,depth,at,y,material,tileSize) {
  const mesh=flatMesh(parent,width,depth,at,y,material);
  mesh.geometry=flat.clone();
  const uv=mesh.geometry.attributes.uv;
  for(let index=0;index<uv.count;index++) uv.setXY(index,uv.getX(index)*width/tileSize,uv.getY(index)*depth/tileSize);
  mesh.receiveShadow=true;
  mesh.userData.unshared=true;
}

function architecture(parent,room) {
  surface(parent,room.width-.06,room.depth-.06,[room.x,room.z],.015,floorMaterial(room.finish,room.floor),room.finish==='oak'?2.1:2.6);
  const wall=finish('#435065');
  const trim=finish('#1d2a3a',.48,.14);
  const panel=finish(room.accent,.65);
  const glass=new THREE.MeshStandardMaterial({
    color:'#6d9bac',transparent:true,opacity:.28,roughness:.29,metalness:.05,depthWrite:false,side:THREE.DoubleSide,
  });
  for (const {box:bounds,type} of partitions(room)) {
    const [x0,z0,x1,z1]=bounds;
    const x=(x0+x1)/2, z=(z0+z1)/2, width=x1-x0, depth=z1-z0;
    const outdoor=room.id==='garden';
    const height=type==='back'?(room.outer && room.front===1?2.12:.94):type==='stall'?1.20:type==='side'?.55:.42;
    box(parent,[width,height,depth],[x,height/2,z],outdoor?trim:wall);
    box(parent,[width+.04,.065,depth+.04],[x,height+.018,z],type==='back'?panel:trim);
    if (outdoor) continue;
    if (type==='back') {
      const upper=height>.95;
      const glassFace=z+room.front*.115;
      for (const offset of [-room.width*.26,room.width*.26]) {
        if (upper) {
          const glassWidth=room.width*.37;
          box(parent,[glassWidth,.98,.04],[x+offset,1.45,glassFace],finish('#557c99',.39,.14)).castShadow=false;
          box(parent,[glassWidth,.06,.055],[x+offset,.94,glassFace+room.front*.02],panel).castShadow=false;
          box(parent,[.046,.99,.055],[x+offset,1.45,glassFace+room.front*.025],trim).castShadow=false;
        } else {
          box(parent,[room.width*.30,.28,.035],[x+offset,.56,glassFace],panel).castShadow=false;
          box(parent,[room.width*.21,.027,.052],[x+offset,.78,glassFace+room.front*.025],emission('#ffe1b7',.48)).castShadow=false;
        }
      }
    } else if (type!=='stall') {
      const pane=box(parent,[width*.94,.42,depth*.86],[x,height+.245,z],glass);
      pane.castShadow=false;
      box(parent,[width+.016,.045,depth+.02],[x,height+.468,z],trim);
    }
  }
  const [x,z]=entrance(room);
  const jamb=finish('#233145',.5,.2);
  for (const offset of [-doorway/2-.055,doorway/2+.055]) {
    box(parent,[.11,1.26,.23],[x+offset,.63,z],jamb);
    const guide=box(parent,[.045,.66,.036],[x+offset,.7,z+room.front*.124],emission(room.accent,.35));
    guide.castShadow=false;
  }
  const threshold=box(parent,[doorway,.02,.48],[x,.023,z],finish('#455367',.55,.19));
  threshold.castShadow=false;
  const strip=box(parent,[doorway*.88,.025,.047],[x,.036,z+room.front*.16],emission(room.accent,.5));
  strip.castShadow=false;
}

function screenTexture(style) {
  const canvas=document.createElement('canvas');
  canvas.width=192; canvas.height=108;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#152642';
  ctx.fillRect(0,0,192,108);
  ctx.fillStyle='#233d61';
  ctx.fillRect(0,0,192,13);
  ctx.fillStyle=style;
  ctx.fillRect(9,5,14,3);
  ctx.fillStyle='#284565';
  ctx.fillRect(10,22,45,76);
  for (let i=0;i<6;i++) {
    ctx.globalAlpha=i%3===0?.9:.48;
    ctx.fillStyle=i%3===0?style:'#6c9fcd';
    ctx.fillRect(67+(i%2)*8,25+i*8,52+(i%3)*13,2.5);
  }
  ctx.globalAlpha=1;
  ctx.fillStyle='#284565';
  ctx.fillRect(68,80,111,15);
  ctx.fillStyle=style;
  for(let i=0;i<6;i++) ctx.fillRect(74+i*15,91-(i%3)*2,8,2+(i%3)*2);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

const screens = new Map();
function decorateScreen(parent,prop,width,depth,height) {
  if (prop.type!=='monitor' && prop.type!=='tv') return;
  if (!screens.has(prop.accent)) screens.set(prop.accent,new THREE.MeshBasicMaterial({
    map:screenTexture(prop.accent),color:'#c0dcff',toneMapped:false,
  }));
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(width*.88,height*.70),screens.get(prop.accent));
  screen.position.set(0,height*.58,depth*.51);
  parent.add(screen);
}

async function placeProp(parent,prop) {
  const [name,width,depth,height]=furniture[prop.type];
  const path=name.includes('/') ? name : 'furniture/'+name;
  const {scene,bounds,size}=await model(path);
  const group=new THREE.Group();
  group.position.set(prop.at[0],prop.y+.016,prop.at[1]);
  group.rotation.y=prop.angle;
  const copy=scene.clone(true);
  const scale=new THREE.Vector3(width/size.x,height/size.y,depth/size.z);
  copy.scale.copy(scale);
  const center=bounds.getCenter(new THREE.Vector3());
  copy.position.set(-center.x*scale.x,-bounds.min.y*scale.y,-center.z*scale.z);
  copy.traverse(node=>{
    if (!node.isMesh) return;
    node.material=objectMaterial(node.material,prop);
    node.castShadow=prop.type!=='rug';
    node.receiveShadow=true;
  });
  group.add(copy);
  decorateScreen(group,prop,width,depth,height);
  parent.add(group);
}

function batchStatic(group) {
  group.updateMatrixWorld(true);
  const batches=new Map();
  group.traverse(mesh=>{
    if (!mesh.isMesh || mesh.material.transparent || Array.isArray(mesh.material)) return;
    const key=[mesh.material.id,mesh.castShadow,mesh.receiveShadow].join('|');
    if (!batches.has(key)) batches.set(key,[]);
    batches.get(key).push(mesh);
  });
  for (const meshes of batches.values()) {
    if (meshes.length<2) continue;
    const geometry=meshes.map(mesh=>{
      const copy=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      for (const key of Object.keys(copy.attributes)) if (!['position','normal','uv'].includes(key)) copy.deleteAttribute(key);
      if (!copy.hasAttribute('normal')) copy.computeVertexNormals();
      if (!copy.hasAttribute('uv')) copy.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(copy.attributes.position.count*2),2));
      return copy.applyMatrix4(mesh.matrixWorld);
    });
    const combined=mergeGeometries(geometry);
    for (const part of geometry) part.dispose();
    if (!combined) continue;
    const [sample]=meshes;
    const batch=new THREE.Mesh(combined,sample.material);
    batch.castShadow=sample.castShadow;
    batch.receiveShadow=sample.receiveShadow;
    group.add(batch);
    for (const original of meshes) {
      original.removeFromParent();
      if (original.userData.unshared) original.geometry.dispose();
    }
  }
}

function contactShadows(parent,props,map) {
  const grounded=props.filter(prop=>prop.y===0 && prop.type!=='rug');
  const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,opacity:.56,toneMapped:false});
  const instances=new THREE.InstancedMesh(flat,material,grounded.length);
  const matrix=new THREE.Object3D();
  for (const [i,prop] of grounded.entries()) {
    const [,width,depth]=furniture[prop.type];
    matrix.position.set(prop.at[0],.027,prop.at[1]);
    matrix.scale.set(width*1.55,1,depth*1.7);
    matrix.rotation.y=prop.angle;
    matrix.updateMatrix();
    instances.setMatrixAt(i,matrix.matrix);
  }
  parent.add(instances);
}

export async function buildWorld(scene,shadowTexture) {
  const core=new THREE.Group();
  scene.add(core);
  const base=box(core,[site.width+.68,.77,site.depth+.68],[0,-.405,0],finish('#131f30',.55,.18));
  base.castShadow=false;
  box(core,[site.width+.46,.084,site.depth+.46],[0,-.16,0],finish('#40546a',.45,.24)).castShadow=false;
  surface(core,site.width,site.depth,[0,0],0,floorMaterial('tile','#435469'),2.55);
  surface(core,site.width-1,2.2,[0,0],.008,floorMaterial('tile','#5a6d80'),2.8);
  for (const z of [-1.15,1.15]) {
    box(core,[site.width-1.2,.014,.038],[0,.013,z],emission('#51b7b0',.31)).castShadow=false;
  }
  const warmMap=radialTexture(true);
  const warmGlow=new THREE.MeshBasicMaterial({
    map:warmMap,transparent:true,depthWrite:false,toneMapped:false,opacity:.21,blending:THREE.AdditiveBlending,
  });
  const propLists=new Map(rooms.map(room=>[room.id,propsFor(room)]));
  const wings=new Map();
  const jobs=lobbyProps.map(prop=>placeProp(core,prop));
  for (const room of rooms) {
    if (!wings.has(room.wing)) {
      const group=new THREE.Group();
      scene.add(group);
      wings.set(room.wing,group);
    }
    const wing=wings.get(room.wing);
    architecture(wing,room);
    const props=propLists.get(room.id);
    jobs.push(...props.map(prop=>placeProp(wing,prop)));
    const at=point(room,0,-.32);
    flatMesh(core,5.2,3.9,at,.024,warmGlow);
  }
  const backdropShadow=flatMesh(core,58,49,[1.1,1.5],-.8,new THREE.MeshBasicMaterial({
    map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false,opacity:.66,
  }));
  backdropShadow.renderOrder=-1;
  const results=await Promise.allSettled(jobs);
  const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
  for (const group of wings.values()) batchStatic(group);
  batchStatic(core);
  contactShadows(core,[...propLists.values()].flat().concat(lobbyProps),shadowTexture);
  const obstacles=rooms.flatMap(room=>obstaclesFor(room,propLists.get(room.id)));
  obstacles.push(...lobbyProps.map(prop=>({box:propBounds(prop),id:prop.id})));
  return {errors,warmGlow,obstacles};
}
