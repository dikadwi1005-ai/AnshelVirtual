import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createActors } from './actors.js';
import { rooms, roomById, site, point } from './layout.js';
import { radialTexture } from './materials.js';
import { navigation } from './navigation.js';
import { buildWorld } from './world.js';

const overview=new THREE.Vector3(30,57,55);
const center=new THREE.Vector3(0,.35,0);
const day={
  backdrop:'#3b526b', key:'#ffe8cf', sky:'#d0e5fa', ground:'#af9282',
  sun:2.35, ambient:1.57, interior:.38, glow:.19, exposure:1.05,
};
const evening={
  backdrop:'#141e34', key:'#aec8ff', sky:'#6a94de', ground:'#524260',
  sun:.83, ambient:1.12, interior:1.01, glow:.78, exposure:1.14,
};

export function officeScene(host, labels, onSelect, onMessage) {
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(day.backdrop);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=day.exposure;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Kantor 3D interaktif');

  const camera=new THREE.OrthographicCamera(-32,32,24,-24,.1,190);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.dampingFactor=.10;
  controls.maxZoom=9;
  controls.minZoom=.56;
  controls.minPolarAngle=.29;
  controls.maxPolarAngle=1.18;
  controls.maxTargetRadius=32;
  controls.zoomToCursor=true;
  controls.touches.ONE=THREE.TOUCH.ROTATE;
  controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;

  const sun=new THREE.DirectionalLight(day.key,day.sun);
  sun.position.set(-24,38,16);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.normalBias=.028;
  sun.shadow.bias=-.0002;
  sun.shadow.intensity=.65;
  Object.assign(sun.shadow.camera,{left:-35,right:35,top:30,bottom:-30,near:.5,far:95});
  sun.shadow.camera.updateProjectionMatrix();
  const ambient=new THREE.HemisphereLight(day.sky,day.ground,day.ambient);
  const interior=new THREE.DirectionalLight('#ffc89d',day.interior);
  interior.position.set(6,24,18);
  const atrium=new THREE.PointLight('#ffb776',0,12,1.7);
  atrium.position.set(0,5.3,0);
  scene.add(sun,ambient,interior,atrium);

  const shadow=radialTexture();
  const temp=new THREE.Vector3(), offset=new THREE.Vector3(), ray=new THREE.Raycaster();
  const pointer=new THREE.Vector2(), groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.015);
  let world, population, state=null, following=null, selected=null, cameraMove=null;
  let mode='auto', night=0, press=null, loaded=false, auditCursor=null;
  const roomLabels=[];

  function resize() {
    const width=host.clientWidth, height=host.clientHeight;
    if (!width || !height) return;
    const aspect=width/height;
    const vertical=Math.max(24.7,31.4/aspect);
    Object.assign(camera,{left:-vertical*aspect,right:vertical*aspect,top:vertical,bottom:-vertical});
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  }
  new ResizeObserver(resize).observe(host);
  camera.position.copy(overview);
  camera.zoom=host.clientWidth<650?1.65:1;
  controls.target.copy(center);
  controls.update();
  resize();

  function reset() {
    following=null;
    cameraMove={target:center.clone(),position:overview.clone(),zoom:1};
  }

  function focus(x,z,zoom) {
    offset.copy(camera.position).sub(controls.target);
    const target=new THREE.Vector3(x,.48,z);
    cameraMove={target,position:target.clone().add(offset),zoom};
  }

  function focusRoom(id) {
    const room=roomById[id];
    if (!room) return;
    following=null;
    focus(room.x,room.z,host.clientWidth<650?2.97:3.70);
  }

  function focusEmployee(id,follow=false) {
    const actor=population?.actors.find(item=>item.person.id===id);
    if (!actor) return;
    following=follow?id:null;
    focus(actor.root.position.x,actor.root.position.z,host.clientWidth<650?3.7:4.7);
  }

  controls.addEventListener('start',()=>{cameraMove=null;following=null;});
  function updateCamera(delta) {
    const blend=1-Math.exp(-delta*7);
    const actor=following && population?.actors.find(item=>item.person.id===following);
    if (actor) {
      temp.copy(actor.root.position).y=.55;
      if (cameraMove) {
        offset.copy(temp).sub(cameraMove.target);
        cameraMove.target.add(offset);
        cameraMove.position.add(offset);
      } else {
        offset.copy(temp).sub(controls.target).multiplyScalar(blend);
        controls.target.add(offset);
        camera.position.add(offset);
      }
    }
    if (cameraMove) {
      controls.target.lerp(cameraMove.target,blend);
      camera.position.lerp(cameraMove.position,blend);
      camera.zoom=THREE.MathUtils.lerp(camera.zoom,cameraMove.zoom,blend);
      camera.updateProjectionMatrix();
      if (controls.target.distanceToSquared(cameraMove.target)<.0001 &&
          camera.position.distanceToSquared(cameraMove.position)<.0001 &&
          Math.abs(camera.zoom-cameraMove.zoom)<.002) cameraMove=null;
    }
    controls.update();
  }

  function refreshLighting(delta) {
    const hour=new Date((state?.now ?? Date.now())+7*3600_000).getUTCHours();
    const target=mode==='evening' || (mode==='auto' && (hour>=18 || hour<6)) ? 1:0;
    night=THREE.MathUtils.lerp(night,target,1-Math.exp(-delta*4));
    scene.background.set(day.backdrop).lerp(backgroundNight,night);
    sun.color.set(day.key).lerp(sunNight,night);
    ambient.color.set(day.sky).lerp(skyNight,night);
    ambient.groundColor.set(day.ground).lerp(groundNight,night);
    sun.intensity=THREE.MathUtils.lerp(day.sun,evening.sun,night);
    ambient.intensity=THREE.MathUtils.lerp(day.ambient,evening.ambient,night);
    interior.intensity=THREE.MathUtils.lerp(day.interior,evening.interior,night);
    atrium.intensity=night*27;
    renderer.toneMappingExposure=THREE.MathUtils.lerp(day.exposure,evening.exposure,night);
    if (world) world.warmGlow.opacity=THREE.MathUtils.lerp(day.glow,evening.glow,night);
  }
  const backgroundNight=new THREE.Color(evening.backdrop), sunNight=new THREE.Color(evening.key);
  const skyNight=new THREE.Color(evening.sky), groundNight=new THREE.Color(evening.ground);

  function updateLabels() {
    const width=host.clientWidth, height=host.clientHeight;
    const boxes=[];
    const narrow=width<700;
    for (const {room,element} of roomLabels) {
      const [x,z]=point(room,0,-room.depth/2-.38);
      temp.set(x,.56,z).project(camera);
      const left=(temp.x*.5+.5)*width, top=(.5-temp.y*.5)*height;
      const focused=selected===room.id;
      const inBounds=left>48 && left<width-48 && top>75 && top<height-74;
      const relevant=focused || (!narrow && camera.zoom<1.55) ||
        (camera.zoom>1.48 && Math.hypot(controls.target.x-room.x,controls.target.z-room.z)<7.8);
      const labelWidth=element.dataset.width || Math.min(135,42+room.label.length*4);
      const overlaps=boxes.some(item=>Math.abs(item.left-left)<(Number(labelWidth)+item.width)/2 && Math.abs(item.top-top)<24);
      element.hidden=!(inBounds && relevant && (!overlaps || focused));
      element.style.transform='translate3d('+Math.round(left)+'px,'+Math.round(top)+'px,0) translate(-50%,-50%)';
      element.classList.toggle('selected',focused);
      if (!element.hidden) boxes.push({left,top,width:Number(labelWidth)});
    }
  }

  async function load() {
    if (loaded) return;
    onMessage('Menyiapkan kantor…');
    world=await buildWorld(scene,shadow);
    population=await createActors(scene,navigation(world.obstacles),shadow,state);
    for (const room of rooms) {
      const element=document.createElement('button');
      element.className='room-label';
      element.type='button';
      element.textContent=room.label;
      element.style.setProperty('--room-accent',room.accent);
      element.addEventListener('click',()=>onSelect(null,room.id));
      labels.append(element);
      roomLabels.push({element,room});
    }
    renderer.shadowMap.needsUpdate=true;
    loaded=true;
    const errors=[...world.errors,...population.errors];
    if (errors.length) console.error('Aset kantor gagal dimuat',errors);
    onMessage(errors.length?errors.length+' aset kantor gagal dimuat.':'');
  }

  renderer.domElement.addEventListener('pointerdown',event=>{
    if (event.isPrimary && event.button===0) press=[event.clientX,event.clientY];
  });
  renderer.domElement.addEventListener('pointercancel',()=>{press=null;});
  renderer.domElement.addEventListener('pointerup',event=>{
    if (!event.isPrimary || !press || Math.hypot(press[0]-event.clientX,press[1]-event.clientY)>7) return;
    press=null;
    const bounds=host.getBoundingClientRect();
    pointer.set((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2);
    ray.setFromCamera(pointer,camera);
    const candidate=population?.actors.map(actor=>{
      temp.copy(actor.root.position).y+=actor.stage==='seated'?.45:.8;
      return {actor,distance:ray.ray.distanceSqToPoint(temp)};
    }).filter(item=>item.distance<.51**2).sort((a,b)=>a.distance-b.distance)[0];
    if (candidate) { onSelect(candidate.actor.person.id,null); return; }
    if (!ray.ray.intersectPlane(groundPlane,temp)) return;
    const room=rooms.find(item=>Math.abs(item.x-temp.x)<item.width/2 && Math.abs(item.z-temp.z)<item.depth/2);
    if (room) onSelect(null,room.id);
  });

  let lastFrame=performance.now();
  renderer.setAnimationLoop(now=>{
    const delta=Math.min((now-lastFrame)/1000,.65);
    lastFrame=now;
    if (!host.clientWidth || document.hidden) return;
    if (population) {
      const steps=Math.max(1,Math.ceil(delta/.05));
      for (let step=0;step<steps;step++) population.update(delta/steps,state);
    }
    updateCamera(delta);
    refreshLighting(delta);
    renderer.render(scene,camera);
    updateLabels();
  });

  return {
    load,reset,focusRoom,focusEmployee,
    state(value) {
      if (!value) return;
      if (auditCursor!==null) {
        for (const entry of value.audit) {
          if (entry.id<=auditCursor || entry.action!=='completed') continue;
          const task=value.tasks.find(item=>item.id===entry.task);
          if (task) population?.celebrate(task.division);
        }
      }
      auditCursor=value.audit[0]?.id ?? 0;
      state=value;
    },
    select(id) { selected=id; },
    actorState(id) {
      const actor=population?.actors.find(item=>item.person.id===id);
      if (!actor) return null;
      return {stage:actor.stage,animation:actor.animation,activity:actor.actual,
        x:actor.root.position.x,z:actor.root.position.z,y:actor.root.position.y};
    },
    follow(id) {
      if (following===id) { following=null; return false; }
      focusEmployee(id,true);
      return true;
    },
    isFollowing(id) { return following===id; },
    zoom(factor) {
      cameraMove=null;
      camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,controls.maxZoom);
      camera.updateProjectionMatrix();
    },
    lighting(value) { mode=value; },
    quality(low) {
      renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,1.5));
      renderer.shadowMap.enabled=!low;
      renderer.shadowMap.needsUpdate=true;
      resize();
    },
  };
}
