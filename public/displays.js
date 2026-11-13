import * as THREE from 'three';
import { divisions } from './catalog.js';
import { displayModes, displayState } from './display-state.js';
import { drawLoungeGame } from './lounge-game.js';

const supported=new Set(['monitor','laptop','tv']);
const templates={
  management:{tab:'Rencana kerja',panel:'Daftar prioritas',style:'list'},
  operations:{tab:'Operasional',panel:'Log dan sumber daya',style:'terminal'},
  administration:{tab:'Dokumen',panel:'Arsip dan jadwal',style:'table'},
  hr:{tab:'Tim & jadwal',panel:'Daftar pegawai',style:'list'},
  development:{tab:'Editor kode',panel:'Terminal pengujian',style:'editor'},
  creative:{tab:'Ruang desain',panel:'Artboard dan layer',style:'artboard'},
  video:{tab:'Studio video',panel:'Preview dan timeline',style:'timeline'},
  social:{tab:'Kalender konten',panel:'Rencana editorial',style:'calendar'},
  research:{tab:'Riset',panel:'Dokumen dan referensi',style:'document'},
  marketing:{tab:'SEO',panel:'Kata kunci dan tren',style:'table'},
  qa:{tab:'Pengujian',panel:'Daftar pemeriksaan',style:'list'},
  finance:{tab:'Keuangan',panel:'Anggaran dan biaya',style:'table'},
};
const profiles=Object.fromEntries(divisions.map(person=>[person.id,{...templates[person.id],label:person.name}]));
const shared={tab:'Layar bersama',panel:'Agenda ruang',style:'list',label:'Anshel Virtual Tech'};

const frameCache=new WeakMap();

// Kenney's three devices each use a dedicated two-triangle "metal" display.
export function screenGeometry(geometry) {
  if (frameCache.has(geometry)) return frameCache.get(geometry);
  const source=geometry.attributes.position;
  const index=geometry.index;
  const count=index?.count ?? source.count;
  const vertices=new Set(Array.from({length:count},(_,i)=>index?index.getX(i):i));
  if (count!==6 || vertices.size!==4) throw new Error('Topologi permukaan layar berubah');
  const bounds=new THREE.Box3();
  for (const i of vertices) bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(source,i));
  const width=bounds.max.x-bounds.min.x, height=bounds.max.y-bounds.min.y;
  if (!(width>0 && height>0)) throw new Error('Ukuran permukaan layar tidak valid');
  const result=geometry.clone();
  const uv=new Float32Array(source.count*2);
  for (const i of vertices) {
    uv[i*2]=(source.getX(i)-bounds.min.x)/width;
    uv[i*2+1]=(source.getY(i)-bounds.min.y)/height;
  }
  result.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  // The unused vertices in these GLBs include the stand and chassis.
  result.boundingBox=bounds;
  result.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
  frameCache.set(geometry,result);
  return result;
}

function putText(context,text,x,y,size,color,maxWidth) {
  context.fillStyle=color;
  context.font='600 '+size+'px system-ui';
  if (maxWidth===undefined) context.fillText(text,x,y);
  else context.fillText(text,x,y,maxWidth);
}

function fill(context,x,y,w,h,color) {
  context.fillStyle=color;
  context.fillRect(x,y,w,h);
}

const dark='#112031';
const surface='#172b40';
const muted='#8ba6ba';
const accentText='#e0edf4';

function drawEditor(ctx,accent,step) {
  fill(ctx,19,65,117,157,surface);
  putText(ctx,'BERKAS',31,87,12,muted);
  putText(ctx,'workspace',31,111,13,accentText);
  putText(ctx,'terminal',31,133,13,muted);
  for(let row=0;row<6;row++){
    const indent=row%3*12;
    fill(ctx,161,79+row*16,26,3,'#365167');
    fill(ctx,201+indent,79+row*16,42+(row%4)*11,3,row%2?accent:'#7d9cbb');
    fill(ctx,260+indent,79+row*16,67-row*5,3,'#526d89');
  }
  fill(ctx,198+(step%3)*12,76+(step%6)*16,2,10,accent);
  fill(ctx,152,179,307,43,'#0a1724');
  putText(ctx,'Terminal · log di panel tugas',164,203,12,muted);
}

