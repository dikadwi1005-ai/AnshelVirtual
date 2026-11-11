import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { divisions } from './catalog.js';
import { activityAnchors, station } from './furnishings.js';
import { roomById } from './layout.js';
import { flatMesh, model } from './world.js';

const rigs=['female-a','male-b','female-c','female-d','male-a','female-e',
  'male-d','female-f','male-c','female-b','male-e','male-f'];
const stature=1.62;
const speed=1.72;
const personalSpace=.58;
const sitBlend=.42;
const angleDifference=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));

function seatedClip(sit, arms, name, leftOffsets, rightOffsets) {
  const tracks=sit.tracks.map(track=>track.clone());
  const flex=new THREE.Quaternion(), arm=new THREE.Quaternion(), axis=new THREE.Vector3(1,0,0);
  for (const name of ['arm-left','arm-right']) {
    const index=tracks.findIndex(track=>track.name===name+'.quaternion');
    const armTrack=arms.tracks.find(track=>track.name===name+'.quaternion');
    const base=armTrack ? new THREE.Quaternion().fromArray(armTrack.values) : new THREE.Quaternion();
    const values=[];
    const offsets=name==='arm-left' ? leftOffsets : rightOffsets;
    for (const offset of offsets) {
      flex.setFromAxisAngle(axis,offset);
      arm.copy(base).premultiply(flex).toArray(values,values.length);
    }
    const track=new THREE.QuaternionKeyframeTrack(name+'.quaternion',[0,.23,.49,.76],values);
    if (index>=0) tracks[index]=track;
    else tracks.push(track);
  }
  return new THREE.AnimationClip(name,.76,tracks);
}

function play(actor,name,blend=.18) {
  const action=actor.clips.get(name) ?? actor.clips.get('idle');
  if (actor.action===action) return;
  actor.action?.fadeOut(blend);
  action.reset().setEffectiveTimeScale(name==='walk'?1.08:1).setEffectiveWeight(1).fadeIn(blend).play();
  actor.action=action;
  actor.animation=name;
}

function chooseAnchor(actor,activity,reservations,nav) {
  const options=activityAnchors(actor.person,activity);
  for (let i=0;i<options.length;i++) {
    const anchor=options[(i+actor.person.index)%options.length];
    if (reservations.has(anchor.id) && reservations.get(anchor.id)!==actor) continue;
    if (!nav.clear(anchor.approach,anchor.point,anchor.support,.075)) continue;
    return anchor;
  }
  return null;
}

function location(actor) { return [actor.root.position.x,actor.root.position.z]; }

