import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.ts';
import { createCloudApi } from '../api/route.ts';

test('Vercel Web API: login, sesi, antrean, dan logout tetap privat',async () => {
  const sqlite = createStore(':memory:',()=>Date.parse('2026-11-11T03:15:00Z'));
  const sessions = new Map();
  const cloud = {
    ...sqlite,
    sessionActive:async token => (sessions.get(token) ?? 0) > Date.now(),
    createSession:async (token,expiry) => { sessions.set(token,expiry); },
    deleteSession:async token => { sessions.delete(token); },
    recordLogin:async () => {},
  };
  const env = { OWNER_PASSWORD:'ownerpass123',WORKER_TOKEN:'worker-long-test-token-over-24-chars' };
  const api = createCloudApi(cloud,env);
  const call = (path, method='GET', body, extra={}) => api.fetch(new Request('https://anshel.example'+path,{
    method, headers:{...(body?{'Content-Type':'application/json'}:{}),...extra},
    body:body?JSON.stringify(body):undefined,
  }));
  try {
    assert.deepEqual(await (await call('/api/route?path=session')).json(),{authenticated:false});
    assert.equal((await call('/api/state')).status,401);
    const shortOwnerApi = createCloudApi(cloud,{...env, OWNER_PASSWORD:'ownerpass12'});
    assert.equal((await shortOwnerApi.fetch(new Request('https://anshel.example/api/login',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'ownerpass12'}),
    }))).status,503);
    assert.equal((await call('/api/login','POST',{password:'wrong'})).status,401);
    assert.equal((await call('/api/login','POST',{password:env.OWNER_PASSWORD},{Origin:'https://other.example'})).status,403);
    const login = await call('/api/login','POST',{password:env.OWNER_PASSWORD});
    assert.equal(login.status,200);
    assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const created = await call('/api/tasks','POST',{
      description:'Rancang konten media sosial',division:'social',kind:'draft',
    },{Cookie:cookie,'Idempotency-Key':'cloud-api-1'});
    assert.equal(created.status,201);
    const task = await created.json();
    assert.equal(task.status,'queued');
    assert.equal((await call('/api/state','GET',undefined,{Cookie:cookie})).status,200);
    assert.equal((await call('/api/tasks','POST',{description:'uji',division:'social',kind:'draft'})).status,401);
    const logout = await call('/api/logout','POST',{}, {Cookie:cookie});
    assert.equal(logout.status,200);
    assert.equal((await call('/api/state','GET',undefined,{Cookie:cookie})).status,401);
  } finally { sqlite.close(); }
});
