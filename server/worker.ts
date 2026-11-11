import { setTimeout as delay } from 'node:timers/promises';
import { freemem, totalmem, availableParallelism, platform, arch } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { divisions } from '../public/catalog.js';

const office = process.env.OFFICE_URL || 'http://127.0.0.1:4310';
const ollama = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const model = process.env.OLLAMA_MODEL?.trim();
const token = process.env.WORKER_TOKEN;
const kinds = model ? ['diagnostic','draft'] : ['diagnostic'];

class WorkerError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function call(route, payload) {
  const response = await fetch(new URL('/api/worker/'+route,office),{
    method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(10_000),redirect:'error',
  });
  const body = await response.json();
  if (!response.ok) throw new WorkerError(response.status,body.error);
  return body;
}

function diagnostic() {
  const database = new DatabaseSync(':memory:');
  try {
    const check = database.prepare('PRAGMA quick_check').get().quick_check;
    if (check !== 'ok') throw new Error('Pemeriksaan SQLite gagal.');
    return JSON.stringify({ diperiksa:new Date().toISOString(), node:process.version,
      sistem:platform(), arsitektur:arch(), paralelisme:availableParallelism(),
      memoriTersediaByte:freemem(), memoriTotalByte:totalmem(), sqliteDalamMemori:check },null,2);
  } finally { database.close(); }
}

async function draft(task,signal) {
  const division = divisions.find(item => item.id === task.division);
  const response = await fetch(new URL('/api/generate',ollama),{
    method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',
    signal:AbortSignal.any([signal,AbortSignal.timeout(180_000)]),
    body:JSON.stringify({model, stream:false, options:{num_predict:3000},
      system:'Kamu '+division.employee+', '+division.role+' di Anshel Virtual Tech. Buat draf berbahasa Indonesia. Sebutkan data dan verifikasi yang belum tersedia. Jangan mengklaim sudah menjalankan alat, mengakses situs, atau menerbitkan sesuatu.',
      prompt:task.description}),
  }).catch(error => { if (error.name === 'TypeError') throw new WorkerError(503,'Ollama tidak dapat dijangkau.'); throw error; });
  if (!response.ok) throw new WorkerError(response.status,'Ollama mengembalikan HTTP '+response.status+'.');
  const data = await response.json();
  if (data.done !== true || typeof data.response !== 'string' || !data.response.trim()) throw new Error('Ollama tidak menghasilkan draf.');
  return 'Draf AI · '+model+'\nInstruksi: '+task.description+'\n\n'+data.response.trim();
}

async function execute(task) {
  const lease = {id:task.id,token:task.token};
  const controller = new AbortController();
  const timer = setInterval(async () => {
    try { await call('heartbeat',lease); }
    catch (error) { if (error.status === 409) controller.abort(); }
  },10_000);
  let result;
  try {
    result = {output:task.kind === 'diagnostic' ? diagnostic() : await draft(task,controller.signal)};
  } catch(error) {
    result = {error:error.message,unavailable:[404,503].includes(error.status)};
  } finally { clearInterval(timer); }
  if (!controller.signal.aborted) await call('finish',{...lease,...result});
}

if (!token || token.length < 24) throw new Error('Isi WORKER_TOKEN di .env dengan nilai minimal 24 karakter.');
const address = new URL(office);
if (address.protocol !== 'https:' && !(address.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(address.hostname))) {
  throw new Error('OFFICE_URL untuk host jarak jauh wajib menggunakan HTTPS.');
}

console.log('Worker Anshel Virtual Tech · '+kinds.join(', '));
let failure = '';
while (true) {
  try {
    const {task} = await call('claim',{kinds});
    failure = '';
    if (task) await execute(task);
  } catch(error) {
    if (failure !== error.message) console.error('Worker:',error.message);
    failure = error.message;
  }
  await delay(2500);
}
