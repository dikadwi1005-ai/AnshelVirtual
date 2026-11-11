import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { layout } from './layout.js';
import { routeBetween } from './behavior.js';

const rigFiles = [
  'female-a','male-b','female-c','female-d','male-a','female-e',
  'male-d','female-f','male-c','female-b','male-e','male-f',
];

const modelLoader = new GLTFLoader();
const models = new Map();

function asset(path) {
  if (!models.has(path)) models.set(path, modelLoader.loadAsync('/models/'+path+'.glb').then(gltf => {
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      if (node.material.isMeshBasicMaterial) {
        const material = node.material;
        node.material = new THREE.MeshStandardMaterial({
          color:material.color, map:material.map, transparent:material.transparent,
          opacity:material.opacity, side:material.side, roughness:.82,
        });
      }
      if (path.startsWith('nature/')) node.material.metalness = 0;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    return { ...gltf, bounds, size:bounds.getSize(new THREE.Vector3()) };
  }).catch(error => { models.delete(path); throw error; }));
  return models.get(path);
}

const furniture = {
  desk:['desk',2.42], corner:['deskcorner',2.43], chair:['chairdesk',1.03], seat:['chairmoderncushion',.87],
  monitor:['computerscreen',.99], keyboard:['computerkeyboard',.66], laptop:['laptop',1.04],
  couch:['loungesofa',2.95], lounge:['loungechair',1.22], coffeeTable:['tablecoffee',1.76],
  round:['tableround',2.4], long:['table',3.35], shelf:['bookcaseopen',1.58], books:['books',.58],
  plant:['pottedplant',.74], succulent:['plantsmall2',.44], counter:['kitchenbar',2.0],
  coffee:['kitchencoffeemachine',.65], fridge:['kitchenfridgesmall',1.06], stool:['stoolbar',.75],
  tv:['televisionmodern',1.45], tvStand:['cabinettelevision',2.3], rug:['rugrectangle',3.75],
  lamp:['lamproundfloor',.66], wall:['wallwindow',3.82], divider:['wallhalf',3.06],
  toilet:['toilet',1.10], sink:['bathroomsink',1.35], bench:['benchcushion',1.85],
  arcade:['arcade/arcade-machine',1.01],
};

function normalized(model, width, height) {
  const {scene,bounds,size} = model;
  const object = scene.clone(true);
  const scale = width / Math.max(size.x,.01);
  const scaleY = height ? height / Math.max(size.y,.01) : scale;
  object.scale.set(scale,scaleY,scale);
  object.position.set(-(bounds.min.x+bounds.max.x)*scale/2,-bounds.min.y*scaleY,-(bounds.min.z+bounds.max.z)*scale/2);
  const group = new THREE.Group();
  group.add(object);
  return group;
}