export async function createActors(scene,nav,shadowMap,initial) {
  const shadow=new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,opacity:.70,toneMapped:false});
  const settled=await Promise.allSettled(divisions.map(person=>model('people/character-'+rigs[person.index])));
  const reservations=new Map();
  const actors=[];
  const errors=[];
  for (const [index,result] of settled.entries()) {
    if (result.status==='rejected') { errors.push(result.reason); continue; }
    const person=divisions[index];
    const figure=clone(result.value.scene);
    figure.scale.setScalar(stature/result.value.size.y);
    const root=new THREE.Group();
    root.add(figure);
    root.name=person.id;
    scene.add(root);
    const shadowMesh=flatMesh(scene,.98,.84,[0,0],.031,shadow);
    const mixer=new THREE.AnimationMixer(figure);
    const clips=new Map(result.value.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    const sit=result.value.animations.find(clip=>clip.name==='sit');
    if (sit) {
      const drive=result.value.animations.find(clip=>clip.name==='drive') ?? sit;
      clips.set('desk-work',mixer.clipAction(seatedClip(sit,drive,'desk-work',[-.13,-.20,-.14,-.13],[-.20,-.12,-.17,-.20])));
      clips.set('desk-cheer',mixer.clipAction(seatedClip(sit,drive,'desk-cheer',[-.20,-.94,-.75,-.20],[-.20,-.80,-.94,-.20])));
    }
    const plan=initial?.people?.[person.id];
    const actor={person,root,figure,shadowMesh,mixer,clips,action:null,animation:'idle',path:[],
      stage:'idle',seatProgress:0,activity:plan?.activity ?? 'desk',reaction:0,wait:0,retry:0};
    const anchor=chooseAnchor(actor,actor.activity,reservations,nav) ?? station(roomById[person.id]);
    reservations.set(anchor.id,actor);
    actor.anchor=anchor;
    actor.actual=anchor.id.endsWith('-desk') && !['desk','work','nap'].includes(actor.activity) ? 'desk' : actor.activity;
    actor.stage=anchor.height>0?'seated':'arrived';
    actor.seatProgress=anchor.height>0?1:0;
    root.position.set(anchor.point[0],.021+anchor.height,anchor.point[1]);
    root.rotation.y=anchor.angle;
    play(actor,actor.actual==='work'?'desk-work':anchor.clip,0);
    mixer.update(.016);
    actors.push(actor);
  }

  function request(actor,activity) {
    actor.activity=activity;
    const anchor=chooseAnchor(actor,activity,reservations,nav);
    if (!anchor) { actor.retry=2; return; }
    actor.actual=activity;
    if (actor.anchor===anchor || (actor.anchor?.id===anchor.id && actor.stage!=='departing')) {
      actor.anchor=anchor;
      return;
    }
    if (actor.pending && actor.pending.id!==actor.anchor?.id) reservations.delete(actor.pending.id);
    actor.pending=anchor;
    reservations.set(anchor.id,actor);
    if (actor.stage==='seated' || actor.stage==='sitting') actor.stage='departing';
    else route(actor);
  }

  function route(actor) {
    const target=actor.pending;
    const path=nav.route(location(actor),target.approach);
    if (!path) {
      reservations.delete(target.id);
      actor.pending=null;
      actor.retry=1.5;
      actor.stage='idle';
      actor.path=[];
      return;
    }
    if (actor.anchor && actor.anchor.id!==target.id) reservations.delete(actor.anchor.id);
    actor.anchor=target;
    actor.pending=null;
    actor.path=path;
    actor.stage='walking';
    actor.wait=0;
  }

  function step(actor,delta) {
    const here=location(actor);
    let goal=actor.path[0];
    const distance=Math.hypot(goal[0]-here[0],goal[1]-here[1]);
    if (distance<.035) {
      actor.path.shift();
      if (!actor.path.length) actor.stage='aligning';
      return;
    }
    const forward=[(goal[0]-here[0])/distance,(goal[1]-here[1])/distance];
    const next=[here[0]+forward[0]*Math.min(.72,distance),here[1]+forward[1]*Math.min(.72,distance)];
    const obstacle=actors.find(other=>other!==actor &&
      Math.hypot(other.root.position.x-next[0],other.root.position.z-next[1])<personalSpace &&
      Math.hypot(other.root.position.x-next[0],other.root.position.z-next[1])<
      Math.hypot(other.root.position.x-here[0],other.root.position.z-here[1]));
    if (obstacle) {
      actor.wait+=delta;
      if (actor.wait>.22 && actor.path.length<36) {
        for (const side of [1,-1]) {
          const detour=[here[0]+forward[0]*.48-forward[1]*.72*side,here[1]+forward[1]*.48+forward[0]*.72*side];
          if (!nav.clear(here,detour) || !nav.clear(detour,goal)) continue;
          if (actors.some(other=>other!==actor && Math.hypot(other.root.position.x-detour[0],other.root.position.z-detour[1])<personalSpace)) continue;
          actor.path.unshift(detour);
          actor.wait=0;
          break;
        }
      }
      play(actor,'idle');
      return;
    }
    actor.wait=0;
    const heading=Math.atan2(forward[0],forward[1]);
    const turn=angleDifference(heading,actor.root.rotation.y);
    actor.root.rotation.y+=THREE.MathUtils.clamp(turn,-delta*10,delta*10);
    if (Math.abs(turn)>.22) { play(actor,'idle'); return; }
    const stride=Math.min(distance,delta*speed);
    actor.root.position.x+=forward[0]*stride;
    actor.root.position.z+=forward[1]*stride;
    play(actor,'walk');
  }

  function seat(actor,delta,reverse) {
    const direction=reverse?-1:1;
    actor.seatProgress=THREE.MathUtils.clamp(actor.seatProgress+direction*delta/sitBlend,0,1);
    const t=THREE.MathUtils.smoothstep(actor.seatProgress,0,1);
    const {point,approach,height}=actor.anchor;
    actor.root.position.set(
      THREE.MathUtils.lerp(approach[0],point[0],t),.021+height*t,
      THREE.MathUtils.lerp(approach[1],point[1],t),
    );
    play(actor,reverse?'idle':'sit',sitBlend);
    if (reverse && actor.seatProgress===0) route(actor);
    if (!reverse && actor.seatProgress===1) actor.stage='seated';
  }

  function advance(actor,delta,state) {
    if (state?.phase==='paused') return;
    const plan=state?.people?.[actor.person.id];
    const reacting=actor.reaction>0 && !plan?.task;
    const requested=reacting ? actor.activity : plan?.activity ?? 'desk';
    actor.retry=Math.max(0,actor.retry-delta);
    if (requested!==actor.activity || (!actor.retry && requested!==actor.actual && !actor.pending)) request(actor,requested);
    if (actor.stage==='departing' || actor.stage==='sitting') seat(actor,delta,actor.stage==='departing');
    else if (actor.stage==='walking' && actor.path.length) step(actor,delta);
    else if (actor.stage==='aligning') {
      const turn=angleDifference(actor.anchor.angle,actor.root.rotation.y);
      actor.root.rotation.y+=THREE.MathUtils.clamp(turn,-delta*9,delta*9);
      play(actor,'idle');
      if (Math.abs(turn)<.08) {
        actor.root.rotation.y=actor.anchor.angle;
        actor.stage=actor.anchor.height>0?'sitting':'arrived';
      }
    } else {
      const seated=actor.stage==='seated';
      const working=actor.actual==='work' && seated && plan?.executing;
      const clip=reacting ? (seated?'desk-cheer':'emote-yes') : working?'desk-work':actor.anchor.clip;
      play(actor,clip);
      actor.reaction=Math.max(0,actor.reaction-delta);
    }
    actor.mixer.update(delta);
    actor.shadowMesh.position.x=actor.root.position.x;
    actor.shadowMesh.position.z=actor.root.position.z;
  }

  return {
    errors,actors,
    update(delta,state) { for (const actor of actors) advance(actor,delta,state); },
    celebrate(id) {
      const actor=actors.find(item=>item.person.id===id);
      if (actor) actor.reaction=1.9;
    },
  };
}
