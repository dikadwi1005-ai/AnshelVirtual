import { divisions, activities } from '../public/catalog.js';

// Only a currently held browser simulation lease is an observation.
// A deterministic schedule/activity estimate is NOT evidence of avatar location.
const ids=new Set(divisions.map(person=>person.id));
const freshnessMs=12_000;
export function officeAvatarPresence(record,now) {
  const age=Number(now)-Number(record?.savedAt);
  const fresh=Number.isFinite(age)&&age>=-2000&&age<=freshnessMs&&
    Number(record?.until)>Number(now)&&
    Array.isArray(record?.snapshot?.actors)&&record.snapshot.actors.length===ids.size;
  const people={};
  if(fresh) for(const actor of record.snapshot.actors) {
    if(!actor||!ids.has(actor.id)||!Array.isArray(actor.position)||
      !Number.isFinite(actor.position[0])||!Number.isFinite(actor.position[1]))continue;
    const atHomeActivity=['home','home-sleep'].includes(actor.actual);
    const inHome=atHomeActivity&&['seated','arrived'].includes(actor.stage);
    const goingHome=['home','home-sleep'].includes(actor.activity)&&!inHome;
    const [x,z]=actor.position;
    const onCityCommute=record.snapshot.cityHomes===1 && actor.stage==='walking' && Math.abs(x)>42;
    const goingToOffice=actor.activity==='commute'||
      ((atHomeActivity || onCityCommute)&&!['home','home-sleep'].includes(actor.activity));
    const inBuilding=Math.abs(x)<25.5&&Math.abs(z)<22.5;
    const location=inHome?'Di rumah':goingHome?'Dalam perjalanan pulang':
      goingToOffice?'Dalam perjalanan ke kantor':
      actor.stage==='walking'?'Berjalan di kawasan Anshel':
      inBuilding?'Di dalam kantor':'Di area luar kantor';
    people[actor.id]={location,activity:activities[actor.actual]??null};
  }
  // An expired browser lease leaves a historical observation, not a live position.
  const lastSeenValid=!fresh&&Number.isFinite(age)&&age>=0&&age<=18*60*60_000&&
    Array.isArray(record?.snapshot?.actors)&&record.snapshot.actors.length===ids.size;
  const lastSeenPeople={};
  if(lastSeenValid) {
    const last=officeAvatarPresence({...record,until:Number(now)+5500,savedAt:now},now);
    Object.assign(lastSeenPeople,last.people);
  }
  return {fresh,asOf:fresh?record.savedAt:null,people,
    lastSeenAt:lastSeenValid?record.savedAt:null,lastSeenPeople};
}

export function avatarForConversation(state,id) {
  const live=observedAvatar(state,id);
  if(live)return {...live,quality:'live',at:state.avatarPresence?.asOf??null};
  const last=state?.avatarPresence?.lastSeenPeople?.[id];
  if(last)return {...last,quality:'last-seen',at:state.avatarPresence.lastSeenAt};
  return {quality:'unknown',location:null,activity:null,at:null};
}

export function observedAvatar(state,id) {
  if(state?.avatarPresence?.fresh!==true)return null;
  return state.avatarPresence.people?.[id]??null;
}
