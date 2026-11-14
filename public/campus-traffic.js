import * as THREE from 'three';
import { characterFigure } from './employee-look.js';
import { model } from './world.js';

export const vehicleRoute=[[8.5,33],[8.5,27.2],[9.2,25.4],[11.2,24.2],[15.9,24.2]];
export const guestStops={gate:[-1.8,29.7],delivery:[-1.8,22.4],visit:[-4.5,20.6]};

export async function campusTraffic(scene,nav) {
  const geometry=new THREE.BoxGeometry(), material=new THREE.MeshStandardMaterial({roughness:.78});
  const car=new THREE.Group(), guest=new THREE.Group();
  scene.add(car,guest);
  function block(parent,color,x,y,z,w,h,d) {
    const mesh=new THREE.Mesh(geometry,material.clone());
    mesh.material.color.set(color);
    mesh.position.set(x,y,z); mesh.scale.set(w,h,d);
    mesh.castShadow=true;
    parent.add(mesh);
    return mesh;
  }
  block(car,'#17666b',0,.62,0,1.73,.57,3.58);
  block(car,'#304657',0,1.06,-.2,1.42,.43,1.81);
  for (const x of [-.88,.88]) for (const z of [-1.09,1.06]) block(car,'#18232a',x,.35,z,.19,.51,.61);
  for (const x of [-.59,.59]) block(car,'#ffe3a5',x,.63,1.79,.30,.13,.06);
  const box=block(guest,'#b48954',.26,.91,.36,.35,.26,.36);
  const delivered=block(scene,'#a77a47',-1.3,.16,21.93,.35,.26,.36);
  let mixer,idle,walk,action;
  try {
    const asset=await model('people/character-male-d');
    const figure=characterFigure(asset,{asset:'male-d',stature:1.59});
    guest.add(figure);
    mixer=new THREE.AnimationMixer(figure);
    idle=mixer.clipAction(asset.animations.find(clip=>clip.name==='idle'));
    walk=mixer.clipAction(asset.animations.find(clip=>clip.name==='walk'));
    action=idle; idle.play();
  } catch { box.visible=false; }
  let cycle='', vehicle=null, pedestrian=null, lastTime=0;
  const jam=(people,x,z,radius)=>people.some(root=>root.visible && Math.hypot(root.position.x-x,root.position.z-z)<radius);
  function begin(root,route) {
    root.position.set(route[0][0],0,route[0][1]);
    root.visible=true;
    return {index:1,route,wait:0,returning:false};
  }
  function move(root,trip,delta,speed,radius,people) {
    const target=trip.route[trip.index];
    if (!target) return false;
    const dx=target[0]-root.position.x,dz=target[1]-root.position.z;
    const length=Math.hypot(dx,dz);
    if (length<.015) { trip.index++; return false; }
    const step=Math.min(length,speed*delta);
    const x=root.position.x+dx/length*step,z=root.position.z+dz/length*step;
    const angle=Math.atan2(dx,dz);
    const turn=Math.atan2(Math.sin(angle-root.rotation.y),Math.cos(angle-root.rotation.y));
    if (!nav.clear([root.position.x,root.position.z],[x,z],null,radius*.56) || jam(people,x,z,radius)) return false;
    root.rotation.y+=THREE.MathUtils.clamp(turn,-delta*6,delta*6);
    root.position.x=x; root.position.z=z;
    return true;
  }
  car.visible=guest.visible=delivered.visible=false;
  return {
    roots:[car,guest],
    obstacles:[{root:car,radius:2.1},{root:guest,radius:.78}],
    update(delta,state,people) {
      if (!state || state.phase==='paused') return;
      const now=state.now ?? Date.now();
      const key=Math.floor((now+7*3600000)/180000)+':'+state.phase;
      if (key!==cycle && !vehicle && !pedestrian && ['arrival','open','work','lunch','review'].includes(state.phase)) {
        cycle=key; delivered.visible=false;
        const delivery=state.phase==='lunch' || Math.floor(now/180000)%2===0;
        if (!jam(people,...vehicleRoute[0],2.5)) {
          vehicle=begin(car,vehicleRoute);
          car.rotation.y=Math.PI;
        }
        const path=nav.route(guestStops.gate,delivery?guestStops.delivery:guestStops.visit);
        if (mixer && path && !jam(people,...guestStops.gate,.85)) {
          pedestrian={...begin(guest,[guestStops.gate,...path]),delivery};
          box.visible=delivery;
        }
        lastTime=0;
      }
      lastTime+=delta;
      if (vehicle) {
        move(car,vehicle,delta,vehicle.returning?1.9:2.7,2.3,[...people,guest]);
        if (vehicle.index>=vehicle.route.length) {
          if (vehicle.returning) { car.visible=false; vehicle=null; }
          else if ((vehicle.wait+=delta)>8) vehicle={...vehicle,route:vehicle.route.slice().reverse(),index:1,returning:true};
        }
      }
      if (pedestrian) {
        const walking=move(guest,pedestrian,delta,1.75,.72,[...people,car]);
        const next=walking?walk:idle;
        if (next!==action) { action.fadeOut(.15); next.reset().fadeIn(.15).play(); action=next; }
        mixer.update(delta);
        if (pedestrian.index>=pedestrian.route.length) {
          if (pedestrian.returning) { guest.visible=false; pedestrian=null; }
          else {
            pedestrian.wait+=delta;
            if (pedestrian.delivery && pedestrian.wait>1) { box.visible=false; delivered.visible=true; }
            if (pedestrian.wait>3) pedestrian={...pedestrian,route:pedestrian.route.slice().reverse(),index:1,returning:true};
          }
        }
      }
      if (lastTime>95) { vehicle=pedestrian=null; car.visible=guest.visible=delivered.visible=false; }
    },
    dispose() {
      mixer?.stopAllAction();
      for (const root of [car,guest,delivered]) root.removeFromParent();
      for (const root of [car,guest,delivered]) root.traverse(mesh=>{if (mesh.geometry===geometry) mesh.material.dispose();});
      geometry.dispose(); material.dispose();
    },
  };
}
