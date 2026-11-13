import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, Fault } from './store.ts';
import { telegram } from './telegram.ts';
import { createDialogue } from './dialogue.ts';
import { validPresence } from './office-presence.ts';

const root = fileURLToPath(new URL('../',import.meta.url));
const mime = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream',
  '.webmanifest':'application/manifest+json',
  '.obj':'text/plain','.mtl':'text/plain','.png':'image/png','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff',
};

const equal = (a,b) => typeof a === 'string' && typeof b === 'string' &&
  timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
const configured = value => typeof value === 'string' && value.length >= 24;
const validOwnerPassword = value => typeof value === 'string' && value.length >= 12;

async function json(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new Fault(415,'Gunakan JSON.');
  // Vercel Node Functions can parse the JSON body before the handler runs.
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > 420_000) throw new Fault(413,'Ukuran permintaan terlalu besar.');
    try {
      const value = JSON.parse(raw);
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
      return value;
    } catch { throw new Fault(400,'JSON tidak valid.'); }
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 420_000) throw new Fault(413,'Ukuran permintaan terlalu besar.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch { throw new Fault(400,'JSON tidak valid.'); }
}

export function officeHandler(store, env = process.env) {
  const dialogue=createDialogue(env);
  const sessions = new Map();
  let attempts = 0;
  let windowStart = Date.now();
  const ttl = 8 * 3600_000;
  const cookie = (token,age,secure) => 'anshel='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(secure?'; Secure':'');
  const buildDirectory=resolve(root,'.vercel-public');
  const built=existsSync(resolve(buildDirectory,'index.html'));
  const staticDirectory=built?buildDirectory:resolve(root,'public');
  const staticRoots = built?{}:{
    '/lib/three/':resolve(root,'node_modules/three'),
    '/fonts/dm/':resolve(root,'node_modules/@fontsource-variable/dm-sans'),
    '/fonts/space/':resolve(root,'node_modules/@fontsource-variable/space-grotesk'),
  };

  return async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'sha256-hgLgPU7rxmmm7dzXOMwTFrW/dteHLkY65W96LQcueDs='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const respond = (value,status = 200) => {
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url,'http://local');
      const path = decodeURIComponent(url.pathname);
      const post = req.method === 'POST';
      const token = /(?:^|;\s*)anshel=([a-f0-9]+)(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      const authed = token && (typeof store.sessionActive === 'function'
        ? await store.sessionActive(token) : (sessions.get(token) ?? 0) > Date.now());
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https:' : 'http:';
      const expectedOrigin = env.PUBLIC_ORIGIN || protocol+'//'+req.headers.host;
      const secure = expectedOrigin.startsWith('https://');
      if (path.startsWith('/api/')) {
        if (post && req.headers.origin && req.headers.origin !== expectedOrigin) throw new Fault(403,'Asal permintaan ditolak.');
        if (path === '/api/session' && req.method === 'GET') return respond({authenticated:!!authed});
        if (path === '/api/login' && post) {
          if (!validOwnerPassword(env.OWNER_PASSWORD)) throw new Fault(503,'Isi OWNER_PASSWORD minimal 12 karakter di .env, lalu jalankan ulang server.');
          const {password} = await json(req);
          const valid = equal(password,env.OWNER_PASSWORD);
          if (typeof store.recordLogin === 'function') {
            const clientIp = String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
            const clientKey = createHash('sha256').update(clientIp+'|'+env.OWNER_PASSWORD).digest('hex');
            await store.recordLogin(clientKey, valid);
          } else {
            if (Date.now() - windowStart > 60_000) { attempts = 0; windowStart = Date.now(); }
            if (attempts >= 8) throw new Fault(429,'Terlalu banyak percobaan. Coba lagi satu menit.');
            if (!valid) attempts++;
            else attempts = 0;
          }
          if (!valid) throw new Fault(401,'Kata sandi salah.');
          for (const [key,expiry] of sessions) if (expiry <= Date.now()) sessions.delete(key);
          if (token) sessions.delete(token);
          const fresh = randomBytes(32).toString('hex');
          if (typeof store.createSession === 'function') {
            if (token) await store.deleteSession(token);
            await store.createSession(fresh,Date.now()+ttl);
          } else sessions.set(fresh,Date.now()+ttl);
          res.setHeader('Set-Cookie',cookie(fresh,ttl/1000,secure));
          return respond({authenticated:true});
        }
        if (path.startsWith('/api/worker/') && post) {
          if (!configured(env.WORKER_TOKEN) || !equal(bearer,env.WORKER_TOKEN)) throw new Fault(401,'Token worker ditolak.');
          const body = await json(req);
          if (path === '/api/worker/claim') return respond({task:await store.claim(body.kinds)});
          if (path === '/api/worker/claim-task') return respond({task:await store.claim(body.kinds,body.taskId ?? '')});
          if (path === '/api/worker/heartbeat') { await store.heartbeat(body.id,body.token); return respond({ok:true}); }
          if (path === '/api/worker/finish') { await store.finish(body.id,body.token,body); return respond({ok:true}); }
        }
        if (path === '/api/integrations/telegram' && post) {
          if (!configured(env.N8N_TOKEN) || !equal(bearer,env.N8N_TOKEN)) throw new Fault(401,'Token n8n ditolak.');
          const body = await json(req);
          try { return respond({reply:await telegram(store,body,env)}); }
          catch (error) {
            if (error instanceof Fault && [400,404,409].includes(error.status)) return respond({reply:error.message});
            throw error;
          }
        }
        if (path === '/api/integrations/report' && post) {
          if (!configured(env.N8N_TOKEN) || !equal(bearer,env.N8N_TOKEN)) throw new Fault(401,'Token n8n ditolak.');
          if (!env.TELEGRAM_CHAT_ID) throw new Fault(503,'Telegram belum dikonfigurasi.');
          const state = await store.state();
          const statuses = {queued:'Antrean',running:'Berjalan',completed:'Selesai',blocked:'Terhambat',failed:'Gagal'};
          const counts = Object.entries(statuses).map(([key,label])=>label+': '+(state.counts[key] ?? 0));
          return respond({chatId:env.TELEGRAM_CHAT_ID,reply:['Anshel Virtual Tech · Ringkasan kantor',
            'Worker: '+(state.worker ? 'terhubung' : 'offline'),...counts].join('\n')});
        }
        if (!authed) throw new Fault(401,'Masuk sebagai Dika untuk melanjutkan.');
        if (path === '/api/logout' && post) {
          sessions.delete(token);
          if (typeof store.deleteSession === 'function') await store.deleteSession(token);
          res.setHeader('Set-Cookie',cookie('',0,secure));
          return respond({authenticated:false});
        }
        if (path === '/api/state' && req.method === 'GET') return respond({
          ...await store.state(),dialogueEnabled:dialogue.enabled,dialogueStatus:dialogue.status,
        });
        if (path === '/api/dialogue' && post) return respond(await dialogue.generate(await json(req)));
        if (path === '/api/office-presence' && post) {
          const input=await json(req);
          if(!validPresence(input))throw new Fault(400,'Snapshot kantor tidak valid.');
          return respond(await store.officePresence(input));
        }
        if (path === '/api/tasks' && post) return respond(await store.create(await json(req),undefined,req.headers['idempotency-key'] ?? null),201);
        if (path === '/api/settings' && post) return respond(await store.settings(await json(req)));
        const match = /^\/api\/tasks\/([a-f0-9-]{36})\/(artifact|action)$/.exec(path);
        if (match?.[2] === 'action' && post) {
          const input = await json(req);
          return respond(await store.action(match[1],input.action,input));
        }
        if (match?.[2] === 'artifact' && req.method === 'GET') {
          const {output,hash} = await store.artifact(match[1]);
          res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="anshel-'+match[1]+'.txt"',
            'Cache-Control':'no-store','X-Artifact-Sha256':hash});
          return res.end(output);
        }
        throw new Fault(404,'Rute tidak ditemukan.');
      }
      if (!['GET','HEAD'].includes(req.method)) throw new Fault(405,'Metode tidak diizinkan.');
      const prefix = Object.keys(staticRoots).find(key => path.startsWith(key));
      const base = prefix ? staticRoots[prefix] : staticDirectory;
      const relative = prefix ? path.slice(prefix.length) : path === '/' ? 'index.html' : path.slice(1);
      const file = resolve(base,relative);
      if (!file.startsWith(base+sep) || !mime[extname(file)] || !(await stat(file).catch(()=>null))?.isFile()) {
        throw new Fault(404,'File tidak ditemukan.');
      }
      const content = await readFile(file);
      const cache=/^assets\/(?:app|scene|chunk)-[A-Z0-9]+\.js$/.test(relative)
        ? 'public, max-age=31536000, immutable' : 'no-store';
      res.writeHead(200,{'Content-Type':mime[extname(file)],'Content-Length':content.length,'Cache-Control':cache});
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch(error) {
      if (error instanceof Fault) return respond({error:error.message},error.status);
      if (error instanceof URIError) return respond({error:'URL tidak valid.'},400);
      console.error(error);
      respond({error:'Kesalahan internal.'},500);
    }
  };
}

export function officeServer(store, env = process.env) {
  return createServer(officeHandler(store, env));
}

if (import.meta.main) {
  const directory = resolve(root,'data');
  await mkdir(directory,{recursive:true});
  const store = createStore(resolve(directory,'office.sqlite'));
  const port = Number(process.env.PORT || 4310);
  officeServer(store).listen(port,'127.0.0.1',()=>console.log('Anshel Virtual Tech · http://127.0.0.1:'+port));
}
