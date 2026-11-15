import * as THREE from 'three';
import { characterFigure, handGrip } from './employee-look.js';
import { model } from './world.js';
import { foodMenu, foodStop } from './layout.js';
import { fittedModel } from './district-models.js';

export const vehicleRoute=[[19,36],[8.5,36],[8.5,27.2],[9.2,25.4],[11.2,24.2],[15.9,24.2]];
export const roadRoutes=[[[-53,34.4],[53,34.4]],[[53,37.5],[-53,37.5]]];
export const guestStops={gate:[-1.8,29.7],delivery:[-1.8,22.4],visit:[-1.8,20.6]};
export function createFoodOrder(employee,food,state,active) {
  if (active || state?.phase!=='lunch' || !employee || ['home','home-sleep'].includes(employee.actual) ||
      busy(state,employee.person.id) || !foodMenu.includes(food)) return null;
  return {orderId:crypto.randomUUID(),id:employee.person.id,name:employee.person.employee,food,
    created:state.now ?? Date.now(),status:'Menunggu skuter'};
}
const busy=(state,id)=>{
  const person=state.people?.[id];
  return person?.executing || (person?.task?.status==='queued' && state.worker && state.capabilities?.includes(person.task.kind));
};
const mealCooldown=20*60_000;
const mealDecisionMin=24, mealDecisionRange=22;
const mealPreference=['Gado-gado','Nasi ayam','Nasi uduk','Gado-gado','Nasi ayam','Gado-gado',
  'Nasi uduk','Nasi uduk','Gado-gado','Nasi uduk','Nasi ayam','Nasi ayam'];

export function chooseFoodOrder(state,employees,needsFor,cooldowns,random=Math.random) {
  if (state?.phase!=='lunch') return null;
  for (const employee of employees) {
    const {id,index}=employee.person;
    if (!['seated','arrived'].includes(employee.stage) || state.now-(cooldowns[id] ?? -Infinity)<mealCooldown) continue;
    if (['home','home-sleep','pickup'].includes(employee.actual) || employee.foodTime>0) continue;
    const needs=needsFor(id);
    if (!needs || needs.energy>=60 || busy(state,id)) continue;
    const preferred=mealPreference[index];
    const chance=.012+(60-needs.energy)*.0014+(employee.actual==='snack'?.025:0);
    if (random()>=chance) continue;
    const food=foodMenu.includes(preferred)?preferred:foodMenu[0];
    const order=createFoodOrder(employee,food,state,false);
    if (order) return order;
  }
  return null;
}

