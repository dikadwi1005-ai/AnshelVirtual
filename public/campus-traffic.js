import * as THREE from 'three';
import { characterFigure } from './employee-look.js';
import { model } from './world.js';
import { foodMenu, foodStop } from './layout.js';

export const vehicleRoute=[[19,36],[8.5,36],[8.5,27.2],[9.2,25.4],[11.2,24.2],[15.9,24.2]];
export const guestStops={gate:[-1.8,29.7],delivery:[-1.8,22.4],visit:[-1.8,20.6]};
const busy=(state,id)=>{
  const person=state.people?.[id];
  return person?.executing || (person?.task?.status==='queued' && state.worker && state.capabilities?.includes(person.task.kind));
};

export async function campusTraffic(scene,nav) {
  const geometry=new THREE.BoxGeometry(), material=new THREE.MeshStandardMaterial({roughness:.78});
  const car=new THREE.Group(), guest=new THREE.Group(), scooter=new THREE.Group(), rider=new THREE.Group();
  scene.add(car,guest);
  scene.add(scooter);
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
  block(scooter,'#dc9050',0,.98,-.76,.51,.49,.45);
  scooter.add(rider);
  let mixer,idle,walk,action,figure,drive,helmet,body,originalMaterial;
  try {
    const asset=await model('people/character-male-d');
    figure=characterFigure(asset,{asset:'male-d',stature:1.59});
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
  let cycle='', vehicle=null, pedestrian=null, lastTime=0, order=null, lastOrder='', scooterTrip=null, requested=null;
  let lunchTime=0;
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
  car.visible=guest.visible=delivered.visible=scooter.visible=false;
  return {
    roots:[car,guest,scooter],
    obstacles:[{root:car,radius:2.1},{root:guest,radius:.72},{root:scooter,radius:1.12}],
    pickup() { return order?.status==='Menunggu pengambilan'?order.id:null; },
    status() { return order?order.food+' · '+order.name+' · '+order.status:requested?requested.food+' · Menunggu skuter':lastOrder; },
    request(id,food,state,employees) {
      if (state?.phase!=='lunch') return 'Pesan makan tersedia saat jam istirahat.';
      if (!mixer || order || requested) return 'Kurir belum tersedia.';
      const employee=employees.find(actor=>actor.person.id===id);
      if (!employee || employee.actual==='home' || busy(state,id) || !foodMenu.includes(food))
        return 'Pilih makanan dan pegawai yang tersedia.';
      requested={employee,food};
      return null;
    },
    update(delta,state,people,employees) {
      if (!state || state.phase==='paused') return;
      const now=state.now ?? Date.now();
      lunchTime=state.phase==='lunch'?lunchTime+delta:0;
      const key=Math.floor((now+7*3600000)/180000)+':'+state.phase;
      if (requested && (state.phase!=='lunch' || busy(state,requested.employee.person.id))) {
        lastOrder=requested.food+' · Pesanan dibatalkan karena jadwal atau tugas';
        requested=null;
      }
      if (!order && (requested || key!==cycle && lunchTime>=12) && state.phase==='lunch' && figure && !vehicle && !pedestrian) {
        const candidates=employees.filter(actor=>actor.actual!=='work' && actor.actual!=='home' && !busy(state,actor.person.id) &&
          (actor.actual==='rest' || actor.actual==='outdoor' || actor.actual==='coffee' || actor.person.index%3===0));
        const employee=requested?.employee ?? candidates[Math.floor(now/180000)%candidates.length];
        if (employee && !jam(people,...vehicleRoute[0],1.5)) {
          cycle=key;
          order={id:employee.person.id,name:employee.person.employee,food:requested?.food ?? foodMenu[employee.person.index%foodMenu.length],
            status:'Kurir Saji Kampung menuju kantor'};
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
          delivered.visible=false;
        }
      }
      if (order) {
        if ((lastTime+=delta)>145) {
          lastOrder=order.food+' · '+order.name+' · '+(delivered.visible?'Diserahkan':'Rute terhambat');
          endOrder();
          return;
        }
        const park=vehicleRoute.at(-1);
        if (scooterTrip) {
          move(scooter,scooterTrip,delta,3.5,1.08,people);
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
              if (received || pedestrian.wait>70) {
                delivered.visible=Boolean(received);
                box.visible=false;
                lastOrder=order.food+' · '+order.name+' · '+(received?'Diserahkan':'Pengambilan terlewat');
                order.status=received?'Pesanan diserahkan':'Pengambilan terlewat';
                pedestrian={...pedestrian,index:1,route:pedestrian.route.slice().reverse(),returning:true};
              }
            }
          }
        }
        mixer.update(delta);
        return;
      }
      if (key!==cycle && !vehicle && !pedestrian && ['arrival','open','work','review'].includes(state.phase)) {
        cycle=key; delivered.visible=false;
        const delivery=state.phase==='lunch' || Math.floor(now/180000)%2===0;
        if (!jam(people,...vehicleRoute[0],2.5)) {
          vehicle=begin(car,vehicleRoute);
          car.rotation.y=-Math.PI/2;
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
      for (const root of [car,guest,delivered,scooter]) root.removeFromParent();
      for (const root of [car,guest,delivered,scooter]) root.traverse(mesh=>{
        if ([geometry,wheel,helmetGeometry].includes(mesh.geometry)) mesh.material.dispose();
      });
      geometry.dispose(); wheel.dispose(); helmetGeometry.dispose(); material.dispose();
    },
  };
}
