import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createActors } from './actors.js';
import { createCharacter } from './character-mode.js';
import { createCharacterCamera } from './character-camera.js';
import { insideRoom, rooms, roomById, point } from './layout.js';
import { radialTexture } from './materials.js';
import { navigation } from './navigation.js';
import { createLipTimeline } from './office-lips.js';
import { createOfficeSpatialAudio } from './office-spatial-audio.js';
import { createOfficeVoice } from './office-voice.js';
import { buildWorld } from './world.js';

const overview=new THREE.Vector3(30,57,55);
const center=new THREE.Vector3(0,.35,0);
const day={
  backdrop:'#536572', key:'#ffebd3', sky:'#e2edf4', ground:'#b9a899',
  sun:2.22, ambient:1.35, interior:.31, glow:.16, exposure:.97,
};
const evening={
  backdrop:'#273346', key:'#ccd8ff', sky:'#9aaad4', ground:'#9c795e',
  sun:.80, ambient:1.20, interior:1.16, glow:.76, exposure:1.04,
};

export function officeScene(host, labels, onSelect, onMessage, onDisplay, requestDialogue, {low=false}={}) {
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(day.backdrop);
  const renderer=new THREE.WebGLRenderer({antialias:!low,powerPreference:low?'default':'high-performance',stencil:false});
  renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=day.exposure;
  renderer.shadowMap.enabled=!low;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Kantor 3D interaktif');

  const camera=new THREE.OrthographicCamera(-32,32,24,-24,.1,190);
  const chase=createCharacterCamera();
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
  sun.shadow.mapSize.set(low?512:2048,low?512:2048);
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
  let world, population, character, state=null, following=null, selected=null, cameraMove=null, drag=null;
  let shared=null, leading=false;
  function restoreOffice(value) {
    if (!population) return;
    population.visible(value.leader || Boolean(value.snapshot));
    population.apply(value.snapshot,value.leader);
    if (!value.leader || state?.phase==='paused') return;
    const seconds=value.snapshot?Math.min(75,(value.age??0)/1000):36+(Math.floor((state?.now??Date.now())/1000)%24);
    population.catchUp(seconds,{...state,dialogueEnabled:false});
  }
  const movement={x:0,y:0};
  const characterActive=()=>character?.root.visible===true;
  const viewCamera=()=>characterActive()?chase.camera:camera;
  const viewTarget=()=>characterActive()?chase.focus:controls.target;
  const viewZoom=()=>characterActive()?6:camera.zoom;
  let mode='auto', night=0, press=null, loaded=false, auditCursor=null, suspended=false;
  const roomLabels=[];
  const bubble=document.createElement('div');
  const speakerName=document.createElement('strong'), dialogue=document.createElement('p');
  bubble.className='speech-bubble';
  bubble.setAttribute('role','status');
  bubble.setAttribute('aria-atomic','true');
  bubble.hidden=true;
  bubble.append(speakerName,dialogue);
  labels.append(bubble);
  let shownTurn=null, lips=null;
  const sound=createOfficeSpatialAudio();
  const voice=createOfficeVoice(window,{
    start(turn) {
      if (lips?.turn!==turn) return;
      lips.started=performance.now();
      lips.timeline.align(0,0);
    },
    boundary(turn,index) {
      if (lips?.turn===turn) lips.timeline.align(index,(performance.now()-lips.started)/1000);
    },
    end(turn) {
      if (lips?.turn===turn) lips.finished=true;
    },
  });
  const unlockAudio=()=>{ void sound.unlock(); };
  window.addEventListener('pointerdown',unlockAudio);
  window.addEventListener('keydown',unlockAudio);
  const save=()=>population?.living.persist();
  function clearMouth() {
    lips?.turn.speaker.mouth?.fill(0);
    lips=null;
  }
  const visibility=()=>{
    if (!document.hidden) return;
    save();
    voice.show(null);
    sound.clear();
    clearMouth();
  };
  window.addEventListener('pagehide',save);
  document.addEventListener('visibilitychange',visibility);

  function resize() {
    const width=host.clientWidth, height=host.clientHeight;
    if (!width || !height) return;
    const aspect=width/height;
    const vertical=Math.max(26.4,34.5/aspect);
    Object.assign(camera,{left:-vertical*aspect,right:vertical*aspect,top:vertical,bottom:-vertical});
    camera.updateProjectionMatrix();
    chase.resize(aspect);
    renderer.setSize(width,height,false);
  }
  const resizeObserver=new ResizeObserver(resize);
  resizeObserver.observe(host);
  camera.position.copy(overview);
  camera.zoom=1;
  controls.target.copy(center);
  controls.update();
  resize();

  function reset() {
    following=null;
    if (characterActive()) {
      chase.reset(character.root.rotation.y);
      chase.update(character.root,0,host.clientWidth<650);
      return;
    }
    cameraMove={target:center.clone(),position:overview.clone(),zoom:1};
  }

  function focus(x,z,zoom) {
    offset.copy(camera.position).sub(controls.target);
    const target=new THREE.Vector3(x,.48,z);
    cameraMove={target,position:target.clone().add(offset),zoom};
  }

  function focusRoom(id) {
    const room=roomById[id];
    if (!room || characterActive()) return;
    following=null;
    focus(room.x,room.z,host.clientWidth<650?2.97:3.70);
  }

  function focusEmployee(id,follow=false) {
    const actor=population?.actors.find(item=>item.person.id===id);
    if (!actor || characterActive()) return;
    following=follow?id:null;
    focus(actor.root.position.x,actor.root.position.z,host.clientWidth<650?3.7:4.7);
  }

  function focusDisplay(room,type) {
    const view=world?.displays.focus(room,type);
    if (!view || characterActive()) return;
    following=null;
    const target=view.center;
    const direction=view.normal.setY(room==='gaming'?1.2:.66).normalize().multiplyScalar(16);
    cameraMove={target,position:target.clone().add(direction),zoom:host.clientWidth<650?40:33};
  }

  controls.addEventListener('start',()=>{cameraMove=null;following=null;});
  function updateCamera(delta) {
    const blend=1-Math.exp(-delta*7);
    const root=following && population?.actors.find(item=>item.person.id===following)?.root;
    if (root) {
      temp.copy(root.position).y=.55;
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

  function updateLabels(width,height) {
    const view=viewCamera(), zoom=viewZoom(), target=viewTarget();
    const avatar=characterActive()?temp.copy(target).project(view):null;
    const avatarX=avatar && (.5+avatar.x*.5)*width;
    const avatarY=avatar && (.5-avatar.y*.5)*height;
    const boxes=[];
    const narrow=width<700;
    for (const {room,element,anchors} of roomLabels) {
      const focused=selected===room.id;
      const relevant=zoom<18 && (focused || (!narrow && zoom<1.55) ||
        (zoom>1.48 && Math.hypot(target.x-room.x,target.z-room.z)<(characterActive()?5.5:7.8)));
      const labelWidth=Math.min(135,42+room.label.length*4);
      let position=null;
      if (relevant) {
        for (const anchor of anchors) {
          temp.copy(anchor).project(view);
          if (temp.z<=-1 || temp.z>=1) continue;
          const left=(temp.x*.5+.5)*width, top=(.5-temp.y*.5)*height;
          if (left<labelWidth/2+9 || left>width-labelWidth/2-9 || top<75 || top>height-74) continue;
          if (avatar && Math.abs(left-avatarX)<labelWidth/2+width*.07 && Math.abs(top-avatarY)<height*.16) continue;
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

  function updateSpeech(width,height) {
    let closest=null, distance=7.5, x, y;
    if (population && viewZoom()>2.15 && state?.phase!=='paused') {
      const view=viewCamera(), target=viewTarget();
      const candidates=shared && !leading?[population.sharedTurn].filter(Boolean):[...population.turns.values()];
      if ((!shared || leading) && population.solo) candidates.push(population.solo);
      candidates.sort((a,b)=>Number(a!==shownTurn)-Number(b!==shownTurn));
      if ((!shared || leading) && population.directTurn) candidates.unshift(population.directTurn);
      for (const turn of candidates) {
        const actor=turn.speaker;
        const position=actor.root.position;
        const range=Math.hypot(position.x-target.x,position.z-target.z);
        if (range>=distance || (turn.solo && closest)) continue;
        temp.copy(position).y+=actor.stature+(actor.stage==='seated'?-.19:.15);
        temp.project(view);
        if (temp.z<=-1 || temp.z>=1) continue;
        const left=(.5+temp.x*.5)*width, top=(.5-temp.y*.5)*height;
        if (left<42 || left>width-42 || top<146 || top>height-84) continue;
        closest=turn;
        distance=range;
        x=left;
        y=top;
        if (turn===shownTurn || turn===population.directTurn) break;
      }
    }
    bubble.hidden=!closest;
    if (lips?.turn!==closest) {
      clearMouth();
      if (closest) lips={turn:closest,timeline:createLipTimeline(closest.text,closest.duration),
        started:performance.now(),finished:false};
    }
    voice.show(closest,THREE.MathUtils.clamp(1-distance/10,.30,.92));
    if (!closest) return;
    const mouth=closest.speaker.mouth;
    if (mouth) {
      if (lips.finished) mouth.fill(0);
      else {
        const pose=lips.timeline.pose((performance.now()-lips.started)/1000);
        mouth[0]=pose.open;
        mouth[1]=pose.round;
        mouth[2]=pose.wide;
      }
    }
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
    let storage;
    try { storage=window.localStorage; } catch { /* Storage can be denied by browser settings. */ }
    const nav=navigation(world.obstacles);
    population=await createActors(scene,nav,shadow,state,requestDialogue,storage);
    if(shared) restoreOffice(shared);
    else if(state?.phase!=='paused') population.catchUp(42,{...state,dialogueEnabled:false});
    try { character=await createCharacter(scene,nav,shadow); }
    catch (error) { console.error('Avatar Dika gagal dimuat',error); }
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
    if (event.button!==0 || (characterActive()?drag:!event.isPrimary)) return;
    press=[event.clientX,event.clientY];
    if (characterActive()) {
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
      renderer.domElement.setPointerCapture(event.pointerId);
    }
  });
  renderer.domElement.addEventListener('pointermove',event=>{
    if (drag?.id!==event.pointerId || !press) return;
    if (!drag.moved && Math.hypot(event.clientX-press[0],event.clientY-press[1])<5) return;
    drag.moved=true;
    chase.rotate(event.clientX-drag.x,event.clientY-drag.y);
    drag.x=event.clientX;
    drag.y=event.clientY;
  });
  const cancelPointer=()=>{press=null;drag=null;};
  const cancelCapturedPointer=event=>{
    if (characterActive()?event.pointerId===drag?.id:event.isPrimary) cancelPointer();
  };
  renderer.domElement.addEventListener('pointercancel',cancelCapturedPointer);
  renderer.domElement.addEventListener('lostpointercapture',cancelCapturedPointer);
  renderer.domElement.addEventListener('wheel',event=>{
    if (!characterActive()) return;
    event.preventDefault();
    chase.zoom(event.deltaY<0?1.12:1/1.12);
  },{passive:false});
  renderer.domElement.addEventListener('pointerup',event=>{
    if (!press || (characterActive()?event.pointerId!==drag?.id:!event.isPrimary)) return;
    const moved=drag?.moved || Math.hypot(press[0]-event.clientX,press[1]-event.clientY)>7;
    cancelPointer();
    if (moved) return;
    const bounds=host.getBoundingClientRect();
    pointer.set((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2);
    ray.setFromCamera(pointer,viewCamera());
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

  let lastFrame=performance.now(), lastLabelUpdate=-Infinity;
  renderer.setAnimationLoop(now=>{
    const delta=Math.min((now-lastFrame)/1000,.65);
    lastFrame=now;
    if (suspended || document.hidden) return;
    const width=host.clientWidth, height=host.clientHeight;
    if (!width || !height) return;
    if (population) {
      const steps=Math.max(1,Math.ceil(delta/.05));
      const speechFocus=viewZoom()>2.15 ? viewTarget() : null;
      for (let step=0;step<steps;step++) {
        if (characterActive()) character.update(delta/steps,movement,chase.forward,population.actors);
        if (!shared || leading) population.update(delta/steps,state,speechFocus,viewZoom()<1.6,characterActive()?character.root:null);
        else population.followSnapshot(delta/steps);
      }
      world?.showDockedControllers(population.game.players);
    }
    if (characterActive()) chase.update(character.root,delta,width<650);
    else {
      updateCamera(delta);
      camera.updateMatrixWorld();
    }
    const view=viewCamera(), target=viewTarget(), zoom=viewZoom();
    refreshLighting(delta);
    const lounge=roomById.gaming;
    const gameVisible=zoom>=2 && Math.hypot(target.x-lounge.x,target.z-lounge.z)<10;
    world?.displays.update(now,zoom,population?.game,gameVisible);
    updateSpeech(width,height);
    if (population && zoom>2.15 && state?.phase!=='paused') sound.update(population.actors,target,view.position);
    else sound.clear();
    renderer.render(scene,view);
    if (now-lastLabelUpdate>=45) {
      updateLabels(width,height);
      lastLabelUpdate=now;
    }
  });

  return {
    load,reset,focusRoom,focusEmployee,focusDisplay,
    dispose() {
      save();
      voice.stop();
      sound.dispose();
      clearMouth();
      window.removeEventListener('pagehide',save);
      window.removeEventListener('pointerdown',unlockAudio);
      window.removeEventListener('keydown',unlockAudio);
      document.removeEventListener('visibilitychange',visibility);
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      bubble.remove();
      for (const {element} of roomLabels) element.remove();
    },
    displayTypes(room) { return world?.displays.types(room) ?? []; },
    gamePlayers() { return population?.game.players.size ?? 0; },
    employeeLife(id) {
      if(shared && !leading) return shared.snapshot?.actors.find(actor=>actor.id===id)?.life;
      return population?.living.snapshot(id);
    },
    sharedSnapshot() { return leading && population?.actors.length===12?population.capture():undefined; },
    sharedOffice(value) {
      if(!value)return;
      if(!value.leader || !leading || value.resume) restoreOffice(value);
      leading=value.leader;
      shared=value;
    },
    nearbyEmployee() {
      if (!characterActive()) return null;
      const from=character.root.position;
      let closest=null, distance=3;
      for (const actor of population.actors) {
        const to=actor.root.position;
        const range=Math.hypot(to.x-from.x,to.z-from.z);
        if (range>=distance || !character.canInteract(to)) continue;
        closest=actor.person.id;
        distance=range;
      }
      return closest;
    },
    interact(id,action) {
      if (!characterActive()) return 'Masuk ke mode Dika dulu.';
      if (shared && !leading) return 'Pegawai sedang dikendalikan oleh sesi Anshel lain. Gunakan sesi itu untuk interaksi.';
      const actor=population.actors.find(item=>item.person.id===id);
      if (!actor) return 'Pegawai belum tersedia.';
      if (action==='invite') return population.invite(actor,state);
      if (actor.root.position.distanceTo(character.root.position)>3.1 || !character.canInteract(actor.root.position))
        return 'Dekati '+actor.person.employee+' untuk mengobrol.';
      return population.chat(actor,state);
    },
    hasCharacter() { return Boolean(character); },
    partner(id) {
      const actor=population?.actors.find(item=>item.person.id===id);
      character?.setPartner(actor?.figure.getObjectByName('body-mesh') ?? null);
    },
    characterMode(enabled) {
      if (!character || enabled===characterActive()) return characterActive();
      if (enabled) {
        if (!character.enable(true,population.actors)) return false;
        following=null;
        cameraMove=null;
        controls.enabled=false;
        reset();
      } else {
        character.enable(false,population.actors);
        population.clearInteraction();
        controls.enabled=true;
        cancelPointer();
        movement.x=movement.y=0;
      }
      return enabled;
    },
    moveCharacter(x,y) { movement.x=x; movement.y=y; },
    voice(enabled) { voice.enable(enabled); },
    spatialAudio(enabled) {
      sound.enable(enabled);
      if (enabled) unlockAudio();
    },
    suspend(value) {
      suspended=value;
      if (value) {
        save();
        voice.show(null);
        sound.clear();
        clearMouth();
      }
    },
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
      if (characterActive()) return false;
      if (following===id) { following=null; return false; }
      focusEmployee(id,true);
      return true;
    },
    isFollowing(id) { return following===id; },
    zoom(factor) {
      if (characterActive()) { chase.zoom(factor); return; }
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
