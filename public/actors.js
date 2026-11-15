import * as THREE from 'three';
import { divisions } from './catalog.js';
import { chooseConversationAnchor, createConversations, createMonologues } from './conversations.js';
import { employeeFigure, handGrip } from './employee-look.js';
import { employeeMouth } from './employee-mouth.js';
import { employeeProfile } from './employee-profiles.js';
import { activityAnchors, conversationAnchors, station } from './furnishings.js';
import { districtRoute, homeByEmployee, legacyHomes, roomById } from './layout.js';
import { gamepad } from './lounge.js';
import { isGameReaction } from './lounge-game.js';
import { characterClearance } from './character-mode.js';
import { createLivingOffice } from './living-office.js';
import { flatMesh, model } from './world.js';
import { fittedModel } from './district-models.js';

const speed=1.72;
const personalSpace=.70;
const sitBlend=.42;
const genrePreferences=[2,0,2,1,0,2,1,0,2,1,2,0];
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

function gestureClip(baseClip,name,duration,gestures) {
  const tracks=baseClip.tracks.map(track=>track.clone());
  const flex=new THREE.Quaternion(), axis=new THREE.Vector3(1,0,0);
  for (const [bone,angles] of Object.entries(gestures)) {
    const index=tracks.findIndex(track=>track.name===bone+'.quaternion');
    if (index<0) continue;
    const base=new THREE.Quaternion().fromArray(tracks[index].values);
    const values=angles.flatMap(angle=>flex.setFromAxisAngle(axis,angle).multiply(base).toArray());
    tracks[index]=new THREE.QuaternionKeyframeTrack(bone+'.quaternion',[0,duration*.28,duration*.66,duration],values);
  }
  return new THREE.AnimationClip(name,duration,tracks);
}

