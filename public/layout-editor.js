import { divisions } from './catalog.js';
import { activityAnchors, obstaclesFor, propBounds, propsFor } from './furnishings.js';
import { entrance, insideRoom, roomById, rooms } from './layout.js';
import { agentRadius, navigation, segmentHits } from './navigation.js';

const movable=new Set(['plant','largePlant','smallTree','lamp','bench','lounge']);
const original=new Map(rooms.map(room=>[room.id,propsFor(room)]));
export const layoutItems=rooms.flatMap(room=>original.get(room.id).flatMap((prop,index)=>
  movable.has(prop.type) && !prop.id && prop.y===0 ? [{id:room.id+':'+index,room,prop}] : []));
const itemsById=new Map(layoutItems.map(item=>[item.id,item]));
const baseObstacles=rooms.flatMap(room=>obstaclesFor(room,original.get(room.id)));
const baseNav=navigation(baseObstacles);
const anchors=divisions.flatMap(person=>['desk','coffee','game','rest','read','talk','meeting','stroll','visit']
  .flatMap(activity=>activityAnchors(person,activity)));
const access=new Map(rooms.map(room=>[room.id,entrance(room)]));
const center=[0,0];
const baselineAccess=[...access.values(),...anchors.map(anchor=>anchor.approach)]
  .filter((point,index,list)=>list.findIndex(other=>String(other)===String(point))===index);
let reachable;

export function editProp(id,dx,dz,turn) {
  const item=itemsById.get(id);
  if (!item || ![dx,dz,turn].every(Number.isFinite)) return null;
  const {prop}=item;
  return {...prop,at:[prop.at[0]+Math.round(dx*4)/4,prop.at[1]+Math.round(dz*4)/4],
    angle:prop.angle+Math.round(turn/15)*Math.PI/12};
}

export function checkLayout(edits) {
  if (!edits || typeof edits!=='object' || Array.isArray(edits)) return null;
  const moved=new Map();
  for (const [id,values] of Object.entries(edits)) {
    if (!Array.isArray(values) || values.length!==3) return null;
    const next=editProp(id,...values);
    if (!next) return null;
    const item=itemsById.get(id);
    const bounds=propBounds(next);
    if (![[bounds[0]-.28,bounds[1]-.28],[bounds[2]+.28,bounds[3]+.28],
      [bounds[0]-.28,bounds[3]+.28],[bounds[2]+.28,bounds[1]-.28]].every(point=>insideRoom(item.room,point))) return null;
    moved.set(id,{item,next,bounds});
  }
  if (!moved.size) return {props:new Map(),nav:baseNav};
  const lists=new Map([...original].map(([id,props])=>[id,props.slice()]));
  for (const [id,{item,next}] of moved) lists.get(item.room.id)[Number(id.split(':')[1])]=next;
  for (const [,{item,next,bounds}] of moved) {
    const overlaps=obstaclesFor(item.room,lists.get(item.room.id).filter(prop=>prop!==next))
      .some(({box})=>bounds[0]<box[2]+.05 && bounds[2]>box[0]-.05 && bounds[1]<box[3]+.05 && bounds[3]>box[1]-.05);
    if (overlaps || anchors.some(anchor=>segmentHits(anchor.approach,anchor.point,bounds,agentRadius))) return null;
  }
  const nav=navigation(rooms.flatMap(room=>obstaclesFor(room,lists.get(room.id))));
  reachable ??= baselineAccess.filter(target=>baseNav.route(center,target));
  if (reachable.some(target=>!nav.route(center,target))) return null;
  return {props:new Map([...moved].map(([id,value])=>[id,value.next])),nav};
}
