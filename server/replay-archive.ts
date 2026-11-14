import { gzipSync, gunzipSync } from 'node:zlib';
import { Fault } from './store.ts';

export const replayKey='studio_private_replay_v1';
const ttl=7*86400_000;
const limit=32;
const validNumber=(value,min,max)=>Number.isFinite(value) && value>=min && value<=max;

export function replayOperation(current,input,now) {
  const entries=(current ?? []).filter(clip=>clip.start>=now-ttl);
  if (input.action==='list') return {result:entries.map(({start,end,bytes})=>({start,end,bytes})).reverse()};
  if (!Number.isSafeInteger(input.start)) throw new Fault(400,'Waktu rekaman tidak valid.');
  const prior=entries.find(clip=>clip.start===input.start);
  if (input.action==='read') {
    if (!prior) throw new Fault(404,'Rekaman cloud tidak ditemukan.');
    return {result:{start:prior.start,frames:JSON.parse(gunzipSync(Buffer.from(prior.body,'base64'),{maxOutputLength:420_000}).toString())}};
  }
  if (input.action==='delete') return {entries:entries.filter(clip=>clip.start!==input.start),result:{ok:true}};
  if (input.action!=='save' || !validNumber(input.start,now-ttl,now+60_000) ||
      !Array.isArray(input.frames) || input.frames.length<2 || input.frames.length>90)
    throw new Fault(400,'Pilih klip arsip yang valid.');
  let previous=input.start-1;
  const frames=input.frames.map(frame=>{
    if (!Number.isSafeInteger(frame?.at) || frame.at<=previous || frame.at-input.start>45000 ||
        !Array.isArray(frame.actors) || frame.actors.length!==12) throw new Fault(400,'Frame replay tidak valid.');
    previous=frame.at;
    const actors=frame.actors.map(actor=>{
      if (!Array.isArray(actor?.position) || actor.position.length!==2 ||
          !validNumber(actor.position[0],-37,37) || !validNumber(actor.position[1],-34,34) ||
          !validNumber(actor.y,0,1) || !validNumber(actor.angle,-100,100) || !validNumber(actor.clipTime,0,60) ||
          typeof actor.animation!=='string' || !/^[a-z-]{1,25}$/.test(actor.animation)) throw new Fault(400,'Pose replay tidak valid.');
      return {position:actor.position,y:actor.y,angle:actor.angle,clipTime:actor.clipTime,animation:actor.animation};
    });
    return {at:frame.at,actors,turn:null};
  });
  if (frames[0].at!==input.start) throw new Fault(400,'Waktu awal klip berbeda dari frame pertama.');
  const packed=gzipSync(JSON.stringify(frames));
  if (packed.byteLength>48_000) throw new Fault(413,'Klip terlalu besar.');
  const clip={start:input.start,end:previous,bytes:packed.byteLength,body:packed.toString('base64')};
  if (prior && prior.body!==clip.body) throw new Fault(409,'Waktu rekaman ini sudah dipakai klip lain.');
  const next=[...entries.filter(entry=>entry.start!==clip.start),clip].sort((a,b)=>a.start-b.start).slice(-limit);
  return {entries:next,result:{ok:next.some(entry=>entry.start===clip.start)}};
}
