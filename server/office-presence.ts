import { divisions, activities } from '../public/catalog.js';
import { foodMenu } from '../public/layout.js';
import { cityEdge } from '../public/city-plan.js';

export const officePresenceKey='office_presence_v1';
const ids=new Set(divisions.map(person=>person.id));
const stages=new Set(['seated','arrived','walking','aligning','sitting','departing','waiting','idle']);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const bounded=(value,limit)=>Number.isFinite(value)&&Math.abs(value)<=limit;
const between=(value,limit)=>bounded(value,limit)&&value>=0;
const pair=value=>Array.isArray(value)&&value.length===2&&bounded(value[0],57)&&bounded(value[1],53);
const actorPoint=value=>Array.isArray(value)&&value.length===2&&
  (pair(value) || bounded(value[0],cityEdge) && bounded(value[1],cityEdge));
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
  return (snapshot.cityHomes===undefined || snapshot.cityHomes===1) &&
    snapshot.actors.every(actor=>actor&&ids.has(actor.id)&&actorPoint(actor.position)&&bounded(actor.y,1)&&actor.y>=0&&
    bounded(actor.angle,4)&&stages.has(actor.stage)&&activity(actor.activity)&&activity(actor.actual)&&
    anchor(actor.anchor)&&(!actor.pending||anchor(actor.pending))&&(!actor.pendingActivity||activity(actor.pendingActivity))&&
    (!actor.room||anchor(actor.room))&&typeof actor.animation==='string'&&/^[a-z-]{1,25}$/.test(actor.animation)&&
    (!actor.life||life(actor.life))&&between(actor.seat,1)&&
    (actor.foodTime===undefined || between(actor.foodTime,28))&&
    Array.isArray(actor.path)&&actor.path.length<=160&&actor.path.every(actorPoint)) &&
    (!snapshot.turn||ids.has(snapshot.turn.id)&&typeof snapshot.turn.text==='string'&&snapshot.turn.text.length<=320) &&
    (snapshot.traffic===undefined || validTraffic(snapshot.traffic));
}

function validTraffic(value) {
  return value && typeof value.status==='string' && value.status.length<=160 &&
    ['active','mounted','parcel'].every(key=>typeof value[key]==='boolean') &&
    Number.isInteger(value.variant) && value.variant>=-1 && value.variant<=3 &&
    (value.roadVariant===undefined || Number.isInteger(value.roadVariant) && value.roadVariant>=-1 && value.roadVariant<=2) &&
    (value.opposingVariant===undefined || Number.isInteger(value.opposingVariant) && value.opposingVariant>=-1 && value.opposingVariant<=1) &&
    Array.isArray(value.poses) && [3,4,5].includes(value.poses.length) && value.poses.every(item=>
      Array.isArray(item)&&item.length===4&&typeof item[0]==='boolean'&&pair(item.slice(1,3))&&bounded(item[3],Math.PI)) &&
    (value.delivery===undefined || validDelivery(value.delivery,value.active));
}

function validDelivery(value,active) {
  const order=value=>value && typeof value.orderId==='string' && uuid.test(value.orderId) &&
    foodMenu.includes(value.food) && divisions.some(person=>person.id===value.id && person.employee===value.name) &&
    Number.isSafeInteger(value.created) && value.created>=0 && typeof value.status==='string' && value.status.length<=80 &&
    (value.handoff===undefined || between(value.handoff,.75)) && (value.delivered===undefined || typeof value.delivered==='boolean') &&
    (value.mount===undefined || value.mount && typeof value.mount.entering==='boolean' && between(value.mount.time,.9));
  const trip=value=>value && Array.isArray(value.route) && value.route.length>=2 && value.route.length<=161 &&
    value.route.every(pair) && Number.isInteger(value.index) && value.index>=1 && value.index<=value.route.length &&
    between(value.wait,146) && typeof value.returning==='boolean';
  return value && (active?order(value.order):value.order===null) &&
    (value.requested===null || !active && order(value.requested)) &&
    (!active?value.drive===null && value.walk===null:
      value.order.mount?.entering?value.drive===null && value.walk===null:
      value.drive===null?trip(value.walk):trip(value.drive) && value.walk===null) &&
    between(value.elapsed,145) && between(value.decisionTime,46) &&
    typeof value.lastOrder==='string' && value.lastOrder.length<=160 &&
    value.cooldowns && !Array.isArray(value.cooldowns) && typeof value.cooldowns==='object' &&
    Object.entries(value.cooldowns).every(([id,time])=>ids.has(id)&&Number.isSafeInteger(time)&&time>=0) &&
    Array.isArray(value.parcelPosition) && value.parcelPosition.length===3 && value.parcelPosition.every(item=>bounded(item,4));
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
