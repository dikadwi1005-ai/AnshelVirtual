import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createActors } from './actors.js';
import { insideRoom, rooms, roomById, point } from './layout.js';
import { radialTexture } from './materials.js';
import { navigation } from './navigation.js';
import { buildWorld } from './world.js';

const overview=new THREE.Vector3(30,57,55);
const center=new THREE.Vector3(0,.35,0);
const day={
  backdrop:'#536572', key:'#ffebd3', sky:'#e2edf4', ground:'#b9a899',
  sun:2.08, ambient:1.46, interior:.31, glow:.17, exposure:.97,
};
const evening={
  backdrop:'#273346', key:'#ccd8ff', sky:'#9aaad4', ground:'#9c795e',
  sun:.80, ambient:1.20, interior:1.16, glow:.76, exposure:1.04,
};

export function officeScene(host, labels, onSelect, onMessage, onDisplay) {
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
  controls.maxZoom=48;
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
  const bubble=document.createElement('div');
  const speakerName=document.createElement('strong'), dialogue=document.createElement('p');
  bubble.className='speech-bubble';
  bubble.setAttribute('role','status');
  bubble.setAttribute('aria-atomic','true');
  bubble.hidden=true;
  bubble.append(speakerName,dialogue);
  labels.append(bubble);
  let shownTurn=null;

  function resize() {
    const width=host.clientWidth, height=host.clientHeight;
    if (!width || !height) return;
    const aspect=width/height;
    const vertical=Math.max(26.4,34.5/aspect);
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

  function focusDisplay(room,type) {
    const view=world?.displays.focus(room,type);
    if (!view) return;
    following=null;
    const target=view.center;
    const direction=view.normal.setY(.66).normalize().multiplyScalar(16);
    cameraMove={target,position:target.clone().add(direction),zoom:host.clientWidth<650?40:33};
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
    for (const {room,element,anchors} of roomLabels) {
      const focused=selected===room.id;
      const relevant=focused || (!narrow && camera.zoom<1.55) ||
        (camera.zoom>1.48 && Math.hypot(controls.target.x-room.x,controls.target.z-room.z)<7.8);
      const labelWidth=Math.min(135,42+room.label.length*4);
      let position=null;
      if (relevant) {
        for (const anchor of anchors) {
          temp.copy(anchor).project(camera);
          const left=(temp.x*.5+.5)*width, top=(.5-temp.y*.5)*height;
          if (left<labelWidth/2+9 || left>width-labelWidth/2-9 || top<75 || top>height-74) continue;
          const overlaps=boxes.some(item=>Math.abs(item.left-left)<(labelWidth+item.width)/2 && Math.abs(item.top-top)<24);
          if (overlaps && !focused) continue;
          position={left,top,width:labelWidth};
          break;
        }
      }
      element.hidden=!position;
      element.classList.toggle('selected',focused);
      if (!position) continue;
      const {left,top}=position;
      element.style.transform='translate3d('+Math.round(left)+'px,'+Math.round(top)+'px,0) translate(-50%,-50%)';
      boxes.push(position);
    }
  }

  function updateSpeech() {
    const width=host.clientWidth, height=host.clientHeight;
    let closest=null, distance=7.5, x, y;
    if (population && camera.zoom>2.15 && state?.phase!=='paused') {
      for (const turn of population.turns.values()) {
        const actor=turn.speaker;
        const position=actor.root.position;
        const range=Math.hypot(position.x-controls.target.x,position.z-controls.target.z);
        if (range>=distance) continue;
        temp.copy(position).y+=actor.stature+.15;
        temp.project(camera);
        const left=(.5+temp.x*.5)*width, top=(.5-temp.y*.5)*height;
        if (left<42 || left>width-42 || top<146 || top>height-84) continue;
        closest=turn;
        distance=range;
        x=left;
        y=top;
      }
    }
    bubble.hidden=!closest;
    if (!closest) return;
    if (shownTurn!==closest) {
      shownTurn=closest;
      speakerName.textContent=closest.speaker.person.employee;
      dialogue.textContent=closest.text;
    }
    const margin=width<560?110:136;
    const left=THREE.MathUtils.clamp(x,margin,width-margin);
    bubble.style.transform='translate3d('+Math.round(left)+'px,'+Math.round(y)+'px,0) translate(-50%,-100%)';
    bubble.style.setProperty('--speech-tail',Math.round(x-left)+'px');
  }

  async function load() {
    if (loaded) return;
    onMessage('Menyiapkan kantor…');
    world=await buildWorld(scene,shadow);
    world.displays.sync(state);
    population=await createActors(scene,navigation(world.obstacles),shadow,state);
    for (const room of rooms) {
      const element=document.createElement('button');
      element.className='room-label';
      element.type='button';
      element.textContent=room.label;
      element.style.setProperty('--room-accent',room.accent);
      element.addEventListener('click',()=>onSelect(null,room.id));
      labels.append(element);
      const front=room.style==='hub'?-.5:-room.depth/2-.34;
      const anchors=[[0,front],[0,-.9],[-room.width*.26,.25],[room.width*.26,.25]].map(([x,depth])=>{
        const [worldX,worldZ]=point(room,x,depth);
        return new THREE.Vector3(worldX,.56,worldZ);
      });
      roomLabels.push({element,room,anchors});
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
    const device=world?.displays.pick(ray,scene.children);
    if (device) { onDisplay(device); return; }
    const candidate=population?.actors.map(actor=>{
      temp.copy(actor.root.position).y+=actor.stage==='seated'?.45:.8;
      return {actor,distance:ray.ray.distanceSqToPoint(temp)};
    }).filter(item=>item.distance<.51**2).sort((a,b)=>a.distance-b.distance)[0];
    if (candidate) { onSelect(candidate.actor.person.id,null); return; }
    if (!ray.ray.intersectPlane(groundPlane,temp)) return;
    const room=rooms.find(item=>insideRoom(item,[temp.x,temp.z]));
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
    world?.displays.update(now,camera.zoom);
    renderer.render(scene,camera);
    updateLabels();
    updateSpeech();
  });

  return {
    load,reset,focusRoom,focusEmployee,focusDisplay,
    displayTypes(room) { return world?.displays.types(room) ?? []; },
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
      world?.displays.sync(value);
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
