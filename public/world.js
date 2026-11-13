import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { doorway, entrance, footprint, point, roomOutline, rooms } from './layout.js';
import { createDisplays } from './displays.js';
import { furniture, obstaclesFor, partitions, propsFor } from './furnishings.js';
import { addLounge } from './lounge.js';
import { layoutItems } from './layout-editor.js';
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

function outlineShape(outline) {
  return new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z)));
}

function paving(parent,outline,y,material,tileSize) {
  const geometry=new THREE.ShapeGeometry(outlineShape(outline)).rotateX(-Math.PI/2);
  const {position,uv}=geometry.attributes;
  for (let i=0;i<uv.count;i++) uv.setXY(i,position.getX(i)/tileSize,position.getZ(i)/tileSize);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.y=y;
  mesh.receiveShadow=true;
  mesh.userData.unshared=true;
  parent.add(mesh);
}

function walkway(parent,points,width) {
  const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,0,z)));
  const sides=[[],[]];
  for (let i=0;i<=36;i++) {
    const t=i/36, {x,z}=curve.getPoint(t), tangent=curve.getTangent(t);
    sides[0].push([x+tangent.z*width/2,z-tangent.x*width/2]);
    sides[1].push([x-tangent.z*width/2,z+tangent.x*width/2]);
  }
  paving(parent,sides[0].concat(sides[1].reverse()),.007,floorMaterial('tile','#9096a0'),2.7);
}

const glass=new THREE.MeshStandardMaterial({
  color:'#b0d5d6',transparent:true,opacity:.27,roughness:.22,metalness:.08,depthWrite:false,side:THREE.DoubleSide,
});

function architecture(parent,room) {
  if (room.style==='hub') paving(parent,roomOutline(room,.01),.012,finish('#536f68'),3);
  paving(parent,roomOutline(room),.016,
    floorMaterial(room.finish,room.floor),room.finish==='oak'?2.1:2.6);

  const wall=finish(room.wall ?? '#b4b8b5');
  const trim=finish('#354551',.52,.12);
  const panel=finish(room.accent,.65);
  for (const {box:bounds,type} of partitions(room)) {
    const [x0,z0,x1,z1]=bounds;
    const x=(x0+x1)/2, z=(z0+z1)/2, width=x1-x0, depth=z1-z0;
    const glazed=room.style==='pod' || (type==='back' && room.daylight);
    const baseHeight=type==='back'?.82:.50;
    let height=glazed?(type==='back'?.55:.26):baseHeight;
    if (room.style==='service') height=type==='stall'?1.16:.92;
    box(parent,[width,height,depth],[x,height/2,z],room.style==='garden'?trim:wall);
    box(parent,[width+.035,.054,depth+.035],[x,height+.017,z],type==='back'?panel:trim);
    if (!glazed) continue;
    const glassHeight=type==='back' && room.daylight?1.24:1.01;
    const axis=width>depth ? 'x' : 'z';
    const long=axis==='x'?width:depth;
    const pane=box(parent,axis==='x'?[width-.045,glassHeight,.038]:[.038,glassHeight,depth-.045],
      [x,height+glassHeight/2,z],glass);
    pane.castShadow=false;
    box(parent,[width+.032,.064,depth+.032],[x,height+glassHeight,z],trim);
    for (const offset of [-long/2+.04,0,long/2-.04]) {
      box(parent,[.065,glassHeight,.065],
        [x+(axis==='x'?offset:0),height+glassHeight/2,z+(axis==='z'?offset:0)],trim);
    }
    if (type==='back') {
      const fixture=box(parent,[width*.78,.045,.063],[x,height+.08,z+room.front*.12],emission('#f7ddba',.37));
      fixture.castShadow=false;
    }
  }

  if (room.style!=='pod' && room.style!=='service') return;
  const [x,z]=entrance(room);
  for (const offset of [-doorway/2-.055,doorway/2+.055]) {
    box(parent,[.11,1.32,.23],[x+offset,.66,z],trim);
  }
  box(parent,[doorway,.018,.43],[x,.026,z],panel).castShadow=false;
}
async function placeProp(parent,prop,room,displays) {
  const [name,...dimensions]=furniture[prop.type];
  const [width,depth,height]=prop.size ?? dimensions;
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
    if (displays.attach(node,node.material,prop,room)) {
      node.userData.displaySurface=true;
      return;
    }
    node.material=objectMaterial(node.material,prop);
    node.castShadow=prop.type!=='rug';
    node.receiveShadow=true;
  });
  group.add(copy);
  parent.add(group);
  return group;
}

