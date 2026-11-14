import * as THREE from 'three';
import { homes, officeEnvelope } from './layout.js';

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

export function addBuildings(scene) {
  const exterior=new THREE.Group(), interior=new THREE.Group(), streets=new THREE.Group();
  exterior.name='Atap dan fasad'; interior.name='Interior rumah';
  scene.add(exterior,interior,streets);
  const shell=modelParts(exterior), rooms=modelParts(interior), paths=modelParts(streets);
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
    const local=(builder,color,u,y,v,width,h,depth,rotation=0,shape='box',finish='solid')=>{
      const [x,z]=home.point(u,v);
      builder.add(color,x,y,z,width,h,depth,home.angle+rotation,shape,finish);
    };
    local(paths,'#a7aa92',0,.025,0,w+1,.14,d+.95);
    local(paths,'#a9a891',0,.043,d/2+.82,2.05,.12,1.71);
    local(paths,'#587553',w*.52,.02,0,1.15,.11,d+2.2);
    local(shell,wall,0,height/2,-d/2,w,height,.31);
    for(const side of [-1,1]) {
      local(shell,wall,side*w/2,.55,0,.28,1.1,d);
      local(shell,wall,side*w/2,height-.36,0,.28,.72,d);
      local(shell,wall,side*w*.27,.55,d/2,w*.44,1.1,.29);
      local(shell,wall,side*w*.27,height-.34,d/2,w*.44,.68,.29);
      local(shell,wall,side*.79,1.5,d/2,.27,3,.29);
      const [x,z]=home.point(side*w*.29,d/2);
      window(x,z,1.61,w*.31,home.angle);
      const [sx,sz]=home.point(side*w/2,0);
      window(sx,sz,1.61,d*.63,home.angle+Math.PI/2);
    }
    local(shell,steel,0,2.21,d/2,1.42,.14,.28);
    if (home.variant===1 || home.variant===2) {
      local(shell,roof,0,height+.31,0,w*.64,.87,d+1.08,0,'roof');
      local(shell,steel,0,height,0,w+.63,.20,d+.78);
    } else {
      local(shell,roof,0,height,0,w+.63,.27,d+.63);
      if(home.variant===3) {
        local(shell,wall,-w*.14,height+.53,-d*.17,w*.62,1.09,d*.63);
        local(shell,roof,-w*.14,height+1.12,-d*.17,w*.70,.25,d*.72);
      }
    }
    local(shell,bronze,-w*.22,2.16,d/2+.83,w*.54,.20,1.9);
    local(shell,steel,-w*.45,1.02,d/2+1.56,.14,2.05,.14);
    local(rooms,'#e9d5af',0,.105,0,w-.32,.08,d-.31);
    local(rooms,wall,0,.43,-d/2,w,.66,.23);
    for (const side of [-1,1]) {
      local(rooms,wall,side*w/2,.43,0,.22,.66,d);
      local(rooms,wall,side*w*.28,.43,d/2,w*.43,.66,.22);
    }
    local(rooms,'#b89470',-w*.23,.155,1.28,2.64,.023,2.55);
    // Keep the center aisle clear from the door to the rear rooms.
    local(rooms,'#477267',-w*.24,.37,.55,2.22,.58,.94);
    local(rooms,'#335850',-w*.24,.68,.12,2.22,.47,.23);
    local(rooms,'#966e53',-w*.24,.24,2.25,1.22,.38,.47);
    local(rooms,'#926b57',w*.24,.31,-d*.28,1.55,.38,2.29);
    local(rooms,'#e6ded0',w*.24,.54,-d*.29,1.44,.22,2.06);
    local(rooms,roof,w*.24,.67,-d*.37,1.40,.12,1.17);
    local(rooms,'#f4e9db',w*.24,.68,-d*.28+ .82,1.28,.15,.45);
    local(rooms,'#53665a',w*.25,.56,1.73,1.8,1.12,.72);
    local(rooms,'#bbc0b8',w*.25,1.14,1.73,1.8,.08,.74);
    local(rooms,'#405153',w*.25-.41,1.19,1.73,.58,.025,.47);
    local(rooms,'#253638',w*.25+.44,1.192,1.73,.48,.024,.36);
    for (const du of [.32,.55]) local(rooms,'#808d85',w*.25+du,1.218,1.73,.14,.024,.14,0,'tile');
    local(rooms,'#9ca6a1',-w*.25,.52,-d*.30,1.11,.96,.78);
    local(rooms,'#f2eee0',-w*.25,1.04,-d*.30,1.10,.09,.78);
    local(rooms,'#81988e',-w*.49,.59,-d*.19,.12,1.1,d*.45);
    local(rooms,'#81988e',-w*.31,.59,-d*.045,w*.37,1.1,.15);
    local(rooms,'#55605c',-w*.45,.48,1.18,.09,.75,.09,0,'tile');
    local(rooms,'#fff4cc',-w*.45,.90,1.18,.21,.24,.21,0,'tile','glow');
  }
  for(const side of [-1,1]) {
    paths.add('#46525c',side*36.9,-.018,-.55,2.7,.07,69);
    paths.add('#9da79a',side*39,-.008,-.56,1.85,.07,69);
    for(let z=-29;z<30;z+=6) paths.add('#bdad84',side*36.9,.026,z,.07,.026,1.6);
  }
  paths.add('#46525c',0,-.018,-31.55,76.5,.07,3.05);
  paths.add('#a0a79d',0,-.007,-34,80,.075,1.88);
  paths.add('#a0a79d',0,-.007,32,80,.075,1.68);
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
  shell.build(); rooms.build(); paths.build();
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
        for(const mesh of group.children) { mesh.dispose?.(); resources.add(mesh.geometry); resources.add(mesh.material); }
      }
      texture.dispose();
      for(const resource of resources) resource.dispose();
    },
  };
}
