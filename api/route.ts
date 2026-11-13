import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createCloudStore } from '../server/cloud-store.ts';
import { createDialogue } from '../server/dialogue.ts';
import { telegram } from '../server/telegram.ts';
import { configuredOfficeBots, dispatchOfficeGroupEvent, dispatchOfficeGroupCheckin, officeGroupConfig, sendOfficeGroupOwnerMessage } from '../server/telegram-office.ts';
import { prepareOfficeNaturalChat, deliverOfficeNaturalChat } from '../server/telegram-natural.ts';
import { Fault } from '../server/store.ts';
import { validPresence } from '../server/office-presence.ts';

// Server-side only. Credentials must be configured in Vercel Environment Variables.
let store;
let dialogue;
const ttl = 8 * 3600_000;
const getStore = () => store ||= createCloudStore();
const getDialogue = () => dialogue ||= createDialogue(process.env);
const validSecret = value => typeof value === 'string' && value.length >= 24;
const validOwnerPassword = value => typeof value === 'string' && value.length >= 12;
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' &&
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};
const respond = (body,status=200,additional={}) => new Response(JSON.stringify(body), {
  status, headers:{...headers,...additional},
});

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new Fault(415,'Gunakan JSON.');
  }
  const body = await request.text();
  if (Buffer.byteLength(body)>420_000) throw new Fault(413,'Ukuran permintaan terlalu besar.');
  try {
    const object = JSON.parse(body);
    if (!object || Array.isArray(object) || typeof object !== 'object') throw new Error();
    return object;
  } catch { throw new Fault(400,'JSON tidak valid.'); }
}