function batchStatic(group) {
  group.updateMatrixWorld(true);
  const batches=new Map();
  group.traverse(mesh=>{
    if (!mesh.isMesh || mesh.userData.displaySurface || mesh.material.transparent || Array.isArray(mesh.material)) return;
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
  const set=(i,prop)=>{
    const [width,depth]=prop.size ?? furniture[prop.type].slice(1);
    matrix.position.set(prop.at[0],.027,prop.at[1]);
    matrix.scale.set(width*1.55,1,depth*1.7);
    matrix.rotation.y=prop.angle;
    matrix.updateMatrix();
    instances.setMatrixAt(i,matrix.matrix);
    instances.instanceMatrix.needsUpdate=true;
  };
  for (const [i,prop] of grounded.entries()) set(i,prop);
  instances.computeBoundingSphere();
  parent.add(instances);
  return (original,next)=>set(grounded.indexOf(original),next);
}

export async function buildWorld(scene,shadowTexture) {
  const displays=createDisplays();
  const core=new THREE.Group();
  scene.add(core);
  const baseGeometry=new THREE.ExtrudeGeometry(outlineShape(footprint),{
    depth:.62,bevelEnabled:false,steps:1,
  }).rotateX(-Math.PI/2);
  const base=new THREE.Mesh(baseGeometry,finish('#505957',.72));
  base.position.y=-.63;
  core.add(base);
  paving(core,footprint,0,floorMaterial('tile','#707b88'),2.9);
  walkway(core,[[0,21.1],[-1.45,16],[-1.8,11],[-2.2,7],[-.5,3],[2.9,-1],[5.7,-5.5],[6.6,-11.2]],2.15);
  walkway(core,[[-15.7,8],[-14.8,4],[-13.6,-.6],[-8.3,-3.4],[-4.8,-2.8],[-1.5,.4]],1.7);
  const warmMap=radialTexture(true);
  const warmGlow=new THREE.MeshBasicMaterial({
    map:warmMap,transparent:true,depthWrite:false,toneMapped:false,opacity:.21,blending:THREE.AdditiveBlending,
  });
  const propLists=new Map(rooms.map(room=>[room.id,propsFor(room)]));
  const furnitureGroups=new Map(), movable=new THREE.Group();
  const editable=new Set(layoutItems.map(item=>item.id));
  scene.add(movable);
  const wings=new Map();
  const jobs=[];
  for (const room of rooms) {
    if (!wings.has(room.wing)) {
      const group=new THREE.Group();
      group.name=room.wing;
      scene.add(group);
      wings.set(room.wing,group);
    }
    const wing=wings.get(room.wing);
    architecture(wing,room);
    const props=propLists.get(room.id);
    jobs.push(...props.map(async (prop,index)=>{
      const id=room.id+':'+index;
      const canMove=editable.has(id);
      const group=await placeProp(canMove?movable:wing,prop,room,displays);
      if (canMove) furnitureGroups.set(id,{group,prop});
    }));
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
  const moveShadow=contactShadows(core,[...propLists.values()].flat(),shadowTexture);
  const obstacles=rooms.flatMap(room=>obstaclesFor(room,propLists.get(room.id)));
  return {errors,warmGlow,obstacles,displays,showDockedControllers:addLounge(scene),
    pickFurniture(ray) {
      const hit=ray.intersectObjects(movable.children,true)[0];
      if (!hit || ray.intersectObjects(scene.children,true).some(other=>
        other.distance<hit.distance-.01 && other.object.material?.transparent===false)) return null;
      let group=hit.object;
      while (group.parent && group.parent!==movable) group=group.parent;
      return [...furnitureGroups].find(([,entry])=>entry.group===group)?.[0] ?? null;
    },
    layout(changes) {
      for (const [id,{group,prop}] of furnitureGroups) {
        const next=changes.get(id) ?? prop;
        group.position.set(next.at[0],next.y+.016,next.at[1]);
        group.rotation.y=next.angle;
        moveShadow(prop,next);
      }
    }};
}
