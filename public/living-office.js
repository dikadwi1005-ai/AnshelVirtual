import { divisions } from './catalog.js';

const storageKey='anshel-living-office-v1';
const people=new Map(divisions.map(person=>[person.id,person]));
const needs=['energy','focus','social','rest','fun'];
const clamp=value=>Math.min(100,Math.max(0,value));
const pairKey=(a,b)=>[a,b].sort().join('/');
const available=actor=>['seated','arrived'].includes(actor?.stage);
const effects={
  desk:[-.26,.26,-.20,-.23,-.27], work:[-.38,-.37,-.20,-.34,-.22],
  coffee:[1.25,1.45,-.08,.35,.03], rest:[1.04,.53,-.08,1.65,.06],
  read:[.30,1.04,-.10,.95,.53], game:[-.14,-.15,.48,.54,1.7],
  talk:[-.12,-.06,.45,.20,.42], meeting:[-.22,-.22,.35,-.12,-.14],
  stroll:[.18,.33,-.06,.70,1.02], outdoor:[.61,.41,-.06,1.02,.34],
  commute:[.30,.25,.04,.41,.08], travel:[-.16,-.10,-.14,-.13,-.13],
};
const choices=['desk','coffee','rest','read','game','stroll'];

function defaults(person) {
  const vary=(factor,range)=>(person.index*factor)%range;
  return {energy:52+vary(7,34),focus:47+vary(11,44),social:27+vary(17,52),
    rest:45+vary(13,40),fun:35+vary(19,48),mood:60+vary(3,18)};
}

function read(storage) {
  try { return JSON.parse(storage?.getItem(storageKey) ?? 'null') ?? {}; }
  catch { return {}; }
}

