import * as THREE from 'three';
import { divisions } from './catalog.js';
import { employeeFigure } from './employee-look.js';
import { employeeProfile } from './employee-profiles.js';
import { activityAnchors } from './furnishings.js';
import { createSeatRig } from './seat-pose.js';
import { flatMesh, model } from './world.js';

const speed=1.72;
const personalSpace=.58;
const sitBlend=.62;
const floorY=.016;
const rugHeight=.016;
const angleDifference=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));

function seatedClip(sit, arms, name, leftOffsets, rightOffsets, torsoPitch=0) {
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
  if (torsoPitch) {
    flex.setFromAxisAngle(axis,torsoPitch);
    tracks.push(new THREE.QuaternionKeyframeTrack('torso.quaternion',[0,.76],[...flex.toArray(),...flex.toArray()]));
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
    if (anchor.height>0) {
      const fit=actor.seatRig.fit(anchor.height-(anchor.rug ? rugHeight : 0));
      if (!fit) continue;
      const stand=seatPosition(anchor,actor.seatRig.standingOffset(fit));
      const seated=seatPosition(anchor,-fit.hipDepth);
      if (!nav.clear(anchor.approach,stand,anchor.support,.075) || !nav.clear(stand,seated,anchor.support,.075)) continue;
      return {...anchor,fit,stand};
    }
    if (!nav.clear(anchor.approach,anchor.point)) continue;
    return anchor;
  }
  return null;
}

function location(actor) { return [actor.root.position.x,actor.root.position.z]; }

function seatPosition(anchor,forward) {
  return [anchor.point[0]+Math.sin(anchor.angle)*forward,anchor.point[1]+Math.cos(anchor.angle)*forward];
}

function applySeat(actor) {
  const anchor=actor.anchor;
  const progress=THREE.MathUtils.smoothstep(actor.seatProgress,0,1);
  const {rise,forward}=actor.seatRig.apply(anchor.fit,progress);
  const [x,z]=seatPosition(anchor,forward);
  actor.root.position.set(x,floorY+(anchor.rug ? rugHeight : 0)+rise,z);
}