export async function campusTraffic(scene,nav,onHandoff=()=>{},loadModel=model) {
  const geometry=new THREE.BoxGeometry(), material=new THREE.MeshStandardMaterial({roughness:.78});
  const car=new THREE.Group(), guest=new THREE.Group(), scooter=new THREE.Group(), rider=new THREE.Group();
  const roadCar=new THREE.Group(), opposingCar=new THREE.Group();
  scene.add(car,guest);
  scene.add(scooter,roadCar,opposingCar);
  function block(parent,color,x,y,z,w,h,d) {
    const mesh=new THREE.Mesh(geometry,material.clone());
    mesh.material.color.set(color);
    mesh.position.set(x,y,z); mesh.scale.set(w,h,d);
    mesh.castShadow=true;
    parent.add(mesh);
    return mesh;
  }
  const carFallback=new THREE.Group();
  car.add(carFallback);
  block(carFallback,'#17666b',0,.62,0,1.73,.57,3.58);
  block(carFallback,'#304657',0,1.06,-.2,1.42,.43,1.81);
  for (const x of [-.88,.88]) for (const z of [-1.09,1.06]) block(carFallback,'#18232a',x,.35,z,.19,.51,.61);
  for (const x of [-.59,.59]) block(carFallback,'#ffe3a5',x,.63,1.79,.30,.13,.06);
  const box=new THREE.Group();
  const boxFallback=block(box,'#b48954',0,-.12,0,.29,.24,.27);
  guest.add(box);
  box.position.set(.26,.91,.36);
  const garage=['sedan','van','delivery','garbage-truck'];
  const trafficModels=await Promise.allSettled(garage.map(name=>loadModel('district/'+name)));
  const carVariants=trafficModels.map((result,index)=>{
    if (result.status!=='fulfilled') return null;
    const vehicle=fittedModel(result.value,[1.8,index===0?1.38:1.9,3.9]);
    car.add(vehicle);
    vehicle.visible=false;
    return vehicle;
  });
  const roadVariants=trafficModels.slice(0,2).map(result=>{
    if (result.status!=='fulfilled') return null;
    const vehicle=fittedModel(result.value,[1.7,1.45,3.65]);
    roadCar.add(vehicle);
    return vehicle;
  });
  let packageModel;
  try {
    packageModel=await loadModel('district/cardboardboxclosed');
    const parcel=fittedModel(packageModel,[.29,.24,.27]);
    parcel.position.y=-.24;
    box.add(parcel);
    boxFallback.visible=false;
  } catch { /* Retain the procedural box when the GLB fails to load. */ }
  const wheel=new THREE.CylinderGeometry(.23,.23,.12,14).rotateZ(Math.PI/2);
  const helmetGeometry=new THREE.SphereGeometry(.23,12,8);
  for(const z of [-.59,.62]) {
    const tire=new THREE.Mesh(wheel,new THREE.MeshStandardMaterial({color:'#233037'}));
    tire.position.set(0,.24,z);
    scooter.add(tire);
  }
  block(scooter,'#38716a',0,.47,-.08,.36,.41,1.47);
  block(scooter,'#35454a',0,.73,-.24,.31,.14,.59);
  block(scooter,'#38716a',0,.74,.56,.37,.85,.20).rotation.x=-.18;
  block(scooter,'#31434a',0,1.09,.52,.53,.065,.075);
  block(scooter,'#f4d193',0,.92,.68,.29,.15,.06);
  const roadScooter=scooter.clone();
  roadScooter.scale.setScalar(.88);
  roadCar.add(roadScooter);
  roadVariants.push(null);
  block(scooter,'#dc9050',0,.98,-.76,.51,.49,.45);
  scooter.add(rider);
  let mixer,idle,walk,action,figure,drive,reach,helmet,body,originalMaterial;
  let courierHand;
  try {
    const asset=await loadModel('people/character-male-e');
    figure=characterFigure(asset,{asset:'male-e',stature:1.59});
    guest.add(figure);
    mixer=new THREE.AnimationMixer(figure);
    idle=mixer.clipAction(asset.animations.find(clip=>clip.name==='idle'));
    walk=mixer.clipAction(asset.animations.find(clip=>clip.name==='walk'));
    const mounted=asset.animations.find(clip=>clip.name==='drive' || clip.name==='sit');
    drive=mounted?mixer.clipAction(mounted):idle;
    helmet=new THREE.Mesh(helmetGeometry,new THREE.MeshStandardMaterial({color:'#276259'}));
    helmet.scale.set(1.12,.87,1.06);
    body=figure.getObjectByName('body-mesh');
    courierHand=body.skeleton.getBoneByName('arm-right');
    const armTrack=idle.getClip().tracks.find(track=>track.name==='arm-right.quaternion');
    if (armTrack) {
      const axis=new THREE.Vector3(1,0,0), flex=new THREE.Quaternion();
      const rest=new THREE.Quaternion().fromArray(armTrack.values);
      const values=[-.42,-1.05,-1.05,-.42].flatMap(angle=>flex.setFromAxisAngle(axis,angle).multiply(rest).toArray());
      reach=mixer.clipAction(new THREE.AnimationClip('courier-reach',1.1,[
        new THREE.QuaternionKeyframeTrack(armTrack.name,[0,.31,.78,1.1],values),
      ]));
    }
    const head=body.skeleton.getBoneByName('head');
    if (head) {
      const unit=asset.size.y/1.59;
      helmet.geometry.scale(unit,unit,unit);
      helmet.position.set(0,.23*unit,.015*unit);
      head.add(helmet);
    } else {
      helmet.position.set(0,asset.size.y*.86,0);
      figure.add(helmet);
    }
    helmet.visible=false;
    originalMaterial=body?.material;
    action=idle; idle.play();
  } catch { box.visible=false; }
  let roadRiderMixer;
  try {
    const asset=await loadModel('people/character-male-b');
    const driver=characterFigure(asset,{asset:'male-b',stature:1.59});
    const clip=asset.animations.find(item=>item.name==='drive' || item.name==='sit');
    if (clip) {
      driver.position.set(0,.72,-.13);
      roadScooter.add(driver);
      roadRiderMixer=new THREE.AnimationMixer(driver);
      roadRiderMixer.clipAction(clip).play();
      roadRiderMixer.update(.25);
      roadVariants[2]=roadScooter;
    }
  } catch { /* Remaining road vehicles are still available. */ }
  roadScooter.visible=false;
  const opposingVariants=roadVariants.map(variant=>{
    if (!variant || variant===roadScooter) return null;
    const copy=variant.clone();
    opposingCar.add(copy);
    return copy;
  });
  const trafficLanes=[{root:roadCar,variants:roadVariants,slot:null,trip:null},
    {root:opposingCar,variants:opposingVariants,slot:null,trip:null}];
  const roots=[car,guest,scooter,roadCar,opposingCar];
  let cycle='', vehicle=null, pedestrian=null, lastTime=0, order=null, lastOrder='', scooterTrip=null, requested=null;
  let following=false, remoteActive=false;
  let decisionTime=mealDecisionMin, cooldowns={};
  const hand=new THREE.Vector3(), targetHand=new THREE.Vector3();
  function play(next) {
    if (next===action) return;
    action.fadeOut(.16); next.reset().fadeIn(.16).play(); action=next;
  }
  function endOrder() {
    scooter.visible=guest.visible=false;
    order=pedestrian=scooterTrip=null;
    if (body && body.material!==originalMaterial) { body.material.dispose(); body.material=originalMaterial; }
    helmet.visible=false;
    guest.add(figure);
    figure.position.set(0,0,0);
  }
  function dressCourier() {
    if (!body || !originalMaterial || Array.isArray(originalMaterial) || body.material!==originalMaterial) return;
    body.material=originalMaterial.clone();
    body.material.color?.set('#39816b');
  }
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
  function gateTraffic(root,trip) {
    const next=trip.route[trip.index];
    if (!next) return [];
    const blockers=[];
    for (const lane of trafficLanes) {
      if (!lane.root.visible) continue;
      const edge=lane.trip?.route[0][1];
      const current=root.position.z;
        const crosses=(next[1]-edge)*(current-edge)<=0;
      if (crosses && Math.abs(current-edge)>.9) blockers.push(lane.root);
    }
    return blockers;
  }
  for (const root of roots) root.visible=false;
  return {
    roots,
    obstacles:[{root:car,radius:2.1},{root:guest,radius:.72},{root:scooter,radius:1.12},
      {root:roadCar,radius:2.1},{root:opposingCar,radius:2.1}],
    pickup() { return order?.status==='Menunggu pengambilan'?order.id:null; },
    handingOff() { return order?.status==='Menunggu pengambilan' && order.handoff>0; },
    courierActive() { return Boolean(order) || remoteActive; },
    snapshot() {
      return {status:this.status(),active:Boolean(order),mounted:figure?.parent===rider,
        poses:roots.map(root=>[root.visible,root.position.x,root.position.z,
          Math.atan2(Math.sin(root.rotation.y),Math.cos(root.rotation.y))]),parcel:box.visible,
        variant:carVariants.findIndex(item=>item?.visible),roadVariant:roadVariants.findIndex(item=>item?.visible),
        opposingVariant:opposingVariants.findIndex(item=>item?.visible),
        delivery:{order,requested,lastOrder,cooldowns,decisionTime,elapsed:order?lastTime:0,
          drive:order?scooterTrip:null,walk:order?pedestrian:null,parcelPosition:box.position.toArray()}};
    },
    follow(value,delta) {
      following=true;
      if (order) endOrder();
      requested=vehicle=pedestrian=null;
      remoteActive=Boolean(value?.active);
      if (!value) {
        for (const root of roots) root.visible=false;
        box.visible=false;
        return;
      }
      lastOrder=value.status;
      roots.forEach((root,index)=>{
        if (!value.poses[index]) { root.visible=false; return; }
        const [visible,x,z,angle]=value.poses[index];
        const blend=delta<=0 || !root.visible || Math.hypot(root.position.x-x,root.position.z-z)>14?1:1-Math.exp(-delta*3);
        root.visible=visible;
        root.position.x=THREE.MathUtils.lerp(root.position.x,x,blend);
        root.position.z=THREE.MathUtils.lerp(root.position.z,z,blend);
        const heading=angle-root.rotation.y;
        root.rotation.y+=Math.atan2(Math.sin(heading),Math.cos(heading))*blend;
      });
      for(const [index,variant] of carVariants.entries()) if(variant) variant.visible=index===value.variant;
      carFallback.visible=!carVariants[value.variant];
      for(const [index,variant] of roadVariants.entries()) if(variant) variant.visible=index===value.roadVariant;
      for(const [index,variant] of opposingVariants.entries()) if(variant) variant.visible=index===value.opposingVariant;
      box.visible=value.parcel;
      if (figure) {
        const parent=value.mounted?rider:guest;
        if (figure.parent!==parent) parent.add(figure);
        figure.position.set(0,value.mounted?.72:0,value.mounted?-.13:0);
        const mount=value.delivery?.order?.mount;
        if (mount) poseMount(mount);
        helmet.visible=value.active;
        if (value.active) dressCourier();
        else if (body && body.material!==originalMaterial) { body.material.dispose(); body.material=originalMaterial; }
        if (value.delivery) box.position.fromArray(value.delivery.parcelPosition);
        play(mount?(mount.entering?idle:reach ?? idle):value.mounted?drive:
          value.delivery?.order?.handoff>0 && reach?reach:guest.visible?walk:idle);
        mixer.update(delta);
      }
      if (roadScooter.visible) roadRiderMixer?.update(delta);
    },
    resume(value) {
      if (!value) return;
      this.follow(value,0);
      following=remoteActive=false;
      for (const lane of trafficLanes) { lane.trip=null; lane.root.visible=false; }
      car.visible=false;
      const delivery=value.delivery;
      if (!delivery || !mixer) { scooter.visible=guest.visible=box.visible=false; return; }
      ({order,requested,lastOrder,cooldowns,decisionTime}=structuredClone(delivery));
      scooterTrip=delivery.drive && structuredClone(delivery.drive);
      pedestrian=delivery.walk && structuredClone(delivery.walk);
      lastTime=delivery.elapsed;
      if (!order) guest.visible=scooter.visible=box.visible=false;
    },
    status() {
      const active=order ?? requested;
      return active?active.food+' · '+active.name+' · '+active.status:lastOrder;
    },
    request(id,food,state,employees) {
      if (state?.phase!=='lunch') return 'Pesan makan tersedia saat jam istirahat.';
      if (!mixer || order || requested) return 'Kurir belum tersedia.';
      const employee=employees.find(actor=>actor.person.id===id);
      requested=createFoodOrder(employee,food,state,order || requested);
      if (!requested) return 'Pilih makanan dan pegawai yang tersedia.';
      cooldowns[id]=requested.created;
      return null;
    },
    update(delta,state,people,employees,needsFor) {
      if (!state || state.phase==='paused') return;
      if (following) {
        following=remoteActive=false;
        for (const lane of trafficLanes) lane.trip=null;
        for (const root of roots) root.visible=false;
        box.visible=false;
      }
      const now=state.now ?? Date.now();
      if (mixer && needsFor && !requested && !order && state.phase==='lunch' && (decisionTime-=delta)<=0) {
        decisionTime=mealDecisionMin+Math.random()*mealDecisionRange;
        requested=chooseFoodOrder({...state,now},employees,needsFor,cooldowns);
        if (requested) cooldowns[requested.id]=now;
      }
      const hour=new Date(now+7*3600000).getUTCHours();
      const quiet=hour>=21 || hour<6;
      const rush=(hour>=7 && hour<9) || (hour>=16 && hour<18);
      for (const [index,lane] of trafficLanes.entries()) {
        const period=quiet?240000:rush?32000:65000;
        const slot=Math.floor((now+index*period*.27)/period);
        const [start,end]=roadRoutes[index];
        if (!lane.trip && slot!==lane.slot && (!quiet || (slot+index)%3===0) && !jam(people,...start,2.3)) {
          lane.slot=slot;
          const choices=lane.variants.filter(Boolean);
          const selected=choices[slot%choices.length];
          if (selected) {
            lane.variants.forEach(variant=>{if (variant) variant.visible=variant===selected;});
            lane.trip=begin(lane.root,[start,end]);
            lane.trip.radius=selected===roadScooter?1.1:2.3;
            lane.root.rotation.y=index?-Math.PI/2:Math.PI/2;
          }
        }
        if (!lane.trip) continue;
        // Cross-traffic already inside the lane clears it before the next car proceeds.
        const crossing=[car,scooter].filter(root=>Math.abs(root.position.z-start[1])<=.9);
        const blocked=jam(crossing,lane.root.position.x,lane.root.position.z,3.1);
        const moving=!blocked && move(lane.root,lane.trip,delta,index?5.5:6.2,lane.trip.radius,people);
        lane.trip.wait=moving?0:lane.trip.wait+delta;
        if (lane.root===roadCar && roadScooter.visible) roadRiderMixer?.update(delta);
        if (lane.trip.index>=lane.trip.route.length || lane.trip.wait>30) { lane.trip=null; lane.root.visible=false; }
      }
      const key=Math.floor((now+7*3600000)/180000)+':'+state.phase;
      if (requested && (state.phase!=='lunch' || busy(state,requested.id) || now-requested.created>180000)) {
        lastOrder=requested.food+' · Pesanan dibatalkan karena jadwal atau tugas';
        requested=null;
      }
      if (requested && !order && !vehicle && !pedestrian && !jam([...people,roadCar,opposingCar],...vehicleRoute[0],1.5)) {
          cycle=key;
          order={...requested,status:'Kurir Saji Kampung menuju kantor'};
          requested=null;
          scooterTrip=begin(scooter,vehicleRoute);
          scooter.rotation.y=-Math.PI/2;
          rider.add(figure);
          figure.position.set(0,.72,-.13);
          helmet.visible=true;
          dressCourier();
          play(drive);
          lastTime=0;
      }
      if (order) {
        if ((lastTime+=delta)>145) {
          lastOrder=order.food+' · '+order.name+' · '+(order.delivered?'Diserahkan':'Rute terhambat');
          endOrder();
          return;
        }
        const park=vehicleRoute.at(-1);
        if (order.mount) {
          const {entering}=order.mount;
          order.mount.time=Math.min(.9,order.mount.time+delta);
          const amount=poseMount(order.mount);
          if (!entering && amount>.62) {
            box.visible=true;
            scooter.localToWorld(hand.set(0,.98,-.76));
            guest.worldToLocal(hand);
            box.position.copy(hand.lerp(targetHand.set(.26,.91,.36),(amount-.62)/.38));
          }
          if (amount===1) {
            delete order.mount;
            if (entering) {
              play(drive);
              scooterTrip={route:vehicleRoute.slice().reverse(),index:1,wait:0,returning:true};
            } else {
              guest.add(figure);
              figure.position.set(0,0,0);
              scooterTrip=null;
              order.status='Kurir berjalan ke teras';
              play(walk);
            }
          }
          mixer.update(delta);
          return;
        }
        if (scooterTrip) {
          move(scooter,scooterTrip,delta,3.5,1.08,people.concat(gateTraffic(scooter,scooterTrip)));
          if (scooterTrip.index>=scooterTrip.route.length) {
            if (scooterTrip.returning) {
              endOrder();
            } else {
              scooterTrip=null;
              const dismount=[park[0],park[1]-.95];
              const path=nav.route(dismount,guestStops.delivery);
              if (path) {
                pedestrian=begin(guest,[dismount,...path]);
                guest.rotation.y=scooter.rotation.y;
                order.status='Kurir turun dan mengambil paket';
                order.mount={entering:false,time:0};
                play(reach ?? idle);
              } else {
                lastOrder=order.food+' · Jalur teras tidak tersedia';
                order.status='Jalur teras tidak tersedia';
                scooterTrip={route:vehicleRoute.slice().reverse(),index:1,wait:0,returning:true};
              }
            }
          }
        } else if (pedestrian) {
          const walking=move(guest,pedestrian,delta,1.70,.64,people);
          if (walking || !order.handoff) play(walking?walk:idle);
          if (pedestrian.index>=pedestrian.route.length) {
            if (pedestrian.returning) {
              guest.visible=false; box.visible=false; pedestrian=null;
              rider.add(figure); figure.position.set(.95,0,0);
              if (!order.delivered) order.status='Pengambilan terlewat · Kurir kembali';
              order.mount={entering:true,time:0};
              play(idle);
            } else {
              order.status='Menunggu pengambilan';
              pedestrian.wait+=delta;
              const receiver=employees.find(actor=>actor.person.id===order.id);
              const received=receiver?.actual==='pickup' && receiver.stage==='arrived' &&
                Math.hypot(receiver.root.position.x-foodStop[0],receiver.root.position.z-foodStop[1])<.25;
              order.handoff=received && !busy(state,order.id)?(order.handoff ?? 0)+delta:0;
              if (order.handoff>0) {
                if (reach) play(reach);
                guest.rotation.y=Math.atan2(receiver.root.position.x-guest.position.x,receiver.root.position.z-guest.position.z);
                guest.updateMatrixWorld();
                if (courierHand) handGrip(courierHand,-1,hand);
                else guest.localToWorld(hand.set(.26,.91,.36));
                if (receiver.hands?.[0]) handGrip(receiver.hands[0],1,targetHand);
                else receiver.root.localToWorld(targetHand.set(-.22,.9,.36));
                guest.worldToLocal(hand.lerp(targetHand,Math.min(1,order.handoff/.65)));
                box.position.copy(hand);
              }
              if (order.handoff>=.65 || pedestrian.wait>70) {
                order.delivered=order.handoff>=.65;
                if (order.delivered) onHandoff(order.id,packageModel);
                box.visible=false;
                lastOrder=order.food+' · '+order.name+' · '+(order.delivered?'Diserahkan':'Pengambilan terlewat');
                order.status=order.delivered?'Pesanan diserahkan':'Pengambilan terlewat';
                pedestrian={...pedestrian,index:1,route:pedestrian.route.slice().reverse(),returning:true};
              }
            }
          }
          mixer.update(delta);
          if (box.visible && !order.handoff && courierHand) {
            handGrip(courierHand,-1,hand);
            box.position.copy(guest.worldToLocal(hand));
          }
          return;
        }
        mixer.update(delta);
        return;
      }
      if (key!==cycle && !vehicle && !pedestrian && ['arrival','open','work','review'].includes(state.phase)) {
        cycle=key;
        if (!jam(people,...vehicleRoute[0],2.5)) {
          const chosen=Math.floor(now/180000)%carVariants.length;
          carVariants.forEach((variant,index)=>{if (variant) variant.visible=index===chosen;});
          carFallback.visible=!carVariants[chosen];
          vehicle=begin(car,vehicleRoute);
          car.rotation.y=-Math.PI/2;
        }
        const path=nav.route(guestStops.gate,guestStops.visit);
        if (mixer && path && !jam(people,...guestStops.gate,.85)) {
          pedestrian=begin(guest,[guestStops.gate,...path]);
          box.visible=false;
        }
        lastTime=0;
      }
      lastTime+=delta;
      if (vehicle) {
        const moving=move(car,vehicle,delta,vehicle.returning?1.9:2.7,2.3,people.concat(guest,gateTraffic(car,vehicle)));
        if (vehicle.index<vehicle.route.length) {
          vehicle.wait=moving?0:vehicle.wait+delta;
          if (!vehicle.returning && vehicle.wait>15) {
            vehicle={route:[[car.position.x,car.position.z],...vehicle.route.slice(0,vehicle.index).reverse()],
              index:1,wait:0,returning:true};
          }
        }
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
            if (pedestrian.wait>3) pedestrian={...pedestrian,route:pedestrian.route.slice().reverse(),index:1,returning:true};
          }
        }
      }
      if (lastTime>95 && pedestrian) { pedestrian=null; guest.visible=false; }
    },
    dispose() {
      mixer?.stopAllAction();
      roadRiderMixer?.stopAllAction();
      for (const root of roots) root.removeFromParent();
      for (const root of [car,guest,scooter]) root.traverse(mesh=>{
        if ([geometry,wheel,helmetGeometry].includes(mesh.geometry)) mesh.material.dispose();
      });
      geometry.dispose(); wheel.dispose(); helmetGeometry.dispose(); material.dispose();
    },
  };
  function poseMount(mount) {
    const amount=THREE.MathUtils.smoothstep(mount.time,0,.9);
    const offset=mount.entering?1-amount:amount;
    figure.position.set(.95*offset,.72*(1-offset),-.13*(1-offset));
    return amount;
  }
}