async function route(request, injectedStore = null, env = process.env) {
  try {
    const url = new URL(request.url);
    const rewritten = url.searchParams.get('path');
    const path = rewritten === null ? url.pathname : '/api/'+rewritten.replace(/^\/+/, '');
    const post = request.method === 'POST';
    if (!path.startsWith('/api/')) throw new Fault(404,'Rute tidak ditemukan.');
    if (post && request.headers.get('origin') && request.headers.get('origin') !== url.origin) {
      throw new Fault(403,'Asal permintaan ditolak.');
    }
    const office = injectedStore || getStore();
    const token = /(?:^|;\s*)anshel=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie') || '')?.[1];
    const authed = !!token && await office.sessionActive(token);
    const bearer = /^Bearer (.+)$/.exec(request.headers.get('authorization') || '')?.[1];

    if (path === '/api/session' && request.method === 'GET') return respond({authenticated:authed});
    if (path === '/api/login' && post) {
      if (!validOwnerPassword(env.OWNER_PASSWORD)) throw new Fault(503,'OWNER_PASSWORD harus diatur di Vercel dengan minimal 12 karakter.');
      const { password } = await readJson(request);
      const valid = equal(password,env.OWNER_PASSWORD);
      const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
      const key = createHash('sha256').update(ip+'|'+env.OWNER_PASSWORD).digest('hex');
      await office.recordLogin(key,valid);
      if (!valid) throw new Fault(401,'Kata sandi salah.');
      if (token) await office.deleteSession(token);
      const fresh = randomBytes(32).toString('hex');
      await office.createSession(fresh,Date.now()+ttl);
      return respond({authenticated:true},200,{ 'Set-Cookie':`anshel=${fresh}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl/1000}` });
    }
    if (path.startsWith('/api/worker/') && post) {
      if (!validSecret(env.WORKER_TOKEN) || !equal(bearer,env.WORKER_TOKEN)) {
        throw new Fault(401,'Token worker ditolak.');
      }
      const input = await readJson(request);
      if (path === '/api/worker/claim') return respond({task:await office.claim(input.kinds)});
      if (path === '/api/worker/claim-scheduled') {
        if (Object.keys(input).length) throw new Fault(400,'Rute jadwal tidak menerima parameter.');
        return respond({task:await office.claim(['draft'],null,true)});
      }
      if (path === '/api/worker/claim-task') return respond({task:await office.claim(input.kinds,input.taskId ?? '')});
      if (path === '/api/worker/heartbeat') { await office.heartbeat(input.id,input.token); return respond({ok:true}); }
      if (path === '/api/worker/finish') { await office.finish(input.id,input.token,input); return respond({ok:true}); }
    }
    if (path.startsWith('/api/integrations/') && post) {
      if (!validSecret(env.N8N_TOKEN) || !equal(bearer,env.N8N_TOKEN)) throw new Fault(401,'Token n8n ditolak.');
      if (path === '/api/integrations/telegram') {
        const input = await readJson(request);
        try { return respond({reply:await telegram(office,input,env)}); }
        catch (error) {
          if (error instanceof Fault && [400,404,409].includes(error.status)) return respond({reply:error.message});
          throw error;
        }
      }
      if (path === '/api/integrations/office-group/config') {
        const input=await readJson(request);
        if (Object.keys(input).length) throw new Fault(400,'Pemeriksaan grup tidak menerima parameter.');
        const config=officeGroupConfig(env);
        const bots=configuredOfficeBots(env);
        return respond({groupConfigured:!!config.chatId,configured:bots.configured,missing:bots.missing,total:12});
      }
      if (path === '/api/integrations/office-group/dispatch') {
        const input=await readJson(request);
        if (Object.keys(input).length) throw new Fault(400,'Pemicu grup tidak menerima parameter.');
        return respond(await dispatchOfficeGroupEvent(office,env));
      }
      if (path === '/api/integrations/office-group/checkin') {
        const input=await readJson(request);
        if (Object.keys(input).length) throw new Fault(400,'Pemicu aktivitas kantor tidak menerima parameter.');
        return respond(await dispatchOfficeGroupCheckin(office,env));
      }
      if (path === '/api/integrations/office-group/ai/prepare') {
        return respond(await prepareOfficeNaturalChat(office,env,await readJson(request)));
      }
      if (path === '/api/integrations/office-group/ai/finish') {
        return respond(await deliverOfficeNaturalChat(office,env,await readJson(request)));
      }
      if (path === '/api/integrations/office-group/message') {
        const input=await readJson(request);
        return respond(await sendOfficeGroupOwnerMessage(office,env,input));
      }
      if (path === '/api/integrations/report') {
        if (!env.TELEGRAM_CHAT_ID) throw new Fault(503,'Telegram belum dikonfigurasi.');
        const state = await office.state();
        const labels = {queued:'Antrean',running:'Berjalan',completed:'Selesai',blocked:'Terhambat',failed:'Gagal'};
        return respond({chatId:env.TELEGRAM_CHAT_ID,reply:[
          'Anshel Virtual Tech · Ringkasan kantor',
          'Worker: '+(state.worker ? 'terhubung' : 'offline'),
          ...Object.entries(labels).map(([key,label])=>label+': '+(state.counts[key] ?? 0)),
        ].join('\n')});
      }
    }
    if (!authed) throw new Fault(401,'Masuk sebagai Dika untuk melanjutkan.');
    if (path === '/api/logout' && post) {
      await office.deleteSession(token);
      return respond({authenticated:false},200,{'Set-Cookie':'anshel=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    }
    if (path === '/api/state' && request.method === 'GET') return respond({
      ...await office.state(), dialogueEnabled:getDialogue().enabled, dialogueStatus:getDialogue().status,
    });
    if (path === '/api/dialogue' && post) return respond(await getDialogue().generate(await readJson(request)));
    if (path === '/api/office-presence' && post) {
      const input=await readJson(request);
      if(!validPresence(input))throw new Fault(400,'Snapshot kantor tidak valid.');
      return respond(await office.officePresence(input));
    }
    if (path === '/api/tasks' && post) return respond(await office.create(await readJson(request),undefined,
      request.headers.get('idempotency-key')),201);
    if (path === '/api/settings' && post) return respond(await office.settings(await readJson(request)));
    const match = /^\/api\/tasks\/([a-f0-9-]{36})\/(artifact|action)$/.exec(path);
    if (match?.[2] === 'action' && post) {
      const input = await readJson(request);
      return respond(await office.action(match[1],input.action,input));
    }
    if (match?.[2] === 'artifact' && request.method === 'GET') {
      const {output,hash} = await office.artifact(match[1]);
      return new Response(output,{status:200,headers:{...headers,
        'Content-Type':'text/plain; charset=utf-8',
        'Content-Disposition':`attachment; filename="anshel-${match[1]}.txt"`,
        'X-Artifact-Sha256':hash,
      }});
    }
    throw new Fault(404,'Rute tidak ditemukan.');
  } catch (error) {
    if (error instanceof Fault) return respond({error:error.message},error.status);
    console.error('Anshel cloud API:',error);
    return respond({error:'Layanan cloud belum siap. Periksa konfigurasi database di Vercel.'},503);
  }
}

export const createCloudApi = (office, env) => ({ fetch: request => route(request,office,env) });
export default { fetch: request => route(request) };
