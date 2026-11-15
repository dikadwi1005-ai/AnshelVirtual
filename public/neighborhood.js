import * as THREE from 'three';
import { districtServices, houseDoor, houseFronts, homes, officeEnvelope } from './layout.js';
import { batchDistrictModels, openHouseFacade } from './district-models.js';
import { homeVisualStyle, homeFacadeDetails, homeInteriorArt } from './home-styles.js';

function modelParts(parent) {
  const groups=new Map();
  const geometries={
    box:new THREE.BoxGeometry(),
    roof:new THREE.CylinderGeometry(1,1,1,3,1).rotateY(Math.PI/6).rotateX(Math.PI/2),
    tile:new THREE.CylinderGeometry(1,1,1,12),
  };
  const solid=new THREE.MeshStandardMaterial({roughness:.78});
  const glass=new THREE.MeshStandardMaterial({color:'#89c3cb',roughness:.2,metalness:.18,transparent:true,opacity:.66});
  const glow=new THREE.MeshStandardMaterial({color:'#f7dfa6',emissive:'#ffbe74',emissiveIntensity:.33});
  function add(color,x,y,z,w,h,d,angle=0,shape='box',finish='solid') {
    const key=shape+':'+finish;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push({color,x,y,z,w,h,d,angle});
  }
  function build() {
    const temp=new THREE.Object3D(), tint=new THREE.Color();
    for (const [key,items] of groups) {
      const [shape,finish]=key.split(':');
      const mesh=new THREE.InstancedMesh(geometries[shape],{solid,glass,glow}[finish],items.length);
      items.forEach((part,i)=>{
        temp.position.set(part.x,part.y,part.z); temp.scale.set(part.w,part.h,part.d);
        temp.rotation.y=part.angle; temp.updateMatrix();
        mesh.setMatrixAt(i,temp.matrix); mesh.setColorAt(i,tint.set(part.color));
      });
      mesh.castShadow=finish==='solid'; mesh.receiveShadow=true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
  }
  return {add,build};
}

export async function addBuildings(scene,loadModel) {
  const exterior=new THREE.Group(), interior=new THREE.Group(), streets=new THREE.Group();
  exterior.name='Atap dan fasad'; interior.name='Interior rumah';
  scene.add(exterior,interior,streets);
  const shell=modelParts(exterior), rooms=modelParts(interior), paths=modelParts(streets);
  const importedExterior=new THREE.Group(), importedInterior=new THREE.Group(), homeShell=new THREE.Group();
  const services=new THREE.Group();
  streets.add(services);
  exterior.add(homeShell,importedExterior);
  interior.add(importedInterior);
  const homeParts=modelParts(homeShell);
  const assets=new Map(), fallbackInterior=new THREE.Group();
  interior.add(fallbackInterior);
  const fallback=modelParts(fallbackInterior);
  function placeModel(parent,name,position,size,angle=0,tint,opening) {
    if (!assets.has(name)) assets.set(name,new Map());
    const sets=assets.get(name);
    if (!sets.has(parent)) sets.set(parent,[]);
    sets.get(parent).push({position,size,angle,tint,opening});
  }
  const [plaster,bronze,steel]=['#e5d8bc','#936746','#253e48'];
  function window(x,z,y,width,angle) {
    for(const dy of [-.66,.66]) shell.add(steel,x,y+dy,z,width+.16,.09,.15,angle);
    for(const dx of [-width/2,width/2])
      shell.add(steel,x+dx*Math.cos(angle),y,z-dx*Math.sin(angle),.09,1.41,.15,angle);
    shell.add('#bfd9d4',x,y,z,width,1.25,.07,angle,'box','glass');
    shell.add(steel,x,y,z,.06,1.23,.2,angle);
  }
  for (const {box:[l,t,r,b]} of officeEnvelope) {
    const x=(l+r)/2,z=(t+b)/2,long=r-l>b-t;
    const width=long?r-l:b-t, angle=long?0:Math.PI/2;
    shell.add(plaster,x,.47,z,width,.94,.38,angle);
    shell.add(plaster,x,2.96,z,width,1.06,.38,angle);
    const bays=Math.max(1,Math.round(width/3));
    for(let i=0;i<bays;i++) {
      const offset=-width/2+(i+.5)*width/bays;
      const wx=x+Math.cos(angle)*offset,wz=z+Math.sin(angle)*offset;
      window(wx,wz,1.68,width/bays-.67,angle);
      const pillar=offset-width/bays/2;
      shell.add(plaster,x+Math.cos(angle)*pillar,1.72,z+Math.sin(angle)*pillar,.55,3.44,.48,angle);
    }
  }
  // Continuous roof plate with parapets, internal skylight and screened services.
  shell.add('#44565d',0,3.56,0,50.5,.29,44.15);
  shell.add('#a07254',0,3.83,0,50.7,.15,44.32);
  shell.add('#53686f',0,3.94,0,49.9,.12,43.55);
  for(const z of [-21.8,21.8]) shell.add('#31454a',0,4.06,z,50.7,.41,.27);
  for(const x of [-25.13,25.13]) shell.add('#31454a',x,4.06,0,.27,.41,43.6);
  shell.add('#70868b',0,4.10,-.8,10.8,.37,6.5);
  for(let x=-4;x<=4;x+=2) shell.add('#314f59',x,4.32,-.8,1.87,.13,5.65);
  for(const x of [12.5,16.3,20.1]) {
    shell.add('#657477',x,4.42,-15.1,2.8,.91,2.6);
    for(let z=-16;z<=-14;z+=.39) shell.add('#31454a',x,4.89,z,2.32,.08,.10);
  }
  shell.add(steel,-1.8,2.73,22.59,5.8,.31,2.55);
  shell.add('#a37a57',-1.8,2.54,22.59,5.5,.08,2.4);
  for(const x of [-4.43,.83]) shell.add(steel,x,1.28,23.56,.22,2.56,.22);
  shell.add(steel,-1.8,2.23,21.65,3.28,.16,.19);
  for(const x of [-3.42,-.18]) shell.add(steel,x,1.09,21.65,.14,2.18,.17);
  paths.add('#9d9b90',-1.8,.006,22.65,5.7,.045,2.65);

  for(const home of homes) {
    const w=home.width,d=home.depth, height=home.variant===1?3.27:2.77;
    const palette=[['#e4cdae','#796053'],['#d9ddc5','#3e635e'],['#e6bea5','#914f40'],['#cbd5cf','#44586a']];
    const [wall,roof]=palette[home.variant];
    const homeStyle=homeVisualStyle(home.person.id);
    const local=(builder,color,u,y,v,width,h,depth,rotation=0,shape='box',finish='solid')=>{
      const [x,z]=home.point(u,v);
      builder.add(color,x,y,z,width,h,depth,home.angle+rotation,shape,finish);
    };
    const asset=(name,u,y,v,size,rotation=0)=>{
      const [x,z]=home.point(u,v);
      placeModel(importedInterior,name,[x,y,z],size,home.angle+rotation);
    };
    const shellSize=[w+.35,home.variant===3?5.7:4.65,d+.4];
    const entry=home.doorOffset, left=entry-houseDoor.width/2, right=entry+houseDoor.width/2;
    placeModel(importedExterior,'district/building-type-'+houseFronts[home.variant].model,[home.x,.06,home.z],
      shellSize,home.angle+Math.PI,homeStyle.facade,
      [entry/shellSize[0],houseDoor.width/shellSize[0],(houseDoor.height+.14)/shellSize[1]]);
    asset('furniture/loungesofa',-w*.24,.145,.55,[2.22,.94,.94]);
    asset('furniture/tablecoffee',-w*.24,.145,2.25,[1.22,.38,.47]);
    asset('district/bedsingle',w*.24,.145,-d*.28,[1.55,.71,2.29]);
    asset('district/kitchencabinet',w*.25,.145,1.73,[1.8,1.02,.72],Math.PI);
    asset('district/bathroomcabinet',-w*.25,.145,-d*.30,[1.11,.93,.78]);
    asset('furniture/toilet',-w*.39,.145,-d*.18,[.48,.69,.52],Math.PI/2);
    asset('furniture/lamproundfloor',-w*.45,.145,1.18,[.31,1.39,.31]);
    asset('furniture/plantsmall2',w*.41,.145,-d*.36,[.43,.62,.43]);
    asset('district/pillowblue',-w*.24+.54,.49,.69,[.36,.16,.25],.18);
    asset('district/books',-w*.24,.53,2.25,[.24,.07,.17],-.19);
    asset('district/lampwall',w*.34,.82,-d/2+.17,[.28,.35,.16]);
    local(paths,'#a7aa92',0,.025,0,w+1,.14,d+.95);
    local(paths,'#a9a891',entry,.043,d/2+.82,2.28,.12,1.71);
    for (const x of [left-.055,right+.055]) {
      local(paths,steel,x,houseDoor.height/2+.12,d/2,.11,houseDoor.height,.23);
    }
    local(paths,bronze,entry,houseDoor.height+.19,d/2,houseDoor.width+.22,.19,.28);
    local(paths,bronze,entry,houseDoor.height+.34,d/2+.38,houseDoor.width+.55,.13,1.32);
    local(paths,'#ffe0a6',entry,houseDoor.height+.23,d/2+.47,.67,.06,.12,0,'box','glow');
    // Per-employee facade art pass; overlays never occupy the entrance or
    // mutate home collisions, parcel assignment or old presence snapshots.
    for(const detail of homeFacadeDetails(home))
      local(paths,detail.color,detail.u,detail.y,detail.v,detail.w,detail.h,detail.d);
    local(paths,'#587553',w*.52,.02,0,1.15,.11,d+2.2);
    local(homeParts,wall,0,height/2,-d/2,w,height,.31);
    for(const side of [-1,1]) {
      local(homeParts,wall,side*w/2,.55,0,.28,1.1,d);
      local(homeParts,wall,side*w/2,height-.36,0,.28,.72,d);
    }
    for (const [start,end] of [[-w/2,left],[right,w/2]]) {
      local(homeParts,wall,(start+end)/2,height/2,d/2,end-start,height,.29);
      local(rooms,wall,(start+end)/2,.43,d/2,end-start,.66,.22);
    }
    local(homeParts,wall,entry,(height+houseDoor.height+.12)/2,d/2,
      houseDoor.width,height-houseDoor.height-.12,.29);
    if (home.variant===1 || home.variant===2) {
      local(homeParts,roof,0,height+.31,0,w*.64,.87,d+1.08,0,'roof');
      local(homeParts,steel,0,height,0,w+.63,.20,d+.78);
    } else {
      local(homeParts,roof,0,height,0,w+.63,.27,d+.63);
      if(home.variant===3) {
        local(homeParts,wall,-w*.14,height+.53,-d*.17,w*.62,1.09,d*.63);
        local(homeParts,roof,-w*.14,height+1.12,-d*.17,w*.70,.25,d*.72);
      }
    }
    local(homeParts,bronze,-w*.22,2.16,d/2+.83,w*.54,.20,1.9);
    local(homeParts,steel,-w*.45,1.02,d/2+1.56,.14,2.05,.14);
    local(rooms,'#e9d5af',0,.105,0,w-.32,.08,d-.31);
    local(rooms,wall,0,.66,-d/2,w,1.19,.23);
    for (const side of [-1,1]) {
      local(rooms,wall,side*w/2,.43,0,.22,.66,d);
    }
    local(rooms,homeStyle.trim,-w*.23,.155,1.28,2.64,.023,2.55);
    // Art hung on each home's rear wall: unique muted color and stripe count.
    // Decorations are batched, non-interactive, and outside collision footprints.
    for(const detail of homeInteriorArt(home))
      local(rooms,detail.color,detail.u,detail.y,detail.v,detail.w,detail.h,detail.d);
    // Keep the center aisle clear from the door to the rear rooms.
    local(fallback,'#477267',-w*.24,.37,.55,2.22,.58,.94);
    local(fallback,'#e6ded0',w*.24,.38,-d*.28,1.55,.48,2.29);
    local(fallback,'#53665a',w*.25,.56,1.73,1.8,1.12,.72);
    local(rooms,'#81988e',-w*.49,.59,-d*.19,.12,1.1,d*.45);
    local(rooms,'#81988e',-w*.31,.59,-d*.045,w*.37,1.1,.15);
  }
  for (const service of districtServices) {
    const {x,z,width,depth,height,model}=service;
    placeModel(services,'district/'+model,[x,.1,z],[width,height,depth],Math.PI);
    paths.add('#a7a898',x,.02,z,width+.55,.16,depth+.55);
    paths.add('#aaa99d',x,.024,42.2,2.5,.08,3.2);
  }
  for(const side of [-1,1]) {
    paths.add('#46525c',side*36.9,-.018,-.55,2.7,.07,69);
    paths.add('#9da79a',side*39,-.008,-.56,1.85,.07,69);
    for(let z=-29;z<30;z+=6) paths.add('#bdad84',side*36.9,.026,z,.07,.026,1.6);
  }
  paths.add('#46525c',0,-.018,-31.55,76.5,.07,3.05);
  paths.add('#a0a79d',0,-.007,-34,80,.075,1.88);
  for(const side of [-1,1]) {
    paths.add('#57655e',side*34.95,.001,-.7,.24,.038,60);
    for(let z=-25;z<25;z+=8) paths.add('#465753',side*34.95,.026,z,.34,.026,.57);
  }
  for(const home of homes) {
    const [ax,az]=home.porch,[bx,bz]=home.road;
    paths.add('#b1ae99',(ax+bx)/2,.018,(az+bz)/2,1.45,.043,Math.hypot(bx-ax,bz-az)+.25,Math.atan2(bx-ax,bz-az));
  }
  for(const [x,z] of [[-39,-31],[-39,-9],[-39,17],[39,-31],[39,-9],[39,17],[-12,-34],[12,-34]]) {
    paths.add(steel,x,1.17,z,.095,2.34,.095);
    paths.add('#fff1b3',x,2.36,z,.33,.16,.33,0,'tile','glow');
  }
  paths.add('#7e9a6b',0,-.022,-27.1,13.5,.08,3.15);
  paths.add('#997958',-3.25,.30,-27.05,2.3,.16,.49);
  paths.add('#997958',3.25,.30,-27.05,2.3,.16,.49);
  shell.build(); rooms.build(); paths.build(); homeParts.build(); fallback.build();
  const loaded=await Promise.allSettled([...assets].map(async ([name,placements])=>[await loadModel(name),placements]));
  const missing=loaded.some(result=>result.status==='rejected');
  const adjustedGeometry=new Set();
  if (!missing) {
    for(const result of loaded) {
      const [asset,sets]=result.value;
      for(const [group,placements] of sets) {
        if (!placements[0].opening) batchDistrictModels(group,asset,placements);
        else for(const part of placements) {
          const restored=openHouseFacade(asset,...part.opening);
          restored.scene.traverse(mesh=>{if (mesh.isMesh) adjustedGeometry.add(mesh.geometry);});
          batchDistrictModels(group,restored,[part]);
        }
      }
    }
  }
  homeShell.visible=fallbackInterior.visible=missing;
  const canvas=document.createElement('canvas');
  canvas.width=640; canvas.height=96;
  const ink=canvas.getContext('2d');
  ink.fillStyle='#314951'; ink.fillRect(0,0,640,96);
  ink.fillStyle='#9bdfcb'; ink.fillRect(20,19,8,58);
  ink.fillStyle='#f3e9d8'; ink.font='bold 37px sans-serif'; ink.fillText('ANSHEL VIRTUAL TECH',52,63);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const plaque=new THREE.Mesh(new THREE.PlaneGeometry(5.2,.78),new THREE.MeshBasicMaterial({map:texture}));
  plaque.position.set(-1.8,3.12,22.02);
  exterior.add(plaque);
  return {
    setMode(mode) { exterior.visible=mode==='exterior'; interior.visible=mode==='interior'; },
    dispose() {
      const resources=new Set();
      for(const group of [exterior,interior,streets]) {
        group.removeFromParent();
        group.traverse(mesh=>{
          if (!mesh.isMesh) return;
          mesh.dispose?.();
          if (mesh.parent===importedInterior || mesh.parent===importedExterior || mesh.parent===services) return;
          resources.add(mesh.geometry); resources.add(mesh.material);
        });
      }
      texture.dispose();
      for (const geometry of adjustedGeometry) geometry.dispose();
      for(const resource of resources) resource.dispose();
    },
  };
}