function box(parent, size, position, color) {
  const item = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({color,roughness:.9}));
  item.position.set(...position);
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function placeRoom(group, room) {
  const {x,z,type,color} = room;
  const shapes = [];
  const put = (name,dx,dz,y=0,angle=0,height) => shapes.push({name,x:x+dx,z:z+dz,y,angle,height});
  box(group,[7.7,.11,5.75],[x,0,z],color);
  // Put the rear wall on the far edge only. The near side stays open to the camera.
  if (z < 0) {
    for (const dx of [-1.92,1.92]) put('wall',dx,-2.78,.055,0,2.2);
    put('divider',-3.8,-1.28,.055,Math.PI/2,.77);
  }
  if (type === 'office' || type === 'executive') {
    const specialty = room.person?.id;
    put(type === 'executive' ? 'corner':'desk',0,-.90,.055,0,1.03);
    put(specialty === 'social' ? 'laptop' : 'monitor',-.32,-1.04,1.086);
    if (specialty !== 'social') put('keyboard',-.31,-.58,1.086);
    put(specialty === 'qa' || specialty === 'development' ? 'monitor' : 'succulent',.71,-1.08,1.086);
    put('chair',0,.35,.055,Math.PI,.88);
    put('shelf',-2.65,-1.85,.055);
    put('plant',2.8,-1.93,.055);
    put(type === 'executive' ? 'bench' : 'lounge',2.49,1.58,.055,-Math.PI/2);
    if (specialty === 'video') {
      put('tvStand',-2.23,.9,.055);
      put('tv',-2.23,.9,.79);
    } else if (['administration','research','finance'].includes(specialty)) {
      put('coffeeTable',-2.15,.88,.055);
      put('books',-2.23,.85,.75);
    }
  } else if (type === 'pantry') {
    put('counter',-.2,.99,.055);
    put('coffee',.2,.96,1.97,Math.PI);
    put('fridge',-2.7,1.48,.055,Math.PI);
    put('round',2.05,.65,.055);
    put('stool',2.02,1.84,.055);
    put('stool',3.18,.52,.055);
    put('plant',2.8,-1.86,.055);
  } else if (['reception','relaxation','gaming'].includes(type)) {
    put('rug',0,.18,.057);
    put('couch',-.2,1.55,.065,Math.PI,1.02);
    put('coffeeTable',-2.3,.55,.064);
    put('lounge',2.8,1.55,.055,Math.PI);
    put('plant',-2.84,-1.8,.055);
    if (type === 'gaming' || type === 'reception') {
      for (const offset of [-2.75,-1.56,1.56,2.75]) put('arcade',offset,-.2,.055,Math.PI);
    } else {
      put('lamp',2.7,-1.77,.055);
      put('shelf',0,-1.85,.055);
    }
  } else if (type === 'meeting') {
    put('long',.1,.12,.055);
    for (const dx of [-1.03,.75]) {
      put('seat',dx,-.85,.055,Math.PI);
      put('seat',dx,1.05,.055);
    }
    put('plant',2.8,-1.75,.055);
    put('plant',-2.8,-1.75,.055);
  } else if (type === 'restroom') {
    put('toilet',1.4,-1.55,.055);
    put('sink',-1.48,-1.55,.055);
    put('divider',0,-1.65,.055,Math.PI/2,1.6);
  } else if (type === 'garden') {
    put('bench',0,1.65,.055,Math.PI);
    put('plant',2.7,-1.8,.055);
    put('plant',-2.7,-1.8,.055);
    put('round',2.35,-.5,.055);
  }
  return shapes;
}

function targetFor(person, activity, rooms) {
  const own = rooms.find(room => room.id === person.id);
  const rank = person.index%4;
  const rest = rooms.find(room => ['relaxation','reception','garden'].includes(room.type));
  const coffee = rooms.find(room => room.type === 'pantry');
  const gaming = rooms.find(room => room.type === 'gaming');
  const isGroup = ['rest','talk','arcade'].includes(activity);
  const room = activity === 'coffee' ? coffee ?? own : isGroup ? (activity === 'arcade' ? gaming ?? rest : rest) ?? own : own;
  const offsets = [-1.10,-.39,.32,1.03];
  if (room === own) return {
    room:own.id,x:own.x,z:own.z+.35,angle:Math.PI,clip:activity === 'coffee' ? 'interact-right' : 'sit',
  };
  if (room === coffee) return {room:room.id,x:room.x+offsets[rank],z:room.z-.03,angle:0,clip:'interact-right'};
  if (activity === 'arcade') return {room:room.id,x:room.x+[-2.75,-1.56,1.56,2.75][rank],z:room.z-1.22,angle:0,clip:'interact-right'};
  const talking = activity === 'talk';
  const side = talking ? .62 : 1.49;
  return {
    room:room.id,x:room.x+offsets[rank]*.74,z:room.z+side,
    angle:talking ? (rank%2 ? -Math.PI/2 : Math.PI/2) : Math.PI,
    clip:talking ? 'emote-yes' : 'sit',
  };
}

