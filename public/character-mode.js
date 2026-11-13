import * as THREE from 'three';
import { characterFigure } from './employee-look.js';
import { point, roomById } from './layout.js';
import { flatMesh, model } from './world.js';

export const formalAsset='male-d';
const spawnPoints=[[0,-1.9],[0,-2.65],[1,-1.9],[-1,-1.9]].map(([x,z])=>point(roomById.executive,x,z));
const radius=.38;
export const characterClearance=.75;

export function characterMove(position,direction,distance,clear) {
  const [x,z]=position;
  const length=Math.hypot(...direction);
  if (!length || !distance) return position;
  const scale=distance/Math.max(1,length);
  const next=[x+direction[0]*scale,z+direction[1]*scale];
  if (clear(position,next)) return next;
  for (const slide of [[next[0],z],[x,next[1]]]) {
    if ((slide[0]!==x || slide[1]!==z) && clear(position,slide)) return slide;
  }
  return position;
}

export async function createCharacter(scene,nav,shadowMap) {
  const asset=await model('people/character-'+formalAsset);
  const root=new THREE.Group();
  const figure=characterFigure(asset,{asset:formalAsset,stature:1.71});
  root.name='Dika';
  root.rotation.y=Math.PI;
  root.add(figure);
  root.visible=false;
  scene.add(root);
  const shadow=flatMesh(scene,.98,.84,[0,0],.031,new THREE.MeshBasicMaterial({
    map:shadowMap,transparent:true,depthWrite:false,opacity:.70,toneMapped:false,
  }));
  shadow.visible=false;
  const mixer=new THREE.AnimationMixer(figure);
  const idle=mixer.clipAction(asset.animations.find(clip=>clip.name==='idle'));
  const walk=mixer.clipAction(asset.animations.find(clip=>clip.name==='walk'));
  let action=idle, lastPosition=null;
  idle.play();
  const here=()=>[root.position.x,root.position.z];
  const forward=new THREE.Vector3();
  const outfit=figure.getObjectByName('body-mesh');
  const casual=new WeakMap();
  let partner=null;

  function setPartner(actor) {
    if (partner===actor) return;
    if (partner) Object.assign(partner,casual.get(partner));
    partner=actor;
    if (!partner) return;
    casual.set(partner,{geometry:partner.geometry,material:partner.material});
    partner.geometry=outfit.geometry;
    partner.material=outfit.material;
  }

  function clear(from,to,actors) {
    return nav.clear(from,to,null,radius) && actors.every(actor=>{
      const {x,z}=actor.root.position;
      const next=(x-to[0])**2+(z-to[1])**2;
      return next>=characterClearance**2 || next>=(x-from[0])**2+(z-from[1])**2;
    });
  }

  return {
    root,setPartner,
    enable(value,actors) {
      if (value) {
        const positions=lastPosition?[lastPosition,...spawnPoints]:spawnPoints;
        const start=positions.find(point=>clear(point,point,[]) && actors.every(actor=>
          Math.hypot(actor.root.position.x-point[0],actor.root.position.z-point[1])>=characterClearance));
        if (!start) return false;
        root.position.set(start[0],.021,start[1]);
        shadow.position.x=start[0];
        shadow.position.z=start[1];
      } else if (root.visible) lastPosition=here();
      root.visible=shadow.visible=value;
      return value;
    },
    update(delta,input,view,actors) {
      if (view.isCamera) view.getWorldDirection(forward);
      else forward.copy(view);
      forward.y=0;
      forward.normalize();
      const direction=[forward.x*input.y-forward.z*input.x,forward.z*input.y+forward.x*input.x];
      const from=here();
      const to=characterMove(from,direction,delta*1.93,(a,b)=>clear(a,b,actors));
      const nextAction=to===from?idle:walk;
      if (nextAction!==action) {
        action.fadeOut(.14);
        nextAction.reset().setEffectiveWeight(1).fadeIn(.14).play();
        action=nextAction;
      }
      if (to!==from) {
        const heading=Math.atan2(to[0]-from[0],to[1]-from[1]);
        const angle=heading-root.rotation.y;
        root.rotation.y+=THREE.MathUtils.clamp(Math.atan2(Math.sin(angle),Math.cos(angle)),-delta*12,delta*12);
        root.position.x=shadow.position.x=to[0];
        root.position.z=shadow.position.z=to[1];
      }
      mixer.update(delta);
    },
  };
}