function chooseAnchor(actor,activity,reservations,nav,room) {
  if (activity==='talk') return chooseConversationAnchor(actor,reservations,anchor=>nav.clear(anchor.point,anchor.point),room);
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

export function migrateHomePose(value) {
  const {id,position,angle,stage,actual}=value;
  const old=legacyHomes[id], home=homeByEmployee[id];
  const dx=position[0]-old.x, dz=position[1]-old.z;
  const u=dx*Math.cos(old.angle)-dz*Math.sin(old.angle);
  const v=dx*Math.sin(old.angle)+dz*Math.cos(old.angle);
  const atOldHome=Math.abs(u)<=old.width/2+.15 && v>=-old.depth/2-.15 && v<=old.depth/2+1.5;
  const homeActivity=actual==='home' || actual==='home-sleep';
  if (!atOldHome && !homeActivity) return value;
  const needsRoute=stage==='walking' || stage==='aligning' && !atOldHome;
  return {...value,
    position:atOldHome?home.point(u,v):position,
    angle:atOldHome?angleDifference(angle+home.angle-old.angle,0):angle,
    stage:needsRoute?'waiting':stage,
    path:needsRoute?[]:value.path,
  };
}

export async function createActors(scene,nav,shadowMap,initial,requestDialogue,storage) {
  const shadow=new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,opacity:.70,toneMapped:false});
  const parcelModel=model('district/cardboardboxclosed').catch(()=>null);
  const settled=await Promise.allSettled(divisions.map(async person=>{
    const profile=employeeProfile(person.id);
    const asset=await model('people/character-'+profile.asset);
    return {figure:employeeFigure(asset,person.id),animations:asset.animations,profile};
  }));
  const foodAsset=await parcelModel;
  const reservations=new Map();
  const living=createLivingOffice({storage});
  const conversations=createConversations(living.record);
  const monologues=createMonologues();
  const game={elapsed:0,players:new Set(),genre:0};
  const pads=[gamepad(),gamepad()];
  const cupGeometry=new THREE.CylinderGeometry(.047,.036,.092,12);
  const cupMaterial=new THREE.MeshStandardMaterial({color:0xf1a758,roughness:.62});
  const coverGeometry=new THREE.BoxGeometry(.23,.022,.16);
  const paperGeometry=new THREE.BoxGeometry(.214,.018,.15);
  const coverMaterial=new THREE.MeshStandardMaterial({color:0x39788c,roughness:.85});
  const paperMaterial=new THREE.MeshStandardMaterial({color:0xf1e8cf,roughness:.88});
  const biteGeometry=new THREE.BoxGeometry(.09,.049,.073);
  const biteMaterial=new THREE.MeshStandardMaterial({color:'#d59452',roughness:.84});
  const gripLeft=new THREE.Vector3(), gripRight=new THREE.Vector3();
  const trafficClearance=1.25;
  let solo=null, replanCooldown=0, office=null, lastState, lastPlans, player=null;
  let sharedTurn=null;
  const actors=[];
  const errors=[];
  for (const [index,result] of settled.entries()) {
    if (result.status==='rejected') { errors.push(result.reason); continue; }
    const person=divisions[index];
    const {figure,profile}=result.value;
    const root=new THREE.Group();
    root.add(figure);
    root.name=profile.id;
    scene.add(root);
    const shadowMesh=flatMesh(scene,.98,.84,[0,0],.031,shadow);
    const mixer=new THREE.AnimationMixer(figure);
    const clips=new Map(result.value.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    const idle=result.value.animations.find(clip=>clip.name==='idle');
    const talk={head:[0,.055,-.035,0],'arm-left':[0,-.26,-.13,0],'arm-right':[0,-.22,-.10,0]};
    if (idle) {
      clips.set('speak',mixer.clipAction(gestureClip(idle,'speak',1.36,talk)));
      clips.set('drink',mixer.clipAction(gestureClip(idle,'drink',3.8,{'arm-right':[-.52,-1.50,-1.38,-.52]})));
      clips.set('snack',mixer.clipAction(gestureClip(idle,'snack',3.1,{head:[0,.16,.12,0],'arm-right':[-.28,-1.34,-1.16,-.28]})));
      clips.set('brew',mixer.clipAction(gestureClip(idle,'brew',3.6,{'arm-right':[0,-.57,-.82,0]})));
      clips.set('take-parcel',mixer.clipAction(gestureClip(idle,'take-parcel',1.1,{'arm-left':[0,-1.2,-1.08,0]})));
      const sleeping=gestureClip(idle,'home-sleep',4.2,{head:[0,.045,.025,0],'arm-left':[.11,.12,.11,.11]});
      clips.set('home-sleep',mixer.clipAction(sleeping));
    }
    const sit=result.value.animations.find(clip=>clip.name==='sit');
    if (sit) {
      const drive=result.value.animations.find(clip=>clip.name==='drive') ?? sit;
      clips.set('desk-work',mixer.clipAction(seatedClip(sit,drive,'desk-work',[-.13,-.20,-.14,-.13],[-.20,-.12,-.17,-.20])));
      clips.set('desk-cheer',mixer.clipAction(seatedClip(sit,drive,'desk-cheer',[-.20,-.94,-.75,-.20],[-.20,-.80,-.94,-.20])));
      clips.set('game-play',mixer.clipAction(seatedClip(sit,drive,'game-play',[0,.05,-.035,0],[0,-.035,.05,0])));
      clips.set('game-react',mixer.clipAction(seatedClip(sit,drive,'game-react',[-.04,-.27,-.22,-.04],[-.04,-.24,-.19,-.04])));
      clips.set('seated-speak',mixer.clipAction(gestureClip(sit,'seated-speak',1.7,
        {head:talk.head,'arm-right':[0,-.37,-.18,0]})));
      clips.set('read',mixer.clipAction(gestureClip(sit,'read',4.4,
        {head:[.18,.23,.28,.18],'arm-left':[-.82,-.86,-.82,-.82],'arm-right':[-.82,-.82,-.69,-.82]})));
      clips.set('desk-nap',mixer.clipAction(gestureClip(sit,'desk-nap',6,
        {head:[0,.52,.53,.25],'arm-left':[0,-.82,-.82,-.56],'arm-right':[0,-.91,-.90,-.64]})));
      clips.set('phone',mixer.clipAction(gestureClip(sit,'phone',3.2,
        {head:[.23,.29,.24,.23],'arm-right':[-.93,-1.03,-.98,-.93]})));
      clips.set('stretch',mixer.clipAction(gestureClip(sit,'stretch',3.3,
        {head:[0,-.22,-.16,0],'arm-right':[0,-2,-1.78,0],'arm-left':[0,-1.78,-2,0]})));
    }
    const plan=initial?.people?.[person.id];
    const actor={person,root,figure,shadowMesh,mixer,clips,stature:profile.stature,action:null,animation:'idle',path:[],
      hands:[figure.getObjectByName('arm-left'),figure.getObjectByName('arm-right')],
      head:figure.getObjectByName('head'),headYaw:0,mouth:employeeMouth(figure),
      stage:'idle',seatProgress:0,activity:plan?.executing?'work':['arrival','closed'].includes(initial?.phase)?'home':'desk',
      reaction:0,wait:0,retry:0,animationDelta:0};
    actor.cup=new THREE.Mesh(cupGeometry,cupMaterial);
    actor.bite=new THREE.Mesh(biteGeometry,biteMaterial);
    actor.bite.visible=false;
    root.add(actor.bite);
    actor.book=new THREE.Group();
    const cover=new THREE.Mesh(coverGeometry,coverMaterial), pages=new THREE.Mesh(paperGeometry,paperMaterial);
    pages.position.y=.015;
    actor.book.add(cover,pages);
    actor.phone=new THREE.Mesh(new THREE.BoxGeometry(.11,.021,.20),new THREE.MeshStandardMaterial({color:'#354f6a',emissive:'#24568a',emissiveIntensity:.3}));
    root.add(actor.cup,actor.book,actor.phone);
    actor.phone.visible=false;
    actor.cup.visible=actor.book.visible=false;
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

  function request(actor,activity,room) {
    actor.activity=activity;
    actor.requestedRoom=room;
    const anchor=activity==='meet-dika'?actor.invitation.anchor:chooseAnchor(actor,activity,reservations,nav,room);
    if (!anchor) { actor.retry=2; return; }
    if (actor.anchor.id===anchor.id && !['waiting','walking','aligning','idle'].includes(actor.stage)) {
      if (actor.pending) reservations.delete(actor.pending.id);
      actor.pending=null;
      actor.anchor=anchor;
      actor.actual=activity;
      if (actor.stage==='departing') actor.stage='sitting';
      return;
    }
    if (actor.pending && actor.pending.id!==actor.anchor?.id) reservations.delete(actor.pending.id);
    actor.pending=anchor;
    actor.pendingActivity=activity;
    reservations.set(anchor.id,actor);
    if (actor.stage==='seated' || actor.stage==='sitting') actor.stage='departing';
    else if (actor.stage!=='departing') route(actor);
  }

  function route(actor) {
    const target=actor.pending;
    const path=districtRoute(nav,location(actor),target.approach,homeByEmployee[actor.person.id]);
    if (!path) {
      if (actor.anchor.id!==target.id) reservations.delete(target.id);
      actor.pending=null;
      actor.retry=1.5;
      actor.stage='waiting';
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
    actor.blocked=0;
  }

  let campus=[], pickup=null, handingOff=false;
  function foodParcel(actor,asset=foodAsset) {
    if (asset && !actor.parcel) {
      actor.parcel=fittedModel(asset,[.29,.24,.27]);
      actor.root.add(actor.parcel);
      hold(actor.parcel,actor,0);
    }
  }
  function receiveFood(id,asset) {
    const actor=actors.find(item=>item.person.id===id);
    if (!actor) return;
    foodParcel(actor,asset);
    actor.foodTime=28;
    actor.retry=0;
  }
  function poseProps(actor,animation) {
    actor.cup.visible=animation==='drink' || animation==='brew';
    actor.book.visible=animation==='read';
    actor.phone.visible=animation==='phone';
    actor.bite.visible=animation==='snack';
    if (actor.parcel) {
      actor.parcel.visible=actor.foodTime>0 && animation!=='snack';
      if (actor.parcel.visible) hold(actor.parcel,actor,0);
    }
    if (actor.phone.visible) {
      hold(actor.phone,actor,1);
      actor.phone.rotation.x=.46;
    }
    if (actor.cup.visible) hold(actor.cup,actor,1);
    if (actor.bite.visible) hold(actor.bite,actor,1);
    if (actor.book.visible) {
      handGrip(actor.hands[0],1,gripLeft);
      handGrip(actor.hands[1],-1,gripRight);
      actor.book.position.copy(actor.root.worldToLocal(gripLeft.add(gripRight).multiplyScalar(.5)));
      actor.book.position.y+=.032;
      actor.book.rotation.x=.32;
    }
  }
  function hold(prop,actor,hand) {
    handGrip(actor.hands[hand],hand===0?1:-1,gripRight);
    prop.position.copy(actor.root.worldToLocal(gripRight));
  }
  function occupied(actor,point,from) {
    for (const {root,radius,width=radius} of campus) {
      if (!root.visible) continue;
      const {x,z}=root.position;
      const sin=Math.sin(root.rotation.y), cos=Math.cos(root.rotation.y);
      const clearance=([px,pz])=>{
        const dx=px-x, dz=pz-z;
        return ((dx*cos-dz*sin)/width)**2+((dx*sin+dz*cos)/radius)**2;
      };
      const next=clearance(point);
      if (next<1 && (!from || next<clearance(from))) return true;
    }
    if (player) {
      const {x,z}=player.position;
      const next=(x-point[0])**2+(z-point[1])**2;
      if (next<characterClearance**2 && next<(x-from[0])**2+(z-from[1])**2) return true;
    }
    return actors.some(other=>{
      if (other===actor) return false;
      const {x,z}=other.root.position;
      const next=(x-point[0])**2+(z-point[1])**2;
      return next<personalSpace**2 && (!from || next<(x-from[0])**2+(z-from[1])**2);
    });
  }

  function step(actor,delta) {
    const here=location(actor);
    const goal=actor.path[0];
    const distance=Math.hypot(goal[0]-here[0],goal[1]-here[1]);
    if (distance<.00001) {
      actor.path.shift();
      if (!actor.path.length) actor.stage='aligning';
      return;
    }
    const forward=[(goal[0]-here[0])/distance,(goal[1]-here[1])/distance];
    const stride=Math.min(distance,delta*speed);
    const next=[here[0]+forward[0]*stride,here[1]+forward[1]*stride];
    const ahead=Math.min(.58,distance);
    const lookAhead=[here[0]+forward[0]*ahead,here[1]+forward[1]*ahead];
    const obstructed=occupied(actor,next,here);
    const throughGate=Math.abs(here[0]+1.8)<2.4 && here[1]>18 && here[1]<32;
    const crossing=throughGate && actor.actual==='home-sleep';
    if (obstructed || occupied(actor,lookAhead,here)) {
      actor.wait+=delta;
      actor.blocked+=delta;
      if (actor.wait>.30 && replanCooldown<=0) {
        replanCooldown=.12;
        const blockers=actors.filter(other=>other!==actor &&
          other.root.position.distanceToSquared(actor.root.position)<5**2).map(location);
        if (player) blockers.push([player.position.x,player.position.z]);
        for(const {root} of campus)
          if(root.visible && root.position.distanceToSquared(actor.root.position)<25)
            blockers.push([root.position.x,root.position.z]);
        const commuting=['home','home-sleep'].includes(actor.actual) || Math.abs(here[0])>=34 || Math.abs(here[1])>=29;
        const localGoal=commuting?actor.path[0]:actor.anchor.approach;
        if (crossing && actor.path.length>1 && blockers.some(point=>Math.hypot(point[0]-localGoal[0],point[1]-localGoal[1])<.73)) {
          const onward=nav.route(here,actor.path[1],blockers);
          if (onward) {
            actor.path=[...onward,...actor.path.slice(2)];
            actor.wait=0;
            return;
          }
        }
        const detour=nav.route(here,localGoal,blockers);
        if (detour) {
          actor.path=commuting?[...detour,...actor.path.slice(1)]:detour;
          actor.wait=0;
          return;
        }
        if (obstructed) {
          for (const side of [1,-1]) {
            const clearance=crossing?trafficClearance:.82;
            const gap=[here[0]-forward[1]*clearance*side,here[1]+forward[0]*clearance*side];
            if (occupied(actor,gap,here) || !nav.clear(here,gap)) continue;
            const onward=nav.route(gap,localGoal,blockers);
            if (!onward) continue;
            actor.path=[gap,...onward,...(commuting?actor.path.slice(1):[])];
            actor.wait=0;
            return;
          }
        }
        actor.wait=-.3;
      }
      if (actor.blocked>8) {
        // The planner can release a congested destination instead of waiting forever.
        actor.stage='waiting';
        actor.path=[];
        actor.retry=1.5+actor.person.index*.07;
        play(actor,'idle');
        return;
      }
      if (obstructed) {
        play(actor,'idle');
        return;
      }
    } else { actor.wait=0; actor.blocked=0; }
    const heading=Math.atan2(forward[0],forward[1]);
    const turn=angleDifference(heading,actor.root.rotation.y);
    actor.root.rotation.y+=THREE.MathUtils.clamp(turn,-delta*10,delta*10);
    if (Math.abs(turn)>.22) { play(actor,'idle'); return; }
    actor.root.position.x+=forward[0]*stride;
    actor.root.position.z+=forward[1]*stride;
    play(actor,'walk');
  }

  function seat(actor,delta,reverse) {
    const direction=reverse?-1:1;
    const progress=THREE.MathUtils.clamp(actor.seatProgress+direction*delta/sitBlend,0,1);
    const t=THREE.MathUtils.smoothstep(progress,0,1);
    const {point,approach,height}=actor.anchor;
    const next=[THREE.MathUtils.lerp(approach[0],point[0],t),THREE.MathUtils.lerp(approach[1],point[1],t)];
    if (occupied(actor,next,location(actor))) return;
    actor.seatProgress=progress;
    actor.root.position.set(next[0],.021+height*t,next[1]);
    play(actor,reverse?'idle':'sit',sitBlend);
    if (reverse && actor.seatProgress===0) route(actor);
    if (!reverse && actor.seatProgress===1) actor.stage='seated';
  }

  function advance(actor,delta,state,animate) {
    const plan=state?.people?.[actor.person.id];
    if (actor.invitation && (plan?.taskLock || (actor.invitation.remaining-=delta)<=0)) actor.invitation=null;
    if (actor.directTurn && (actor.directTurn.remaining-=delta)<=0) actor.directTurn=null;
    const reacting=actor.reaction>0 && !plan?.taskLock;
    const attending=state?.meeting?.participants.includes(actor.person.id) && !plan?.taskLock;
    actor.foodTime=plan?.taskLock?0:Math.max(0,(actor.foodTime ?? 0)-delta);
    const requested=attending?'meeting':pickup===actor.person.id && !plan?.taskLock && state?.phase==='lunch'?'pickup':
      actor.foodTime>0?'snack':
      actor.invitation?'meet-dika':reacting && actor.activity!=='meet-dika'?actor.activity:plan?.activity ?? 'desk';
    const room=attending?'meeting':plan?.room;
    actor.retry=Math.max(0,actor.retry-delta);
    const chatting=actor.directTurn && ['seated','arrived'].includes(actor.stage);
    if (!chatting && (requested!==actor.activity || room!==actor.requestedRoom ||
        (!actor.retry && (requested!==actor.actual || actor.stage==='waiting') && !actor.pending))) request(actor,requested,room);
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
      const working=seated && (actor.actual==='work' ||
        actor.actual==='desk' && !plan?.taskLock && ['arrival','briefing','work','open','review','overtime'].includes(state?.phase));
      const turn=(actor.stage==='arrived'||seated) && conversations.turns.get(actor.anchor.conversation);
      const speaking=turn?.speaker===actor;
      const speakingAlone=solo?.speaker===actor && actor.stage==='arrived' && actor.anchor.clip==='idle' && !plan?.taskLock;
      const conversation=actor.stage==='arrived' && (actor.anchor.conversation || (chatting && player));
      if (conversation) {
        const facing=chatting && player?[player.position.x,player.position.z]:
          turn ? location(speaking?turn.other:turn.speaker) : actor.anchor.center;
        const [x,z]=location(actor);
        const angle=Math.atan2(facing[0]-x,facing[1]-z);
        const turnAngle=angleDifference(angle,actor.root.rotation.y);
        actor.root.rotation.y+=THREE.MathUtils.clamp(turnAngle,-delta*3,delta*3);
      }
      const gaming=seated && actor.actual==='game';
      const watching=seated && actor.actual==='tv' && game.players.size>0;
      const reacts=isGameReaction(game.elapsed+actor.person.index%4*.17);
      const receiving=handingOff && pickup===actor.person.id && actor.stage==='arrived' && actor.actual==='pickup';
      const waking=actor.wake>0 && !plan?.taskLock && seated && !gaming;
      const clip=receiving?'take-parcel':(speaking || chatting) && seated ? 'seated-speak' : speaking || chatting || speakingAlone ? 'speak' :
        gaming ? (reacts?'game-react':'game-play') : watching && reacts?'desk-cheer':
          waking?'stretch':reacting ? (seated?'desk-cheer':'emote-yes') : working?'desk-work':actor.stage==='waiting'?'idle':actor.anchor.clip;
      if (clip==='desk-nap') actor.slept=true;
      else if (actor.slept) { actor.slept=false; actor.wake=2; }
      actor.wake=Math.max(0,(actor.wake ?? 0)-delta);
      play(actor,clip);
      actor.reaction=Math.max(0,actor.reaction-delta);
    }
    actor.animationDelta+=delta;
    const sleeping=actor.actual==='home-sleep' && ['seated','sitting','departing'].includes(actor.stage);
    actor.figure.rotation.x=sleeping?-Math.PI/2*actor.seatProgress:0;
    const propActive=actor.foodTime>0 || ['drink','read','phone','brew','snack'].includes(actor.animation);
    const interval=actor.stage==='walking'||actor.stage==='sitting'||actor.stage==='departing' ? 1/30 : 1/12;
    if (animate || actor.animationDelta>=interval || propActive) {
      if (actor.headYaw) actor.head.rotateY(-actor.headYaw);
      actor.mixer.update(actor.animationDelta);
      actor.animationDelta=0;
      actor.headYaw=0;
      poseProps(actor,actor.animation);
      if (actor.stage==='seated' && actor.anchor.conversation==='meeting') {
        const turn=conversations.turns.get('meeting');
        const partner=turn && (turn.speaker===actor?turn.other:turn.speaker);
        if (partner) {
          const [x,z]=location(actor);
          const [targetX,targetZ]=location(partner);
          const direction=angleDifference(Math.atan2(targetX-x,targetZ-z),actor.root.rotation.y);
          actor.headYaw=THREE.MathUtils.clamp(direction,-.32,.32);
          actor.head.rotateY(actor.headYaw);
        }
      }
    }
    actor.shadowMesh.position.x=actor.root.position.x;
    actor.shadowMesh.position.z=actor.root.position.z;
  }

  function updateGame(delta) {
    const wasPlaying=game.players.size>0;
    game.players.clear();
    for (const actor of actors) {
      if (actor.stage!=='seated' || actor.actual!=='game') continue;
      const slot=actor.anchor.controller;
      const pad=pads[slot];
      if (!pad) continue;
      if (!wasPlaying && !game.players.size) game.genre=genrePreferences[actor.person.index];
      game.players.add(slot);
      if (pad.parent!==actor.root) actor.root.add(pad);
      actor.hands[0].localToWorld(gripLeft.set(.138,-.080,.019));
      actor.hands[1].localToWorld(gripRight.set(-.138,-.080,.019));
      const grip=actor.root.worldToLocal(gripLeft.add(gripRight).multiplyScalar(.5));
      pad.position.set(grip.x,grip.y+.042,grip.z+.105);
      pad.rotation.x=actor.animation==='game-react' ? -.23 : -.08;
    }
    for (const [slot,pad] of pads.entries()) if (!game.players.has(slot)) pad.removeFromParent();
    game.elapsed=game.players.size ? game.elapsed+delta : 0;
  }

  function capture() {
    const turn=actors.find(actor=>actor.directTurn)?.directTurn ?? conversations.turns.values().next().value;
    return {cityHomes:1,actors:actors.map(actor=>({
      id:actor.person.id,position:location(actor),y:actor.root.position.y,
      angle:angleDifference(actor.root.rotation.y,0),stage:actor.stage,activity:actor.activity,actual:actor.actual,
      anchor:actor.anchor.id,pending:actor.pending?.id,pendingActivity:actor.pendingActivity,room:actor.requestedRoom,
      animation:actor.animation,seat:actor.seatProgress,path:actor.path,
      life:living.snapshot(actor.person.id),
      foodTime:actor.foodTime || undefined,
    })),turn:turn?{id:turn.speaker.person.id,text:turn.text}:null};
  }

  function replayFrame() {
    const turn=sharedTurn ?? actors.find(actor=>actor.directTurn)?.directTurn ??
      conversations.turns.get('meeting') ?? conversations.turns.values().next().value ?? solo;
    return {
      actors:actors.map(actor=>({
        position:location(actor),y:actor.root.position.y,angle:Math.atan2(Math.sin(actor.root.rotation.y),Math.cos(actor.root.rotation.y)),
        animation:actor.animation,stage:actor.stage,clipTime:actor.action?.time ?? 0,
      })),
      turn:turn?{id:turn.speaker.person.id,text:turn.text}:null,
    };
  }

  function replayPose(frame,next,fraction) {
    const blend=THREE.MathUtils.lerp;
    for (const [index,actor] of actors.entries()) {
      const value=frame.actors[index], end=next.actors[index];
      actor.root.position.set(blend(value.position[0],end.position[0],fraction),
        blend(value.y,end.y,fraction),blend(value.position[1],end.position[1],fraction));
      actor.root.rotation.y=value.angle+angleDifference(end.angle,value.angle)*fraction;
      actor.shadowMesh.position.x=actor.root.position.x;
      actor.shadowMesh.position.z=actor.root.position.z;
      actor.figure.rotation.x=value.animation==='home-sleep'?-Math.PI/2:0;
      play(actor,value.animation,0);
      if (actor.action) {
        const length=actor.action.getClip().duration;
        const difference=end.clipTime-value.clipTime;
        const progress=value.animation!==end.animation?0:difference>=0?difference:difference+length;
        actor.action.time=(value.clipTime+progress*fraction)%length;
      }
      actor.mixer.update(0);
      poseProps(actor,value.animation);
    }
  }

  function apply(snapshot,resume=false) {
    if (!snapshot) return;
    reservations.clear();
    for (const actor of actors) {
      const original=snapshot.actors.find(item=>item.id===actor.person.id);
      if (!original) continue;
      const value=snapshot.cityHomes===1?original:migrateHomePose(original);
      const options=activity=>activity==='meet-dika'?conversationAnchors[0]:activityAnchors(actor.person,activity);
      const anchor=options(value.actual).find(item=>item.id===value.anchor) ?? station(roomById[actor.person.id]);
      const pending=value.pending && options(value.pendingActivity).find(item=>item.id===value.pending);
      actor.anchor=anchor;
      actor.actual=value.actual;
      actor.activity=value.activity;
      actor.requestedRoom=value.room;
      actor.pending=pending || null;
      actor.pendingActivity=value.pendingActivity;
      actor.stage=value.stage;
      actor.seatProgress=value.seat;
      actor.path=value.path.map(point=>point.slice());
      let restoredPosition=value.position;
      if (resume && actor.stage==='walking' && actor.path.length) {
        const home=homeByEmployee[actor.person.id];
        if (!nav.clear(restoredPosition,restoredPosition)) {
          const dx=restoredPosition[0]-home.x, dz=restoredPosition[1]-home.z;
          const u=dx*Math.cos(home.angle)-dz*Math.sin(home.angle);
          const v=dx*Math.sin(home.angle)+dz*Math.cos(home.angle);
          if (Math.abs(u)<home.width/2 && Math.abs(v-home.depth/2)<.42) {
            const safe=home.point(u,home.depth/2+(v>=home.depth/2?.48:-.48));
            if (nav.clear(safe,safe)) restoredPosition=safe;
          }
        }
        let from=restoredPosition;
        if (actor.path.some(to=>{
          const blocked=!nav.clear(from,to);
          from=to;
          return blocked;
        })) {
          actor.path=[];
          actor.stage='waiting';
        }
      }
      actor.wait=actor.blocked=actor.retry=0;
      actor.directTurn=null;
      actor.invitation=resume && value.activity==='meet-dika'?{anchor:pending || anchor,remaining:25}:null;
      if (actor.stage==='departing' && !pending) actor.stage='sitting';
      reservations.set(anchor.id,actor);
      if (pending) reservations.set(pending.id,actor);
      const prior=actor.remote?.position;
      actor.remoteWalking=Boolean(!resume && prior && Math.abs(value.position[0])>42 &&
        value.stage==='walking' && value.animation==='walk' && value.path.length &&
        Math.hypot(value.position[0]-prior[0],value.position[1]-prior[1])>.03);
      actor.remoteElapsed=0;
      actor.remote=value;
      actor.foodTime=value.foodTime ?? 0;
      if (actor.foodTime) foodParcel(actor);
      if (resume || !actor.sharedPosition) {
        actor.root.position.set(restoredPosition[0],value.y,restoredPosition[1]);
        actor.root.rotation.y=value.angle;
        actor.sharedPosition=true;
      }
      play(actor,value.animation,resume?0:.14);
    }
    if(resume) {
      living.resume(actors);
      solo=null;
    }
    const speaker=actors.find(actor=>actor.person.id===snapshot.turn?.id);
    if (!speaker || resume) sharedTurn=null;
    else if(sharedTurn?.speaker!==speaker || sharedTurn.text!==snapshot.turn.text)
      sharedTurn={speaker,text:snapshot.turn.text,duration:Math.max(2.65,snapshot.turn.text.length/17)};
  }

  function followSnapshot(delta) {
    const blend=1-Math.exp(-delta*4);
    for(const actor of actors) {
      const value=actor.remote;
      if(!value)continue;
      let [x,z]=value.position;
      const correction=Math.hypot(x-actor.root.position.x,z-actor.root.position.z);
      if (actor.remoteWalking) {
        const [nextX,nextZ]=value.path[0], dx=nextX-x, dz=nextZ-z;
        const remaining=Math.hypot(dx,dz);
        actor.remoteElapsed=Math.min(.85,actor.remoteElapsed+delta);
        if (remaining>0) {
          const fraction=Math.min(1,actor.remoteElapsed*speed/remaining);
          x+=dx*fraction;
          z+=dz*fraction;
        }
      }
      const t=correction>4?1:actor.remoteWalking?1-Math.exp(-delta*7):blend;
      actor.root.position.x=THREE.MathUtils.lerp(actor.root.position.x,x,t);
      actor.root.position.y=THREE.MathUtils.lerp(actor.root.position.y,value.y,t);
      actor.root.position.z=THREE.MathUtils.lerp(actor.root.position.z,z,t);
      actor.root.rotation.y+=angleDifference(value.angle,actor.root.rotation.y)*t;
      actor.mixer.update(delta);
      actor.figure.rotation.x=actor.actual==='home-sleep' && ['seated','sitting','departing'].includes(actor.stage)?
        -Math.PI/2*actor.seatProgress:0;
      actor.shadowMesh.position.x=actor.root.position.x;
      actor.shadowMesh.position.z=actor.root.position.z;
      poseProps(actor,actor.animation);
    }
    updateGame(delta);
  }

  return {
    errors,actors,turns:conversations.turns,game,living,
    campus(obstacles) { campus=obstacles; },
    pickup(id,handoff) { pickup=id; handingOff=handoff; },
    receiveFood,
    capture,apply,followSnapshot,replayFrame,replayPose,
    visible(value) {
      for(const actor of actors) actor.root.visible=actor.shadowMesh.visible=value;
    },
    catchUp(seconds,state) {
      for(let remaining=seconds;remaining>0;remaining-=.05) this.update(Math.min(.05,remaining),state,null,true,null);
    },
    get sharedTurn() { return sharedTurn; },
    get solo() { return solo; },
    get directTurn() { return actors.find(actor=>actor.directTurn)?.directTurn; },
    invite(actor,state) {
      if (state?.phase==='paused') return 'Simulasi sedang dijeda.';
      if (office?.people?.[actor.person.id]?.taskLock) return actor.person.employee+' sedang menangani tugas.';
      if (actor.invitation) return actor.person.employee+' sudah dipanggil ke Atrium.';
      if (actors.some(person=>person.invitation)) return 'Masih ada pegawai yang dipanggil ke Atrium.';
      const anchor=conversationAnchors[0].find(slot=>!reservations.has(slot.id) &&
        (!player || Math.hypot(player.position.x-slot.point[0],player.position.z-slot.point[1])>characterClearance) &&
        nav.route(actor.stage==='seated'||actor.stage==='sitting'||actor.stage==='departing'?
          actor.anchor.approach:location(actor),slot.approach));
      if (!anchor) return 'Belum ada tempat yang bisa dijangkau di Atrium.';
      actor.invitation={anchor,remaining:75};
      actor.directTurn=null;
      request(actor,'meet-dika',office?.people?.[actor.person.id]?.room);
      return actor.person.employee+' akan menemuimu di Atrium Kolaborasi.';
    },
    chat(actor,state) {
      if (state?.phase==='paused') return 'Simulasi sedang dijeda.';
      if (office?.people?.[actor.person.id]?.taskLock) return actor.person.employee+' sedang menangani tugas.';
      if (!['seated','arrived'].includes(actor.stage)) return 'Tunggu '+actor.person.employee+' berhenti berjalan.';
      for (const person of actors) person.directTurn=null;
      const lines={
        desk:'Hai, Dika. Aku lagi merapikan catatan di meja.',
        coffee:'Hai, Dika. Aku lagi ambil kopi sebentar.',
        game:'Hai, Dika! Aku lagi main sebentar di lounge.',
        read:'Hai, Dika. Aku lagi baca sebentar.',
        'meet-dika':'Hai, Dika. Aku sudah sampai di titik temu.',
      };
      const text=lines[actor.actual] ?? 'Hai, Dika. Ada yang ingin kamu bahas?';
      actor.directTurn={speaker:actor,text,duration:3.8,remaining:3.8};
      living.record(actor.directTurn,[actor],'dika');
      return null;
    },
    clearInteraction() { for (const actor of actors) { actor.invitation=null; actor.directTurn=null; } },
    update(delta,state,focus,wide=false,controlled=null) {
      if (state?.phase==='paused') return;
      player=controlled;
      replanCooldown-=delta;
      const people=living.step(delta,state,actors);
      if (state!==lastState || people!==lastPlans) {
        office={...state,people};
        lastState=state;
        lastPlans=people;
      }
      const groups=new Map();
      for (const actor of actors) {
        const plan=people[actor.person.id];
        const group=actor.anchor.conversation;
        if (state?.meeting && group==='meeting' && !state.meeting.participants.includes(actor.person.id)) continue;
        const attending=group==='meeting' && state?.meeting?.participants.includes(actor.person.id);
        if (!group || actor.invitation || actor.directTurn || !['arrived','seated'].includes(actor.stage) ||
            (!attending && plan?.room!==group) || plan?.taskLock) continue;
        if (!groups.has(group)) groups.set(group,[]);
        groups.get(group).push(actor);
      }
      const request=state?.dialogueEnabled ? requestDialogue : null;
      conversations.update(delta,groups,office,focus,request);
      for (const actor of actors) advance(actor,delta,office,!wide && focus &&
        Math.hypot(focus.x-actor.root.position.x,focus.z-actor.root.position.z)<11);
      const remark=monologues.update(delta,actors,groups,office,focus,request);
      if (remark && remark!==solo) living.record(remark,[remark.speaker],remark.speaker.actual);
      solo=remark;
      updateGame(delta);
    },
    celebrate(id) {
      const actor=actors.find(item=>item.person.id===id);
      if (actor) actor.reaction=1.9;
    },
  };
}
