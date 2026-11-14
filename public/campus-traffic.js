import * as THREE from 'three';
import { characterFigure } from './employee-look.js';
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

export async function campusTraffic(scene,nav,onHandoff=()=>{},loadModel=model) {
  const geometry=new THREE.BoxGeometry(), material=new THREE.MeshStandardMaterial({roughness:.78});
  const car=new THREE.Group(), guest=new THREE.Group(), scooter=new THREE.Group(), rider=new THREE.Group();
  const roadCar=new THREE.Group();
  scene.add(car,guest);
  scene.add(scooter,roadCar);
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
  let mixer,idle,walk,action,figure,drive,helmet,body,originalMaterial;
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
  let cycle='', vehicle=null, pedestrian=null, lastTime=0, order=null, lastOrder='', scooterTrip=null, requested=null;
  let following=false, remoteActive=false;
  let roadTrip=null, roadCycle=-1;
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
  car.visible=guest.visible=scooter.visible=roadCar.visible=false;
  return {
    roots:[car,guest,scooter,roadCar],
    obstacles:[{root:car,radius:2.1},{root:guest,radius:.72},{root:scooter,radius:1.12},{root:roadCar,radius:2.1}],
    pickup() { return order?.status==='Menunggu pengambilan'?order.id:null; },
    handingOff() { return order?.status==='Menunggu pengambilan' && order.handoff>0; },
    courierActive() { return Boolean(order) || remoteActive; },
    snapshot() {
      return {status:this.status(),active:Boolean(order),mounted:figure?.parent===rider,
        poses:[car,guest,scooter,roadCar].map(root=>[root.visible,root.position.x,root.position.z,
          Math.atan2(Math.sin(root.rotation.y),Math.cos(root.rotation.y))]),parcel:box.visible,
        variant:carVariants.findIndex(item=>item?.visible),roadVariant:roadVariants.findIndex(item=>item?.visible)};
    },
    follow(value,delta) {
      following=true;
      if (order) endOrder();
      requested=vehicle=pedestrian=null;
      remoteActive=Boolean(value?.active);
      if (!value) {
        car.visible=guest.visible=scooter.visible=roadCar.visible=box.visible=false;
        return;
      }
      lastOrder=value.status;
      [car,guest,scooter,roadCar].forEach((root,index)=>{
        if (!value.poses[index]) { root.visible=false; return; }
        const [visible,x,z,angle]=value.poses[index];
        root.visible=visible;
        root.position.x=x;
        root.position.z=z;
        root.rotation.y=angle;
      });
      for(const [index,variant] of carVariants.entries()) if(variant) variant.visible=index===value.variant;
      carFallback.visible=!carVariants[value.variant];
      for(const [index,variant] of roadVariants.entries()) if(variant) variant.visible=index===value.roadVariant;
      box.visible=value.parcel;
      if (figure) {
        const parent=value.mounted?rider:guest;
        if (figure.parent!==parent) parent.add(figure);
        figure.position.set(0,value.mounted?.72:0,value.mounted?-.13:0);
        helmet.visible=value.active;
        play(value.mounted?drive:guest.visible?walk:idle);
        mixer.update(delta);
      }
      if (roadScooter.visible) roadRiderMixer?.update(delta);
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
      return null;
    },
    update(delta,state,people,employees) {
      if (!state || state.phase==='paused') return;
      if (following) {
        if (remoteActive) lastOrder='Perjalanan dihentikan setelah berpindah sesi.';
        following=remoteActive=false;
        roadTrip=null;
        car.visible=guest.visible=scooter.visible=box.visible=roadCar.visible=false;
      }
      const now=state.now ?? Date.now();
      const hour=new Date(now+7*3600000).getUTCHours();
      const trafficPeriod=hour>=21 || hour<6?240000:hour===8 || hour===17?42000:90000;
      const roadSlot=Math.floor(now/trafficPeriod);
      if (!roadTrip && roadSlot!==roadCycle && (hour>=6 && hour<21 || roadSlot%3===0)) {
        roadCycle=roadSlot;
        const [start,end]=roadRoutes[roadSlot%2];
        if (roadVariants.some(Boolean)) {
          const selected=roadVariants[roadSlot%roadVariants.length] ?? roadVariants.find(Boolean);
          roadVariants.forEach(variant=>{if (variant) variant.visible=variant===selected;});
          roadTrip=begin(roadCar,[start,end]);
          roadTrip.radius=selected===roadScooter?1.1:2.3;
          roadCar.rotation.y=start[0]<end[0]?Math.PI/2:-Math.PI/2;
        }
      }
      if (roadTrip) {
        move(roadCar,roadTrip,delta,6.2,roadTrip.radius,[...people,car,scooter]);
        if (roadScooter.visible) roadRiderMixer.update(delta);
        if (roadTrip.index>=roadTrip.route.length) { roadTrip=null; roadCar.visible=false; }
      }
      const key=Math.floor((now+7*3600000)/180000)+':'+state.phase;
      if (requested && (state.phase!=='lunch' || busy(state,requested.id) || now-requested.created>180000)) {
        lastOrder=requested.food+' · Pesanan dibatalkan karena jadwal atau tugas';
        requested=null;
      }
      if (requested && !order && !vehicle && !pedestrian && !jam(people,...vehicleRoute[0],1.5)) {
          cycle=key;
          order={...requested,status:'Kurir Saji Kampung menuju kantor'};
          requested=null;
          scooterTrip=begin(scooter,vehicleRoute);
          scooter.rotation.y=-Math.PI/2;
          rider.add(figure);
          figure.position.set(0,.72,-.13);
          helmet.visible=true;
          if (body && originalMaterial && !Array.isArray(originalMaterial)) {
            body.material=originalMaterial.clone();
            body.material.color?.set('#39816b');
          }
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
        if (scooterTrip) {
          move(scooter,scooterTrip,delta,3.5,1.08,[...people,roadCar]);
          if (scooterTrip.index>=scooterTrip.route.length) {
            if (scooterTrip.returning) {
              endOrder();
            } else {
              scooterTrip=null;
              const dismount=[park[0],park[1]-.95];
              const path=nav.route(dismount,guestStops.delivery);
              if (path) {
                guest.add(figure); figure.position.set(0,0,0);
                pedestrian=begin(guest,[dismount,...path]);
                box.visible=true;
                order.status='Kurir berjalan ke teras';
              } else {
                lastOrder=order.food+' · Jalur teras tidak tersedia';
                scooterTrip={route:vehicleRoute.slice().reverse(),index:1,returning:true};
              }
            }
          }
        } else if (pedestrian) {
          const walking=move(guest,pedestrian,delta,1.70,.64,people);
          play(walking?walk:idle);
          if (pedestrian.index>=pedestrian.route.length) {
            if (pedestrian.returning) {
              guest.visible=false; box.visible=false; pedestrian=null;
              rider.add(figure); figure.position.set(0,.72,-.13);
              play(drive);
              scooterTrip={route:vehicleRoute.slice().reverse(),index:1,returning:true};
            } else {
              order.status='Menunggu pengambilan';
              pedestrian.wait+=delta;
              const receiver=employees.find(actor=>actor.person.id===order.id);
              const received=receiver?.actual==='pickup' && receiver.stage==='arrived' &&
                Math.hypot(receiver.root.position.x-foodStop[0],receiver.root.position.z-foodStop[1])<.25;
              order.handoff=received && !busy(state,order.id)?(order.handoff ?? 0)+delta:0;
              if (order.handoff>0) {
                guest.rotation.y=Math.atan2(receiver.root.position.x-guest.position.x,receiver.root.position.z-guest.position.z);
                guest.updateMatrixWorld();
                guest.localToWorld(hand.set(.26,.91,.36));
                if (receiver.hands?.[0]) receiver.hands[0].localToWorld(targetHand.set(.13,-.07,.03));
                else receiver.root.localToWorld(targetHand.set(-.22,.9,.36));
                guest.worldToLocal(hand.lerp(targetHand,Math.min(1,order.handoff/.65)));
                box.position.copy(hand);
              } else box.position.set(.26,.91,.36);
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
        move(car,vehicle,delta,vehicle.returning?1.9:2.7,2.3,[...people,guest,roadCar]);
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
      if (lastTime>95) { vehicle=pedestrian=null; car.visible=guest.visible=false; }
    },
    dispose() {
      mixer?.stopAllAction();
      roadRiderMixer?.stopAllAction();
      for (const root of [car,guest,scooter,roadCar]) root.removeFromParent();
      for (const root of [car,guest,scooter]) root.traverse(mesh=>{
        if ([geometry,wheel,helmetGeometry].includes(mesh.geometry)) mesh.material.dispose();
      });
      geometry.dispose(); wheel.dispose(); helmetGeometry.dispose(); material.dispose();
    },
  };
}
