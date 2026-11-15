import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { divisions } from '../public/catalog.js';

const entities=new Set(['anshel:office:hq',...divisions.map(({id})=>'anshel:agent:'+id)]);
const events=new Set(['office.opened','office.closed','milestone.awarded']);

export function nationEvent(input,regionId) {
  if (!/^[a-z0-9-]{1,48}$/.test(regionId) || !entities.has(input?.entityId) || !events.has(input?.type) ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(input.sourceId ?? '') ||
      !Number.isSafeInteger(input.occurredAt) || input.occurredAt<0 || input.occurredAt>8.64e15)
    throw new Error('Invalid outbound Nation event.');
  const eventId=createHash('sha256').update(JSON.stringify([regionId,input.entityId,input.type,input.sourceId])).digest('hex');
  return {version:1,eventId,entityId:input.entityId,type:input.type,regionId,
    occurredAt:new Date(input.occurredAt).toISOString()};
}

export function nationOutbox(filename,config,fetcher=fetch,now=Date.now) {
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS nation_events (
      id TEXT PRIMARY KEY, event TEXT NOT NULL, at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next INTEGER NOT NULL DEFAULT 0, delivered INTEGER
    )`);
  let sendUrl;
  try {
    const url=new URL(config?.url);
    if (config?.enabled===true && typeof config.token==='string' && config.token.length>=12 &&
        url.protocol==='https:' && !url.port && !url.username && !url.password && !url.hash && !url.search &&
        url.hostname.includes('.') && !isIP(url.hostname) && !/\.(local|localhost|internal|test)$/.test(url.hostname))
      sendUrl=url;
  } catch { /* The outbox is usable offline. */ }
  let pending;
  async function deliver() {
    if (!sendUrl) return {health:'not_configured'};
    const time=now();
    const entry=db.prepare(`UPDATE nation_events SET next=?,attempts=attempts+1
      WHERE id=(SELECT id FROM nation_events WHERE delivered IS NULL AND next<=? ORDER BY at,id LIMIT 1)
      RETURNING id,event,attempts`).get(time+10000,time);
    if (!entry) return {health:'idle'};
    try {
      const response=await fetcher(sendUrl,{method:'POST',redirect:'error',signal:AbortSignal.timeout(4000),
        headers:{'Authorization':'Bearer '+config.token,'Content-Type':'application/json','Idempotency-Key':entry.id},
        body:entry.event});
      await response.body?.cancel().catch(()=>{});
      if (!response.ok) throw new Error('Remote refused event.');
      db.prepare('UPDATE nation_events SET delivered=? WHERE id=? AND attempts=?').run(now(),entry.id,entry.attempts);
      return {health:'connected',id:entry.id};
    } catch {
      const delay=Math.min(3600_000,10000*2**Math.min(9,entry.attempts-1));
      db.prepare('UPDATE nation_events SET next=? WHERE id=? AND attempts=?').run(now()+delay,entry.id,entry.attempts);
      return {health:'degraded',id:entry.id};
    }
  }
  return {
    publish(input) {
      const data=nationEvent(input,config.regionId);
      db.prepare('INSERT OR IGNORE INTO nation_events(id,event,at) VALUES (?,?,?)')
        .run(data.eventId,JSON.stringify(data),now());
      return data.eventId;
    },
    flush() {
      pending ??= deliver().finally(()=>{pending=null;});
      return pending;
    },
    close:()=>db.close(),
  };
}
