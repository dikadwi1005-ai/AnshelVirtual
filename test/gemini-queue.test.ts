import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createStore } from '../server/store.ts';
import { createCloudApi } from '../api/route.ts';

const workflow = JSON.parse(await readFile('workflows/office_gemini_queue.json', 'utf8'));
const order = [
  'Jalankan satu draf', 'Ambil satu draf antrean', 'Siapkan draf',
  'Gemini', 'Periksa hasil', 'Perpanjang sewa', 'Simpan hasil',
];
function runCode(name, json, prior = {}) {
  const node = workflow.nodes.find(node => node.name === name);
  return JSON.parse(JSON.stringify(runInNewContext('(()=>{' + node.parameters.jsCode + '})()', {
    $input: { first: () => ({ json }) },
    $: name => ({ first: () => ({ json: prior[name] }) }),
  })));
}

test('workflow antrean hanya manual, tidak menyimpan kredensial dan satu jalur', () => {
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.nodes.map(node => node.name), order);
  assert.equal(workflow.nodes.filter(node => node.type === 'n8n-nodes-base.manualTrigger').length, 1);
  assert.equal(workflow.nodes.filter(node => node.type === 'n8n-nodes-base.scheduleTrigger').length, 0);
  assert.ok(workflow.nodes.every(node => !node.credentials));
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveManualExecutions, false);
  const claim = workflow.nodes.find(node => node.name === 'Ambil satu draf antrean');
  assert.equal(claim.parameters.url, 'https://anshel-virtual.vercel.app/api/worker/claim');
  assert.match(claim.parameters.jsonBody, /kinds:\s*\['draft'\]/);
  assert.doesNotMatch(claim.parameters.jsonBody, /taskId/);
  for (let i = 0; i < order.length - 1; i++) {
    assert.equal(workflow.connections[order[i]].main[0][0].node, order[i + 1]);
  }
  assert.deepEqual(runCode('Siapkan draf', { task: null }), []);
});

test('manual trigger mengambil hanya satu draf sesuai prioritas lalu menyimpan artefak', async () => {
  const store = createStore(':memory:', () => Date.parse('2026-11-12T04:30:00Z'));
  const env = { OWNER_PASSWORD: 'fixture-password-only', WORKER_TOKEN: 'fixture-worker-token-only-24' };
  const api = createCloudApi({
    ...store, recordLogin: async () => {}, createSession: async () => {},
    sessionActive: async () => false,
  }, env);
  const call = (path, body, worker = true) => api.fetch(new Request('https://anshel.fixture/api/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(worker ? { Authorization: 'Bearer ' + env.WORKER_TOKEN } : {}),
    },
    body: JSON.stringify(body),
  }));
  try {
    const low = store.create({ division: 'finance', description: 'Draf anggaran', kind: 'draft', priority: 0, urgent: true });
    const high = store.create({ division: 'management', description: 'Tiga agenda rapat', kind: 'draft', priority: 2, urgent: true });
    assert.equal((await call('worker/claim', { kinds: ['draft'] }, false)).status, 401);
    const response = await call('worker/claim', { kinds: ['draft'] });
    assert.equal(response.status, 200);
    const { task } = await response.json();
    assert.equal(task.id, high.id);
    assert.equal(store.state().tasks.find(row => row.id === low.id).status, 'queued');
    const [{ json: prepared }] = runCode('Siapkan draf', { task });
    assert.equal(prepared.id, high.id);
    assert.equal(prepared.request.contents[0].parts[0].text, high.description);
    assert.match(prepared.request.systemInstruction.parts[0].text, /divisi Manajemen/);
    assert.doesNotMatch(JSON.stringify(prepared.request), new RegExp(task.token));
    const [{ json: result }] = runCode('Periksa hasil', {
      statusCode: 200, body: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Rapat: agenda satu, dua, tiga.' }] } }] },
    }, { 'Siapkan draf': prepared });
    assert.equal((await call('worker/heartbeat', { id: result.id, token: result.token })).status, 200);
    assert.equal((await call('worker/finish', result)).status, 200);
    const stored = store.state().tasks.find(row => row.id === high.id);
    assert.equal(stored.status, 'completed');
    assert.equal(stored.sha256, createHash('sha256').update(result.output).digest('hex'));
    assert.equal(store.state().tasks.find(row => row.id === low.id).status, 'queued');
    assert.equal(workflow.nodes.find(node => node.name === 'Simpan hasil').parameters.jsonBody.includes("Periksa hasil"), true);
    const second = await (await call('worker/claim', { kinds: ['draft'] })).json();
    assert.equal(second.task.id, low.id);
  } finally { store.close(); }
});
