import { divisions, activities } from '../public/catalog.js';

export const officePresenceKey='office_presence_v1';
const ids=new Set(divisions.map(person=>person.id));
const stages=new Set(['seated','arrived','walking','aligning','sitting','departing','waiting','idle']);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const bounded=(value,limit)=>Number.isFinite(value)&&Math.abs(value)<=limit;
const pair=value=>Array.isArray(value)&&value.length===2&&value.every(coordinate=>bounded(coordinate,30));
const activity=value=>typeof value==='string'&&Object.hasOwn(activities,value);
const anchor=value=>typeof value==='string'&&/^[a-z0-9-]{1,45}$/.test(value);
const life=value=>value && typeof value.mood==='string' && value.mood.length<=32 &&
  ['energy','focus','social','rest','fun'].every(key=>bounded(value.needs?.[key],100)&&value.needs[key]>=0) &&
  Array.isArray(value.relations)&&value.relations.length<=3&&value.relations.every(item=>ids.has(item?.id)&&bounded(item.value,100)) &&
  Array.isArray(value.history)&&value.history.length<=5&&value.history.every(item=>ids.has(item?.speaker)&&
    Array.isArray(item.participants)&&item.participants.length<=12&&item.participants.every(id=>ids.has(id))&&
    Number.isFinite(item.at)&&typeof item.text==='string'&&item.text.length<=320&&typeof item.room==='string'&&item.room.length<=45);

export function validPresence(input) {
  if(typeof input?.client!=='string'||!uuid.test(input.client)||
     (input.takeOver!==undefined && typeof input.takeOver!=='boolean')||
     (input.release!==undefined && typeof input.release!=='boolean'))return false;
  const snapshot=input.snapshot;
  if(snapshot===undefined)return true;
  if(!Array.isArray(snapshot?.actors)||snapshot.actors.length!==ids.size||
      new Set(snapshot.actors.map(actor=>actor?.id)).size!==ids.size)return false;
  return snapshot.actors.every(actor=>actor&&ids.has(actor.id)&&pair(actor.position)&&bounded(actor.y,1)&&actor.y>=0&&
    bounded(actor.angle,4)&&stages.has(actor.stage)&&activity(actor.activity)&&activity(actor.actual)&&
    anchor(actor.anchor)&&(!actor.pending||anchor(actor.pending))&&(!actor.pendingActivity||activity(actor.pendingActivity))&&
    (!actor.room||anchor(actor.room))&&typeof actor.animation==='string'&&/^[a-z-]{1,25}$/.test(actor.animation)&&
    (!actor.life||life(actor.life))&&bounded(actor.seat,1)&&actor.seat>=0&&
    Array.isArray(actor.path)&&actor.path.length<=160&&actor.path.every(pair)) &&
    (!snapshot.turn||ids.has(snapshot.turn.id)&&typeof snapshot.turn.text==='string'&&snapshot.turn.text.length<=320);
}

export function exchangeOfficePresence(current,input,now) {
  const age=()=>Math.max(0,now-(current?.savedAt??now));
  if(input.release) {
    if(current?.owner!==input.client||current.until<=now)
      return {write:false,result:{leader:false,snapshot:current?.snapshot??null}};
    const next={...current,until:now,
      ...(input.snapshot?{snapshot:input.snapshot,savedAt:now}:{})};
    return {write:true,next,result:{leader:false,snapshot:next.snapshot}};
  }
  if(!input.takeOver && current?.owner!==input.client && current?.until>now)
    return {write:false,result:{leader:false,snapshot:current.snapshot}};
  const accepted=Boolean(input.snapshot&&current?.owner===input.client&&current.until>now);
  const snapshot=accepted?input.snapshot:current?.snapshot??null;
  if(!input.snapshot&&current?.owner===input.client&&current.until>now&&current.until-now>2500)
    return {write:false,result:{leader:true,snapshot}};
  const next={owner:input.client,until:now+5500,snapshot,savedAt:accepted?now:current?.savedAt};
  return {write:true,next,result:{leader:true,snapshot,resume:current?.owner!==input.client||current?.until<=now,
    ...(accepted?{}:{age:age()})}};
}