function disposeFloor(group) {
  group.traverse(object => {
    if (object.userData.temporary) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
  group.removeFromParent();
}

export function officeScene(host, labels, onSelect, onMessage) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dceae0');
  const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Model kantor 3D. Gunakan tombol lantai dan kamera untuk navigasi.');

  const camera = new THREE.OrthographicCamera(-17,17,11,-11,.1,190);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping = true;
  controls.minZoom = .65;
  controls.maxZoom = 3;
  controls.maxPolarAngle = Math.PI*.46;
  controls.minPolarAngle = .25;
  controls.enablePan = true;

  const light = new THREE.DirectionalLight('#fff0d5',3.7);
  light.position.set(-16,25,12);
  light.castShadow = true;
  light.shadow.mapSize.set(2048,2048);
  Object.assign(light.shadow.camera,{left:-26,right:26,top:22,bottom:-22,near:.5,far:70});
  light.shadow.normalBias = .035;
  scene.add(light,new THREE.HemisphereLight('#f7fff9','#718d77',2.15));

  box(scene,[240,.2,240],[0,-1.28,0],'#cadfd3');
  const grid = new THREE.GridHelper(100,50,'#b3cdbf','#b9d1c3');
  grid.position.y = -1.166;
  scene.add(grid);

  let floorGroup, generation = 0, employees = [], roomLabels = [], activeFloor = -1;
  let state = null, follow = null, selected = null;
  const temp = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const viewport = new THREE.Vector2();
  let start = null;

  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    const aspect = width/height;
    const vertical = Math.max(10.8,19.8/aspect);
    camera.left = -vertical*aspect;
    camera.right = vertical*aspect;
    camera.top = vertical;
    camera.bottom = -vertical;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  }
  new ResizeObserver(resize).observe(host);

  function reset() {
    follow = null;
    camera.position.set(18,25,26);
    controls.target.set(0,0,0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  }
  reset();
  resize();

  function markTemporary(group) {
    group.traverse(object => {
      if (object.isMesh) object.userData.temporary = true;
    });
  }

  async function loadFloor(floor) {
    if (activeFloor === floor) return;
    const version = ++generation;
    activeFloor = floor;
    if (floorGroup) disposeFloor(floorGroup);
    const group = floorGroup = new THREE.Group();
    employees = [];
    roomLabels = [];
    labels.replaceChildren();
    onMessage('Memuat lantai…');
    reset();
    const rooms = layout(floor);
    const rows = Object.fromEntries(rooms.map(room=>[room.id,room.z<0?-1.57:1.57]));
    box(group,[33.4,.65,16.2],[0,-.33,0],'#416657');
    box(group,[32.5,.17,15.4],[0,-.05,0],'#9ab9a4');
    box(group,[32.2,.035,2.65],[0,.059,0],'#d7dec3');
    for (const x of [-14,-10,-6,-2,2,6,10,14]) box(group,[2.8,.009,.03],[x,.083,0],'#b1c6ab');
    const allFurniture = rooms.flatMap(room => placeRoom(group,room));
    markTemporary(group);
    scene.add(group);

    const jobs = allFurniture.map(async item => {
      const [name,width] = furniture[item.name];
      const model = await asset(name.includes('/') ? name : 'furniture/'+name);
      if (version !== generation) return;
      const object = normalized(model,width,item.height);
      object.position.set(item.x,item.y,item.z);
      object.rotation.y = item.angle;
      group.add(object);
    });
    const landscaping = [
      [-14.4,-5.8,'tree-small',1.55], [14.4,5.7,'tree-default',2.44],
      [-13.2,5.9,'tree-tall',1.6], [13.1,6.47,'tree-small',1.38],
    ];
    for (const [x,z,name,width] of landscaping) jobs.push(asset('nature/'+name).then(model=>{
      if (version !== generation) return;
      const object = normalized(model,width);
      object.position.set(x,.056,z);
      group.add(object);
    }));
    for (const room of rooms) {
      const element = document.createElement('button');
      element.className = 'room-label';
      element.type = 'button';
      element.textContent = room.name;
      element.addEventListener('click',()=>onSelect(room.person?.id ?? null,room.id));
      labels.append(element);
      roomLabels.push({element,room});
      if (!room.person) continue;
      jobs.push(asset('people/character-'+rigFiles[room.person.index]).then(model=>{
        if (version !== generation) return;
        const figure = clone(model.scene);
        const height = 1.49;
        figure.scale.setScalar(height/model.size.y);
        const root = new THREE.Group();
        root.add(figure);
        root.userData.employee = room.id;
        const person = room.person;
        const plan = state?.people?.[person.id]?.activity ?? 'desk';
        const target = targetFor(person,plan,rooms);
        root.position.set(target.x,.075,target.z);
        root.rotation.y = target.angle;
        group.add(root);
        const mixer = new THREE.AnimationMixer(figure);
        const clips = new Map(model.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
        const unit = {root,person,rooms,rows,mixer,clips,path:[],activity:plan,current:null};
        changeClip(unit,target.clip);
        employees.push(unit);
      }));
    }
    const results = await Promise.allSettled(jobs);
    if (version !== generation) return;
    const errors = results.filter(result=>result.status==='rejected');
    if (errors.length) console.error('Model gagal dimuat:',errors.map(result=>result.reason));
    onMessage(errors.length ? errors.length+' model gagal dimuat.' : '');
  }

  function changeClip(unit, name) {
    const action = unit.clips.get(name) ?? unit.clips.get('idle');
    if (!action || unit.current === action) return;
    if (name === 'walk') action.setEffectiveTimeScale(1.2);
    unit.current?.fadeOut(.19);
    action.reset().setEffectiveWeight(1).fadeIn(.19).play();
    unit.current = action;
  }

  function advance(unit, delta) {
    const desired = state?.people?.[unit.person.id]?.activity ?? 'desk';
    const target = targetFor(unit.person,desired,unit.rooms);
    const {root} = unit;
    if (desired !== unit.activity) {
      const {x,z} = root.position;
      const containingRoom = unit.rooms.find(room=>Math.abs(x-room.x)<3.85 && Math.abs(z-room.z)<3.15);
      const from = {x,z,room:containingRoom?.id};
      const lane = -.76 + (unit.person.index%4)*.5;
      unit.path = routeBetween(from,target,unit.rows,lane);
      unit.activity = desired;
    }
    if (state?.phase === 'paused') return;
    const waypoint = unit.path[0];
    if (!waypoint) {
      const turn = Math.atan2(Math.sin(target.angle-root.rotation.y),Math.cos(target.angle-root.rotation.y));
      root.rotation.y += turn*Math.min(1,delta*9);
      changeClip(unit,target.clip);
      unit.mixer.update(delta);
      return;
    }
    const dx = waypoint[0]-root.position.x, dz = waypoint[1]-root.position.z;
    const length = Math.hypot(dx,dz);
    const step = Math.min(length,delta*1.85);
    if (length < .035) {
      unit.path.shift();
      return;
    }
    root.position.x += step*dx/length;
    root.position.z += step*dz/length;
    const turn = Math.atan2(Math.sin(Math.atan2(dx,dz)-root.rotation.y),Math.cos(Math.atan2(dx,dz)-root.rotation.y));
    root.rotation.y += turn*Math.min(1,delta*10);
    changeClip(unit,'walk');
    unit.mixer.update(delta);
  }

  renderer.domElement.addEventListener('pointerdown',event=>{start = [event.clientX,event.clientY];});
  renderer.domElement.addEventListener('pointerup',event=>{
    if (!start || Math.hypot(start[0]-event.clientX,start[1]-event.clientY)>5) return;
    const rect = host.getBoundingClientRect();
    viewport.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
    ray.setFromCamera(viewport,camera);
    // Animated skinned bounds can be stale. Use a pick capsule centered on each actor.
    const candidate = employees.map(unit=>{
      temp.copy(unit.root.position).y += .67;
      return {unit,distance:ray.ray.distanceSqToPoint(temp)};
    }).filter(item=>item.distance<.51**2).sort((a,b)=>a.distance-b.distance)[0];
    if (candidate) onSelect(candidate.unit.person.id);
  });

  let lastFrame = performance.now();
  renderer.setAnimationLoop(now=>{
    const delta = Math.min((now-lastFrame)/1000,.06);
    lastFrame = now;
    if (!host.clientWidth || document.hidden) return;
    for (const unit of employees) advance(unit,delta);
    const followed = employees.find(unit=>unit.person.id===follow);
    if (followed) {
      temp.copy(followed.root.position).sub(controls.target).multiplyScalar(Math.min(1,delta*2.8));
      controls.target.add(temp);
      camera.position.add(temp);
    }
    controls.update();
    const dark = state?.phase === 'closed';
    light.intensity = THREE.MathUtils.lerp(light.intensity,dark ? 2.25 : 3.7,delta);
    renderer.render(scene,camera);
    for (const {element,room} of roomLabels) {
      temp.set(room.x,.14,room.z+2.7).project(camera);
      const x = (temp.x*.5+.5)*host.clientWidth, y = (.5-temp.y*.5)*host.clientHeight;
      element.style.left = x+'px';
      element.style.top = y+'px';
      element.hidden = x<26 || y<38 || x>host.clientWidth-26 || y>host.clientHeight-49;
      element.classList.toggle('selected',selected===room.id);
    }
  });

  return {
    loadFloor, reset,
    state(value) { state = value; },
    select(id) { selected = id; },
    moving(id) { return !!employees.find(unit=>unit.person.id===id)?.path.length; },
    follow(id) { follow = follow === id ? null : id; return follow; },
    zoom(factor) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,controls.maxZoom);
      camera.updateProjectionMatrix();
    },
    quality(low) {
      renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio,1.6));
      renderer.shadowMap.enabled = !low;
      resize();
    },
  };
}