function drawTerminal(ctx,accent,step) {
  fill(ctx,20,65,438,156,'#0a1724');
  putText(ctx,'KONSOL OPERASIONAL',35,89,12,muted);
  for (let row=0;row<4;row++) {
    const y=111+row*23;
    putText(ctx,'›',36,y+3,16,accent);
    fill(ctx,56,y,95+(row%3)*37,3,'#3f647b');
    if (row<3) fill(ctx,206,y,73+row*19,3,'#294c63');
  }
  if (step%2===0) fill(ctx,155,175,7,12,accent);
  putText(ctx,'Log aktual tersedia di panel tugas',35,206,12,muted);
}

function drawTimeline(ctx,accent,step) {
  fill(ctx,20,66,133,95,surface);
  putText(ctx,'Media',33,89,13,accentText);
  for(let i=0;i<3;i++) fill(ctx,35,103+i*14,88-i*14,4,'#3e5771');
  fill(ctx,163,66,295,95,'#0a1724');
  putText(ctx,'Pratinjau belum tersedia',226,114,14,muted);
  for(let row=0;row<3;row++){
    fill(ctx,20,171+row*17,438,12,'#23374d');
    fill(ctx,90+row*17,171+row*17,103-row*9,12,row===1?'#467b87':'#64538a');
    fill(ctx,221+row*8,171+row*17,126,12,row===1?'#467b87':'#4e6b9a');
  }
  for(let bar=0;bar<29;bar++) {
    const height=2+((bar*bar+bar*3)%7);
    fill(ctx,239+bar*3,211-height/2,1,height,'#96c1c5');
  }
  fill(ctx,91+step%27*11,167,2,54,accent);
}

function drawArtboard(ctx,accent,step) {
  fill(ctx,18,66,105,152,surface);
  putText(ctx,'Layer',29,88,14,accentText);
  for(let i=0;i<4;i++) fill(ctx,30,99+i*18,75,10,i===step%4?accent:'#395468');
  fill(ctx,150,69,298,148,'#e9e0cb');
  fill(ctx,178,93,124,100,'#263c53');
  fill(ctx,319,94,98,22,accent);
  fill(ctx,319,124,98,22,'#5a718b');
  fill(ctx,319,154,98,22,'#a896bd');
}

function drawWorkspace(ctx,profile,accent,step) {
  if (profile.style==='editor') {
    drawEditor(ctx,accent,step);
    return;
  }
  if (profile.style==='terminal') {
    drawTerminal(ctx,accent,step);
    return;
  }
  if (profile.style==='timeline') {
    drawTimeline(ctx,accent,step);
    return;
  }
  if (profile.style==='artboard') {
    drawArtboard(ctx,accent,step);
    return;
  }

  fill(ctx,19,66,440,154,surface);
  if (profile.style==='calendar') {
    for(let row=0;row<4;row++) for(let column=0;column<7;column++){
      fill(ctx,33+column*59,80+row*32,52,24,(row*7+column)===step%28?accent:'#254159');
    }
    return;
  }
  const table=profile.style==='table';
  const doc=profile.style==='document';
  for(let row=0;row<5;row++){
    const y=79+row*25;
    fill(ctx,32,y,414,18,row===step%5?'#305169':'#20384e');
    fill(ctx,41,y+8,doc?246-row*28:90+row%3*20,3,row===step%5?accent:'#597b91');
    if (table) {
      for(let col=0;col<3;col++) putText(ctx,'—',227+col*72,y+13,12,muted);
    } else if (!doc) fill(ctx,369,y+7,49,4,'#44617b');
  }
}

function draw(screen,snapshot,step) {
  const {context:ctx,profile,accent,texture}=screen;
  const running=snapshot.mode==='running';
  fill(ctx,0,0,480,270,dark);
  fill(ctx,0,0,480,46,'#20364b');
  fill(ctx,0,0,6,46,accent);
  putText(ctx,profile.tab,18,29,21,accentText,299);
  putText(ctx,displayModes[snapshot.mode].toUpperCase(),347,28,15,running?'#9fe0bd':'#ced7dd',120);
  if (running) {
    drawWorkspace(ctx,profile,accent,step);
    const kind=snapshot.kind==='diagnostic'?'Diagnostik':snapshot.kind==='draft'?'Draf AI':'Eksekusi';
    putText(ctx,kind+' · tampilan generik',19,248,14,muted,438);
  } else {
    putText(ctx,profile.label,30,108,24,accentText,420);
    const detail=snapshot.mode==='idle'?profile.panel:snapshot.mode==='blocked'?'Tugas memerlukan perhatian':'Tugas menunggu eksekusi';
    putText(ctx,detail,30,147,17,muted,420);
    fill(ctx,30,175,46,4,accent);
  }
  texture.needsUpdate=true;
}

