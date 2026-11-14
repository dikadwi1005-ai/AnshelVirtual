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
    const inHome=actor.actual==='home'&&['seated','arrived'].includes(actor.stage);
    const goingHome=actor.activity==='home'&&!inHome;
    const goingToOffice=actor.activity==='commute'||
      (actor.actual==='home'&&actor.activity!=='home');
    const [x,z]=actor.position;
    const inBuilding=Math.abs(x)<25.5&&Math.abs(z)<22.5;
    const location=inHome?'Di rumah':goingHome?'Dalam perjalanan pulang':
      goingToOffice?'Dalam perjalanan ke kantor':
      actor.stage==='walking'?'Berjalan di kawasan Anshel':
      inBuilding?'Di dalam kantor':'Di area luar kantor';
    people[actor.id]={location,activity:activities[actor.actual]??null};
  }
  return {fresh,asOf:fresh?record.savedAt:null,people};
}

export function observedAvatar(state,id) {
  if(state?.avatarPresence?.fresh!==true)return null;
  return state.avatarPresence.people?.[id]??null;
}
