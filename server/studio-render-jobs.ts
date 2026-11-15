import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const hash=/^[0-9a-f]{64}$/;
const slug=/^[a-z][a-z0-9-]{0,63}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const leaseMs=60_000;
const maxBytes=25_000_000;

export function renderManifest(input) {
  if (input?.version!==1 || !hash.test(input.sceneBuild ?? '') ||
      !Array.isArray(input.shots) || !input.shots.length || input.shots.length>8)
    throw new Error('Manifest episode atau versi scene tidak valid.');
  const references=['narration','music','captions'];
  for (const name of references)
    if (input[name]!==undefined && !hash.test(input[name])) throw new Error('Referensi media tidak valid.');
  const shots=input.shots.map(shot=>{
    if (!hash.test(shot?.replay ?? '') || !slug.test(shot.camera) ||
        !Number.isSafeInteger(shot.start) || shot.start<0 || !Number.isSafeInteger(shot.end) ||
        shot.end-shot.start<500 || shot.end>360_000) throw new Error('Rentang atau sumber shot tidak valid.');
    return {replay:shot.replay,camera:shot.camera,start:shot.start,end:shot.end};
  });
  const duration=shots.reduce((total,shot)=>total+shot.end-shot.start,0);
  if (duration>90000) throw new Error('Durasi render melebihi 90 detik.');
  const manifest={version:1,sceneBuild:input.sceneBuild,shots,duration,
    output:{width:1080,height:1920,fps:24,container:'mp4'},
    ...Object.fromEntries(references.filter(key=>input[key]).map(key=>[key,input[key]]))};
  return {id:digest(JSON.stringify(manifest)),manifest};
}

export function isolatedRenderQueue(filename,now=Date.now) {
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY, manifest TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
      created INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, lease TEXT, until_ms INTEGER,
      progress INTEGER NOT NULL DEFAULT 0, result TEXT, reason TEXT
    )`);
  const get=db.prepare('SELECT id,state,attempts,progress,result,reason FROM render_jobs WHERE id=?');
  return {
    enqueue(input) {
      const {id,manifest}=renderManifest(input);
      db.prepare('INSERT OR IGNORE INTO render_jobs(id,manifest,created) VALUES (?,?,?)').run(id,JSON.stringify(manifest),now());
      return get.get(id);
    },
    get: id=>get.get(id),
    claim() {
      const time=now(), lease=randomUUID();
      db.prepare(`UPDATE render_jobs SET state='failed',lease=NULL,reason='Lease expired'
        WHERE state='running' AND until_ms<=? AND attempts>=3`).run(time);
      const row=db.prepare(`UPDATE render_jobs SET state='running',lease=?,until_ms=?,attempts=attempts+1,progress=0,reason=NULL
        WHERE id=(SELECT id FROM render_jobs WHERE (state='queued' OR (state='running' AND until_ms<=?))
          AND attempts<3 AND NOT EXISTS(SELECT 1 FROM render_jobs WHERE state='running' AND until_ms>?)
          ORDER BY created,id LIMIT 1) RETURNING id,manifest,attempts`).get(lease,time+leaseMs,time,time);
      return row?{id:row.id,manifest:JSON.parse(row.manifest),lease,attempts:row.attempts}:null;
    },
    pulse(id,lease,progress=0) {
      if (!Number.isInteger(progress) || progress<0 || progress>99) return false;
      const time=now();
      return Boolean(db.prepare(`UPDATE render_jobs SET until_ms=?,progress=max(progress,?)
        WHERE id=? AND lease=? AND state='running' AND until_ms>?`).run(time+leaseMs,progress,id,lease,time).changes);
    },
    finish(id,lease,result) {
      if (!hash.test(result)) return false;
      return Boolean(db.prepare(`UPDATE render_jobs SET state='completed',result=?,progress=100,lease=NULL
        WHERE id=? AND lease=? AND state='running' AND until_ms>?`).run(result,id,lease,now()).changes);
    },
    fail(id,lease) {
      return Boolean(db.prepare(`UPDATE render_jobs SET state='failed',reason='Render failed',lease=NULL
        WHERE id=? AND lease=? AND state='running' AND until_ms>?`).run(id,lease,now()).changes);
    },
    cancel: id=>Boolean(db.prepare(`UPDATE render_jobs SET state='cancelled',lease=NULL
      WHERE id=? AND state IN ('queued','running')`).run(id).changes),
    retry: id=>Boolean(db.prepare(`UPDATE render_jobs SET state='queued',reason=NULL,progress=0
      WHERE id=? AND state IN ('failed','cancelled') AND attempts<3`).run(id).changes),
    close:()=>db.close(),
  };
}

export async function privateRenderMedia(directory) {
  const root=resolve(directory);
  await mkdir(root,{recursive:true,mode:0o700});
  const path=id=>{
    if (!hash.test(id)) throw new Error('Referensi artefak tidak valid.');
    return resolve(root,id);
  };
  return {
    async put(bytes) {
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length>maxBytes) throw new Error('Ukuran media di luar batas.');
      const id=digest(bytes);
      const destination=path(id), temporary=destination+'.'+randomUUID()+'.tmp';
      try {
        await writeFile(temporary,bytes,{flag:'wx',mode:0o600});
        await rename(temporary,destination);
      } finally { await rm(temporary,{force:true}); }
      return id;
    },
    async get(id) {
      const file=path(id);
      if ((await stat(file)).size>maxBytes) throw new Error('Media render terlalu besar.');
      const bytes=await readFile(file);
      if (bytes.length>maxBytes || digest(bytes)!==id) throw new Error('Media render rusak.');
      return bytes;
    },
  };
}