export function createDisplays() {
  const screens=new Map();
  const devices=new Map();
  const meshes=[];
  const center=new THREE.Vector3();
  const normal=new THREE.Vector3();
  const normalMatrix=new THREE.Matrix3();
  let agenda='';
  return {
    attach(mesh,original,prop,room) {
      if (!supported.has(prop.type) || original.name!=='metal') return false;
      const profile=profiles[room.id] ?? shared;
      const game=room.id==='gaming' && prop.type==='tv';
      const presentation=room.id==='meeting' && prop.type==='tv';
      const key=presentation?'meeting-tv':room.person || game ? room.id : 'shared';
      let screen=screens.get(key);
      if (!screen) {
        const canvas=document.createElement('canvas');
        canvas.width=480;
        canvas.height=270;
        const texture=new THREE.CanvasTexture(canvas);
        texture.colorSpace=THREE.SRGBColorSpace;
        const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
        screen={context:canvas.getContext('2d'),texture,material,profile,game,presentation,accent:room.accent,division:room.person?.id,stamp:'',
          snapshot:displayState(null,room.person?.id)};
        screens.set(key,screen);
        if (game) drawLoungeGame(screen.context,0,0);
        else draw(screen,{mode:'idle'},0);
      }
      mesh.geometry=screenGeometry(mesh.geometry);
      mesh.material=screen.material;
      devices.set(mesh,{room:room.id,type:prop.type});
      meshes.push(mesh);
      return true;
    },
    sync(office) {
      for (const screen of screens.values()) screen.snapshot=displayState(office,screen.division);
    },
    agenda(value) { agenda=value; },
    update(now,zoom,game,gameVisible) {
      const step=zoom>=2 ? Math.floor(now/180):0;
      for(const screen of screens.values()) {
        if (screen.presentation && agenda) {
          const stamp='agenda:'+agenda;
          if (screen.stamp!==stamp) {
            screen.stamp=stamp;
            fill(screen.context,0,0,480,270,dark);
            fill(screen.context,24,38,5,172,screen.accent);
            putText(screen.context,'POD RAPAT',45,75,22,muted,400);
            putText(screen.context,agenda,45,140,30,accentText,398);
            screen.texture.needsUpdate=true;
          }
          continue;
        }
        if (screen.game) {
          const players=game?.players.size ?? 0;
          const time=players ? game.elapsed : now/1000;
          const frame=gameVisible ? Math.floor(time*24) : 0;
          const stamp=players+':'+frame;
          if (stamp!==screen.stamp) {
            screen.stamp=stamp;
            drawLoungeGame(screen.context,frame/24,players);
            screen.texture.needsUpdate=true;
          }
          continue;
        }
        const {snapshot}=screen;
        const stamp=snapshot.mode+':'+snapshot.kind+':'+(snapshot.mode==='running'?step:0);
        if (stamp===screen.stamp) continue;
        screen.stamp=stamp;
        draw(screen,snapshot,step);
      }
    },
    pick(ray,objects) {
      const candidate=ray.intersectObjects(meshes,false)[0];
      if (!candidate) return null;
      const blocked=ray.intersectObjects(objects,true).some(hit=>
        hit.distance<candidate.distance-.002 && !hit.object.material?.transparent);
      return blocked ? null : devices.get(candidate.object);
    },
    types(room) {
      return [...new Set([...devices.values()].filter(device=>device.room===room).map(device=>device.type))];
    },
    focus(room,type) {
      const entry=[...devices.entries()].find(([,device])=>device.room===room && device.type===(type??'monitor')) ??
        [...devices.entries()].find(([,device])=>device.room===room);
      if (!entry) return null;
      const [mesh]=entry;
      mesh.geometry.boundingBox.getCenter(center);
      mesh.localToWorld(center);
      const index=mesh.geometry.index?.getX(0) ?? 0;
      normal.fromBufferAttribute(mesh.geometry.attributes.normal,index).applyNormalMatrix(normalMatrix.getNormalMatrix(mesh.matrixWorld));
      return {center:center.clone(),normal:normal.clone()};
    },
  };
}