export function createLivingOffice({storage,random=Math.random,now=Date.now}={}) {
  const saved=read(storage);
  const staff=new Map(divisions.map(person=>{
    const values=defaults(person);
    for (const key of [...needs,'mood']) {
      const value=saved.needs?.[person.id]?.[key];
      if (Number.isFinite(value)) values[key]=clamp(value);
    }
    return [person.id,{person,values,activity:'desk',until:5+person.index*1.65,
      recent:[],lastSocial:-Infinity,arrivedAt:null}];
  }));
  const ties=new Map();
  for (const [key,value] of Object.entries(saved.ties ?? {})) {
    const [a,b,...extra]=key.split('/');
    if (people.has(a) && people.has(b) && a<b && !extra.length && Number.isFinite(value)) ties.set(key,clamp(value));
  }
  const history=(Array.isArray(saved.history)?saved.history:[]).filter(item=>
    item && people.has(item.speaker) && Array.isArray(item.participants) &&
    item.participants.every(id=>people.has(id)) && typeof item.text==='string' &&
    item.text.length<=320 && typeof item.room==='string' && Number.isFinite(item.at)).slice(-120);
  const plans={};
  let clock=0, accumulator=0, lastSave=0, nextEvent=7, dirty=false, sequence=0;
  let previousState;

  function change(member,activity,duration,event=null) {
    member.activity=activity;
    member.until=clock+duration;
    member.event=event;
    member.arrivedAt=null;
    member.recent=[activity,...member.recent].slice(0,3);
  }

  function choose(member,phase,actors) {
    const {values,person,recent}=member;
    const working=['work','arrival','open','review','overtime','briefing'].includes(phase);
    const scores={
      desk:(working?43:23)+(values.focus+values.energy-100)*.26,
      coffee:(100-values.energy)*.64+(100-values.focus)*.27,
      rest:(100-values.rest)*.78+(100-values.energy)*.20,
      read:(100-values.focus)*.48+(100-values.rest)*.36,
      game:(100-values.fun)*.86+values.energy*.10,
      stroll:(100-values.fun)*.56+(100-values.rest)*.29,
    };
    const hobby=person.id==='research'?'read':person.hobby==='talk'?'stroll':person.hobby;
    const ranked=choices.map(activity=>{
      const crowded=[...staff.values()].filter(other=>other!==member && other.activity===activity).length;
      const occupied=actors.filter(actor=>actor.person!==person && actor.actual===activity && available(actor)).length;
      const capacity={coffee:3,rest:2,read:2,game:2,stroll:3}[activity];
      const shared=activity==='rest'||activity==='read' ? [...staff.values()].filter(other=>
        other!==member && ['rest','read'].includes(other.activity)).length : crowded;
      const full=capacity && Math.max(shared,occupied)>=capacity;
      return {activity,score:scores[activity]+(activity===hobby?12:0)+random()*20-
        (recent[0]===activity?24:recent.includes(activity)?9:0)-(full?90:0)};
    });
    ranked.sort((a,b)=>b.score-a.score);
    change(member,ranked[0].activity,40);
  }

  function schedule(phase,byId) {
    if (clock<nextEvent) return;
    nextEvent=clock+5;
    if ([...staff.values()].some(member=>member.event)) return;
    const candidates=[...staff.values()].filter(member=>{
      const actor=byId.get(member.person.id);
      return !plans[member.person.id]?.taskLock && available(actor) && clock-member.lastSocial>65 &&
        (member.arrivedAt===null || clock-member.arrivedAt>5);
    });
    if (candidates.length<2) return;
    const rank=candidates.map(member=>({member,score:100-member.values.social+
      (member.person.hobby==='talk'?14:0)+random()*14})).sort((a,b)=>b.score-a.score);
    const host=rank[0].member;
    const meeting=phase==='briefing' || phase==='review' || (sequence>0 && sequence%3===1);
    if (!meeting && rank[0].score<36) return;
    const guests=rank.slice(1).map(({member,score})=>({member,score:score+
      (ties.get(pairKey(host.person.id,member.person.id)) ?? 35)*.30+
      (Math.floor(host.person.index/3)===Math.floor(member.person.index/3)?9:0)
    })).sort((a,b)=>b.score-a.score);
    const count=meeting ? 2 : sequence%3===0 ? 3 : 2;
    const room=meeting?'meeting':phase==='lunch'?'garden':['hub','reception','garden'][Math.floor(sequence/2)%3];
    const event={room,starts:null,deadline:clock+52};
    for (const member of [host,...guests.slice(0,count-1).map(item=>item.member)]) {
      change(member,meeting?'meeting':'talk',52,event);
      member.lastSocial=clock;
    }
    sequence++;
    nextEvent=clock+13;
  }

  function persist() {
    if (!dirty || !storage) return;
    try {
      storage.setItem(storageKey,JSON.stringify({
        needs:Object.fromEntries([...staff].map(([id,member])=>[id,member.values])),
        ties:Object.fromEntries(ties),history,
      }));
    } catch { /* The in-memory office remains usable if storage is unavailable. */ }
    dirty=false;
  }

  function step(delta,state,actors) {
    if (state?.phase==='paused') return plans;
    clock+=delta;
    accumulator+=delta;
    const advance=accumulator>=.5;
    if (!advance && state===previousState && Object.keys(plans).length) return plans;
    previousState=state;
    const byId=new Map(actors.map(actor=>[actor.person.id,actor]));
    const elapsed=accumulator;
    if (advance) accumulator=0;
    for (const [id,member] of staff) {
      const remote=state?.people?.[id];
      const taskLock=remote?.executing || Boolean(remote?.task?.status==='queued' &&
        state.worker && state.capabilities?.includes(remote.task.kind));
      const actor=byId.get(id);
      if (taskLock && member.event) change(member,'desk',2);
      if (advance && actor) {
        const arrived=available(actor) && actor.actual===member.activity;
        if (arrived && member.arrivedAt===null) member.arrivedAt=clock;
        const event=member.event;
        if (event && arrived && event.starts===null &&
            actors.filter(other=>other!==actor && available(other) && other.actual===member.activity &&
              staff.get(other.person.id)?.event===event).length) event.starts=clock;
        if (!taskLock && (event ? clock>=event.deadline || (event.starts!==null && clock-event.starts>=26) :
            clock>=member.until || (member.recent.length && arrived && clock-member.arrivedAt>=
              (member.activity==='desk'?17:10)+member.person.index%5*2))) choose(member,state?.phase,actors);
        const activity=available(actor) ? actor.actual : 'travel';
        const rates=effects[activity] ?? effects.travel;
        for (const [index,key] of needs.entries()) member.values[key]=clamp(member.values[key]+rates[index]*elapsed);
        const average=needs.reduce((sum,key)=>sum+member.values[key],0)/needs.length;
        const target=average+(activity==='game'||activity==='talk'?14:0);
        member.values.mood=clamp(member.values.mood+(target-member.values.mood)*Math.min(1,elapsed*.075));
        dirty=true;
      }
      const commuting=state?.phase==='closed' || state?.phase==='arrival' && clock<12+member.person.index*.9;
      plans[id]={task:remote?.task ?? null,executing:Boolean(remote?.executing),taskLock,
        activity:taskLock?(remote.executing?'work':'desk'):commuting?'commute':
          state?.phase==='lunch' && member.person.index<2?'outdoor':member.activity,room:member.event?.room};
    }
    if (advance) {
      schedule(state?.phase,byId);
      for (const [id,member] of staff) if (member.event && !plans[id].taskLock && !['commute','outdoor'].includes(plans[id].activity)) {
        plans[id].activity=member.activity;
        plans[id].room=member.event.room;
      }
      if (clock-lastSave>=12) { persist(); lastSave=clock; }
    }
    return plans;
  }

  function record(turn,members,room) {
    const speaker=turn.speaker.person.id;
    const participants=members.map(actor=>actor.person.id);
    history.push({speaker,participants,room,text:turn.text.slice(0,320),at:now()});
    if (history.length>120) history.shift();
    if (participants.length>1) {
      const member=staff.get(speaker);
      member.values.social=clamp(member.values.social+2.5);
      member.values.mood=clamp(member.values.mood+1);
      for (const id of participants) if (id!==speaker) {
        const key=pairKey(id,speaker);
        ties.set(key,clamp((ties.get(key) ?? 35)+1.2));
        const listener=staff.get(id);
        listener.values.social=clamp(listener.values.social+1.4);
      }
    }
    dirty=true;
  }

  function snapshot(id) {
    const values=staff.get(id)?.values;
    if (!values) return null;
    const mood=values.energy<26?'Lelah':values.mood>73?'Ceria':values.rest<32?'Butuh rehat':
      values.focus>70?'Fokus':values.social<28?'Ingin mengobrol':'Tenang';
    const relations=[...ties].filter(([key])=>key.split('/').includes(id)).map(([key,value])=>
      ({id:key.split('/').find(other=>other!==id),value:Math.round(value)})).sort((a,b)=>b.value-a.value);
    return {mood,needs:Object.fromEntries(needs.map(key=>[key,Math.round(values[key])])),
      relations:relations.slice(0,3),history:history.filter(item=>item.participants.includes(id)).slice(-5).reverse()};
  }

  function resume(actors) {
    for(const actor of actors) {
      const member=staff.get(actor.person.id);
      if(!member)continue;
      const activity=Object.hasOwn(effects,actor.activity)?actor.activity:'desk';
      change(member,activity,14+actor.person.index*1.1);
      const life=actor.remote?.life;
      if(!life)continue;
      for(const key of needs) member.values[key]=life.needs[key];
      for(const relation of life.relations) ties.set(pairKey(actor.person.id,relation.id),relation.value);
      for(const entry of life.history) {
        if(!history.some(item=>item.at===entry.at&&item.speaker===entry.speaker&&item.text===entry.text)) history.push(entry);
      }
    }
    history.sort((a,b)=>a.at-b.at);
    if(history.length>120)history.splice(0,history.length-120);
    previousState=undefined;
  }

  return {step,record,snapshot,persist,resume};
}