export async function createActors(scene,nav,shadowMap,initial) {
  const shadow=new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,opacity:.70,toneMapped:false});
  const settled=await Promise.allSettled(divisions.map(async person=>{
    const profile=employeeProfile(person.id);
    const asset=await model('people/character-'+profile.asset);
    const figure=employeeFigure(asset,person.id);
    return {figure,seatRig:createSeatRig(figure),animations:asset.animations,employeeId:profile.id};
  }));
  const reservations=new Map();
  const actors=[];
  const errors=[];
  for (const [index,result] of settled.entries()) {
    if (result.status==='rejected') { errors.push(result.reason); continue; }
    const person=divisions[index];
    const {figure,seatRig}=result.value;
    const root=new THREE.Group();
    root.add(figure);
    root.name=result.value.employeeId;
    scene.add(root);
    const shadowMesh=flatMesh(scene,.98,.84,[0,0],.031,shadow);
    const mixer=new THREE.AnimationMixer(figure);
    const clips=new Map(result.value.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    const sit=result.value.animations.find(clip=>clip.name==='sit');
    if (sit) {
      const drive=result.value.animations.find(clip=>clip.name==='drive') ?? sit;
      clips.set('desk-work',mixer.clipAction(seatedClip(sit,drive,'desk-work',[-.13,-.20,-.14,-.13],[-.20,-.12,-.17,-.20])));
      clips.set('desk-cheer',mixer.clipAction(seatedClip(sit,drive,'desk-cheer',[-.20,-.94,-.75,-.20],[-.20,-.80,-.94,-.20])));
      clips.set('desk-rest',mixer.clipAction(seatedClip(sit,drive,'desk-rest',[-.48,-.52,-.48,-.48],[-.48,-.52,-.48,-.48],.15)));
      clips.set('lounge-sit',mixer.clipAction(seatedClip(sit,sit,'lounge-sit',[0,.03,.01,0],[0,.01,.03,0],-.16)));
    }
    const plan=initial?.people?.[person.id];
    const actor={person,root,figure,seatRig,shadowMesh,mixer,clips,action:null,animation:'idle',path:[],
      stage:'idle',seatProgress:0,activity:plan?.activity ?? 'desk',reaction:0,wait:0,retry:0};
    const anchor=chooseAnchor(actor,actor.activity,reservations,nav) ?? chooseAnchor(actor,'desk',reservations,nav);
    if (!anchor) { root.removeFromParent(); shadowMesh.removeFromParent(); errors.push(new Error('Kursi tidak dapat dicapai: '+person.id)); continue; }
    reservations.set(anchor.id,actor);
    actor.anchor=anchor;
    actor.actual=anchor.id.endsWith('-desk') && !['desk','work','nap'].includes(actor.activity) ? 'desk' : actor.activity;
    actor.stage=anchor.height>0?'seated':'arrived';
    actor.seatProgress=anchor.height>0?1:0;
    root.position.set(anchor.point[0],floorY,anchor.point[1]);
    root.rotation.y=anchor.angle;
    play(actor,actor.actual==='work'?'desk-work':anchor.clip,0);
    mixer.update(.016);
    if (anchor.fit) applySeat(actor);
    actors.push(actor);
  }

  function request(actor,activity) {
    actor.activity=activity;
    const anchor=chooseAnchor(actor,activity,reservations,nav);
    if (!anchor) { actor.retry=2; return; }
    if (actor.anchor.id===anchor.id) {
      if (actor.pending) reservations.delete(actor.pending.id);
      actor.pending=null;
      actor.anchor=anchor;
      actor.actual=activity;
      if (actor.stage==='departing') actor.stage='sitting';
      if (actor.stage==='exiting-seat') seatAccess(actor,false);
      if (actor.stage==='released' || actor.stage==='idle') actor.stage='approached';
      return;
    }
    if (actor.pending && actor.pending.id!==actor.anchor?.id) reservations.delete(actor.pending.id);
    actor.pending=anchor;
    actor.pendingActivity=activity;
    reservations.set(anchor.id,actor);
    if (actor.stage==='seated' || actor.stage==='sitting') actor.stage='departing';
    else if (actor.stage==='entering-seat' || actor.stage==='aligning' && actor.anchor.fit) seatAccess(actor,true);
    else if (actor.stage!=='departing' && actor.stage!=='exiting-seat') route(actor);
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
    actor.actual=actor.pendingActivity;
    actor.pending=null;
    actor.path=path;
    actor.stage='walking';
    actor.wait=0;
  }

  function step(actor,delta,nextStage='approached') {
    const here=location(actor);
    const goal=actor.path[0];
    const distance=Math.hypot(goal[0]-here[0],goal[1]-here[1]);
    if (distance<.035) {
      actor.root.position.x=goal[0];
      actor.root.position.z=goal[1];
      actor.path.shift();
      if (!actor.path.length) actor.stage=nextStage;
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
      if (nextStage==='approached' && actor.wait>.22 && actor.path.length<36) {
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

  function seatAccess(actor,reverse) {
    actor.stage=reverse?'exiting-seat':'entering-seat';
    actor.path=[reverse?actor.anchor.approach:actor.anchor.stand];
  }

  function seat(actor,delta,reverse) {
    const direction=reverse?-1:1;
    actor.seatProgress=THREE.MathUtils.clamp(actor.seatProgress+direction*delta/sitBlend,0,1);
    play(actor,reverse?'idle':'sit',.26);
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
    else if (actor.stage==='approached') {
      if (actor.anchor.fit) seatAccess(actor,false);
      else actor.stage='aligning';
    } else if (actor.stage==='entering-seat') step(actor,delta,'aligning');
    else if (actor.stage==='exiting-seat') step(actor,delta,'released');
    else if (actor.stage==='released') route(actor);
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
      const clip=reacting ? (seated?'desk-cheer':'emote-yes') : working?'desk-work':actor.stage==='idle'?'idle':actor.anchor.clip;
      play(actor,clip);
      actor.reaction=Math.max(0,actor.reaction-delta);
    }
    actor.mixer.update(delta);
    const hasSeatPose=['sitting','seated','departing'].includes(actor.stage);
    if (hasSeatPose) {
      applySeat(actor);
      if (actor.stage==='sitting' && actor.seatProgress===1) actor.stage='seated';
      if (actor.stage==='departing' && actor.seatProgress===0) {
        actor.root.position.y=floorY;
        seatAccess(actor,true);
      }
    }
    actor.shadowMesh.position.x=actor.root.position.x;
    actor.shadowMesh.position.z=actor.root.position.z;
    actor.shadowMesh.position.y=actor.anchor.rug && hasSeatPose ? .035 : .031;
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
