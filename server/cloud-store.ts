import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { divisions, owner } from '../public/catalog.js';
import { employeePlans } from '../public/behavior.js';
import { canDispatch, defaults, phase, validSchedule, scheduledDraftDay, scheduledDraftDailyLimit } from './schedule.ts';
import { Fault, validateWorkerTaskId } from './store.ts';

// All timestamps remain Unix milliseconds to preserve existing SQLite API contracts.
pg.types.setTypeParser(20, value => Number(value));

const leaseDuration = 120_000;
const draftLeaseDuration = 10 * 60_000;
const leaseFor = kind => kind === 'draft' ? draftLeaseDuration : leaseDuration;
const kindsAllowed = ['diagnostic', 'draft'];
const fields = `id,request_id,creator,division,project,description,kind,priority,status,
  urgent,created,started,ended,attempts,lease,lease_until,result,sha256,error`;
const publicTask = ({ seq, lease, lease_until, result, ...task }) => task;

export function createCloudStore(connectionString = process.env.DATABASE_URL, now = Date.now) {
  if (!connectionString) throw new Error('DATABASE_URL belum dikonfigurasi pada server.');
  const pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000, allowExitOnIdle: true });
  const query = (sql, params = [], client = pool) => client.query(sql, params);
  const one = async (sql, params = [], client = pool) => (await query(sql, params, client)).rows[0];
  const rows = async (sql, params = [], client = pool) => (await query(sql, params, client)).rows;

  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async function readSetting(key, fallback, client = pool) {
    const setting = await one('SELECT value FROM anshel.setting WHERE key=$1', [key], client);
    return setting ? JSON.parse(setting.value) : fallback;
  }
  const writeSetting = (key, value, client) => query(
    'INSERT INTO anshel.setting(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key, JSON.stringify(value)], client);
  const log = (task, actor, action, detail = '', client) => query(
    'INSERT INTO anshel.audit(at,task,actor,action,detail) VALUES($1,$2,$3,$4,$5)',
    [now(), task, actor, action, detail], client);
  const find = (id, client = pool) => one(`SELECT ${fields} FROM anshel.tasks WHERE id=$1`, [id], client);
  async function current(client = pool) {
    return phase(new Date(now()), await readSetting('schedule', defaults, client), await readSetting('mode', 'auto', client));
  }
  async function expireLeases(client) {
    const expired = await rows(`UPDATE anshel.tasks
      SET status='blocked',lease=NULL,lease_until=NULL,error=$2
      WHERE status='running' AND lease_until<=$1 RETURNING id`,
      [now(), 'Worker berhenti merespons. Jalankan ulang dari panel tugas.'], client);
    for (const task of expired) await log(task.id, 'worker', 'blocked', 'Sewa eksekusi kedaluwarsa', client);
  }
  async function activeLease(id, token, client) {
    if (typeof id !== 'string' || typeof token !== 'string') throw new Fault(400, 'Identitas eksekusi tidak valid.');
    const task = await one(`SELECT ${fields} FROM anshel.tasks WHERE id=$1 FOR UPDATE`, [id], client);
    if (!task || task.status !== 'running' || !token || task.lease !== token || task.lease_until <= now()) {
      throw new Fault(409, 'Sewa eksekusi sudah berakhir.');
    }
    return task;
  }

  return {
    close: () => pool.end(),
    async claimTelegramNotification() {
      return transaction(async client => {
        await query('SELECT pg_advisory_xact_lock(17293107)',[],client);
        const key='telegram_notifications_v1';
        const checkpoint=await readSetting(key,null,client);
        if (!checkpoint) {
          const row=await one('SELECT COALESCE(MAX(id),0) AS id FROM anshel.audit',[],client);
          await writeSetting(key,{cursor:row.id,pending:null,date:'',used:0,lastSent:0},client);
          return null;
        }
        if (checkpoint.pending && checkpoint.pending.until > now()) return null;
        const today=scheduledDraftDay(new Date(now()));
        const used=checkpoint.date===today?(checkpoint.used||0):0;
        if (used>=3 || now()-(checkpoint.lastSent||0)<60*60_000) return null;
        const sql='SELECT a.id AS "eventId",a.at,a.task AS "taskId",a.action, '+
          't.division,t.project FROM anshel.audit AS a JOIN anshel.tasks AS t ON t.id=a.task '+
          "WHERE a.id>$1 AND a.at>=$2 AND a.action IN ('completed','blocked','failed') "+
          'ORDER BY a.id LIMIT 1';
        const event=await one(sql,[checkpoint.cursor,now()-24*60*60_000],client);
        if (!event) return null;
        const token=randomUUID();
        await writeSetting(key,{...checkpoint,pending:{id:event.eventId,token,until:now()+10*60_000}},client);
        return {...event,token};
      });
    },
    async ackTelegramNotification(eventId,token,sent=true) {
      if (!Number.isSafeInteger(eventId) || eventId<1 || typeof token !== 'string' || !token ||
          typeof sent!=='boolean') throw new Fault(400,'Konfirmasi notifikasi tidak valid.');
      return transaction(async client => {
        await query('SELECT pg_advisory_xact_lock(17293107)',[],client);
        const key='telegram_notifications_v1';
        const checkpoint=await readSetting(key,null,client);
        if (!checkpoint?.pending || checkpoint.pending.id!==eventId ||
          checkpoint.pending.token!==token || checkpoint.pending.until<=now()) {
          throw new Fault(409,'Sewa notifikasi sudah berakhir atau tidak cocok.');
        }
        const today=scheduledDraftDay(new Date(now()));
        const used=checkpoint.date===today?(checkpoint.used||0):0;
        await writeSetting(key,{cursor:eventId,pending:null,date:today,
          used:used+(sent?1:0),lastSent:sent?now():(checkpoint.lastSent||0)},client);
      });
    },
    async reserveOfficeGroupUpdate(updateId) {
      if (typeof updateId !== 'string' || !/^[0-9]{1,24}$/.test(updateId)) throw new Fault(400,'ID pesan Telegram tidak valid.');
      return transaction(async client => {
        await query('SELECT pg_advisory_xact_lock(17293108)',[],client);
        const key='office_group_updates_v1';
        const snapshot=await readSetting(key,{seen:[],at:0,date:'',used:0},client);
        const cutoff=now()-24*3600_000;
        const seen=(snapshot.seen||[]).filter(item => item.at>cutoff).slice(-100);
        if (seen.some(item => item.id===updateId)) return false;
        const today=scheduledDraftDay(new Date(now()));
        const used=snapshot.date===today ? snapshot.used : 0;
        if (now()-snapshot.at<8000 || used>=20) throw new Fault(429,'Batas pesan grup tercapai. Coba lagi nanti.');
        seen.push({id:updateId,at:now()});
        await writeSetting(key,{seen,at:now(),date:today,used:used+1},client);
        return true;
      });
    },
    async prepareOfficeGroupAI(updateId, division, question) {
      if (typeof updateId!=='string' || !/^[0-9]{1,24}$/.test(updateId) ||
          !divisions.some(d=>d.id===division) || typeof question!=='string' ||
          !question.trim() || question.length>1500) throw new Fault(400,'Permintaan percakapan tidak valid.');
      return transaction(async client => {
        await query('SELECT pg_advisory_xact_lock(17293109)',[],client);
        const pending=await readSetting('office_group_ai_pending_v1',{},client);
        const cleanPending=Object.fromEntries(Object.entries(pending).filter(([,p])=>p.until>now()));
        const history=(await readSetting('office_group_ai_history_v1',[],client))
          .filter(h=>h.division===division && h.at>now()-7*24*3600_000)
          .slice(-6).map(h=>({question:h.question,reply:h.reply}));
        const ticket=randomUUID();
        cleanPending[updateId]={ticket,division,question:question.trim(),until:now()+5*60_000};
        await writeSetting('office_group_ai_pending_v1',cleanPending,client);
        return {ticket,history};
      });
    },
    async consumeOfficeGroupAI(updateId,ticket) {
      if (typeof updateId!=='string' || !/^[0-9]{1,24}$/.test(updateId) ||
          typeof ticket!=='string' || !/^[a-f0-9-]{36}$/.test(ticket)) {
        throw new Fault(400,'Tiket percakapan tidak valid.');
      }
      return transaction(async client => {
        await query('SELECT pg_advisory_xact_lock(17293109)',[],client);
        const pending=await readSetting('office_group_ai_pending_v1',{},client);
        const item=pending[updateId];
        if (!item || item.ticket!==ticket || item.until<=now()) {
          throw new Fault(409,'Tiket percakapan sudah digunakan atau kedaluwarsa.');
        }
        delete pending[updateId];
        await writeSetting('office_group_ai_pending_v1',pending,client);
        return {division:item.division,question:item.question};
      });
    },
    async rememberOfficeGroupAI(division,question,reply) {
      if (!divisions.some(d=>d.id===division) || typeof question!=='string' ||
          typeof reply!=='string') throw new Fault(400,'Riwayat percakapan tidak valid.');
      return transaction(async client => {
        await query('SELECT pg_advisory_xact_lock(17293109)',[],client);
        const key='office_group_ai_history_v1';
        const memory=(await readSetting(key,[],client)).filter(h=>h.at>now()-7*24*3600_000).slice(-23);
        memory.push({division,question:question.slice(0,350),reply:reply.slice(0,500),at:now()});
        await writeSetting(key,memory,client);
      });
    },
    async sessionActive(token) {
      const hash = createHash('sha256').update(token).digest('hex');
      const session = await one('SELECT expires_at FROM anshel.sessions WHERE token_hash=$1', [hash]);
      return !!session && session.expires_at > now();
    },
    async createSession(token, expiresAt) {
      const hash = createHash('sha256').update(token).digest('hex');
      await query('DELETE FROM anshel.sessions WHERE expires_at<=$1',[now()]);
      await query('INSERT INTO anshel.sessions(token_hash,expires_at,created_at) VALUES($1,$2,$3)',
        [hash, expiresAt, now()]);
    },
    async deleteSession(token) {
      const hash = createHash('sha256').update(token).digest('hex');
      await query('DELETE FROM anshel.sessions WHERE token_hash=$1', [hash]);
    },
    async recordLogin(clientKey, valid) {
      return transaction(async client => {
        const time = now();
        await query(`INSERT INTO anshel.login_limits(client_key,window_start,attempts)
          VALUES($1,$2,0) ON CONFLICT(client_key) DO NOTHING`, [clientKey,time],client);
        const limit = await one('SELECT * FROM anshel.login_limits WHERE client_key=$1 FOR UPDATE', [clientKey],client);
        const activeWindow = time-limit.window_start < 60_000;
        if (activeWindow && limit.attempts >= 8) throw new Fault(429,'Terlalu banyak percobaan. Coba lagi satu menit.');
        await query('UPDATE anshel.login_limits SET window_start=$2,attempts=$3 WHERE client_key=$1',
          [clientKey,activeWindow ? limit.window_start : time,valid ? 0 : (activeWindow ? limit.attempts+1 : 1)],client);
      });
    },
    async state() {
      await transaction(expireLeases);
      const running = await rows(`SELECT id,division,description,status,kind,started FROM anshel.tasks
        WHERE status='running' AND lease_until>$1`, [now()]);
      const assigned = await rows(`SELECT id,division,description,status,kind FROM (
        SELECT id,division,description,status,kind,
          row_number() OVER (PARTITION BY division ORDER BY priority DESC,created,seq) AS rank
        FROM anshel.tasks WHERE status IN ('queued','blocked')
      ) AS ranked WHERE rank=1`);
      const officePhase = await current();
      const simulation = officePhase === 'paused' ? await readSetting('paused_at', null) : null;
      const taskRows = await rows(`SELECT ${fields} FROM anshel.tasks ORDER BY created DESC,seq DESC LIMIT 150`);
      const counts = await rows('SELECT status,count(*)::integer AS count FROM anshel.tasks GROUP BY status');
      const projects = await rows(`SELECT project,status,count(*)::integer AS count FROM anshel.tasks
        WHERE project<>'' GROUP BY project,status ORDER BY project`);
      return {
        now: now(), phase: officePhase, mode: await readSetting('mode', 'auto'),
        schedule: await readSetting('schedule', defaults),
        worker: now() - await readSetting('worker_at', -Infinity) < 40_000,
        capabilities: await readSetting('worker_kinds', []),
        tasks: taskRows.map(publicTask), running,
        people: employeePlans(simulation?.at ?? now(), simulation?.phase ?? officePhase, running, assigned),
        counts: Object.fromEntries(counts.map(row => [row.status, row.count])),
        projects, audit: await rows('SELECT * FROM anshel.audit ORDER BY id DESC LIMIT 60'),
      };
    },
    async create(input, actor = owner, requestId = null) {
      const { division, kind, description, project = '', priority = 0, urgent = false } = input;
      if (!divisions.some(item => item.id === division) || !kindsAllowed.includes(kind) ||
          typeof description !== 'string' || !description.trim() || description.length > 2000 ||
          typeof project !== 'string' || project.length > 80 || ![0, 1, 2].includes(priority) ||
          typeof urgent !== 'boolean' ||
          (requestId !== null && (typeof requestId !== 'string' || requestId.length > 120))) {
        throw new Fault(400, 'Isi tugas, divisi, dan jenis eksekusi yang valid.');
      }
      return transaction(async client => {
        if (requestId) {
          const existing = await one(`SELECT ${fields} FROM anshel.tasks WHERE request_id=$1`, [requestId], client);
          if (existing) {
            if (existing.division !== division || existing.kind !== kind || existing.description !== description.trim() ||
                existing.project !== project.trim() || existing.priority !== priority || existing.urgent !== Number(urgent)) {
              throw new Fault(409, 'Kunci permintaan sudah digunakan untuk tugas berbeda.');
            }
            return publicTask(existing);
          }
        }
        const id = randomUUID();
        const inserted = await one(`INSERT INTO anshel.tasks
          (id,request_id,creator,division,project,description,kind,priority,status,urgent,created)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9,$10)
          ON CONFLICT (request_id) DO NOTHING RETURNING ${fields}`,
          [id, requestId, actor, division, project.trim(), description.trim(), kind, priority, Number(urgent), now()], client);
        if (!inserted) {
          // A simultaneous call with the same idempotency key won the race.
          const existing = await one(`SELECT ${fields} FROM anshel.tasks WHERE request_id=$1`, [requestId], client);
          if (existing && existing.division === division && existing.kind === kind &&
              existing.description === description.trim() && existing.project === project.trim() &&
              existing.priority === priority && existing.urgent === Number(urgent)) return publicTask(existing);
          throw new Fault(409, 'Kunci permintaan sudah digunakan untuk tugas berbeda.');
        }
        await log(id, actor, 'created', description.trim(), client);
        await log(id, actor, 'queued', '', client);
        return publicTask(inserted);
      });
    },
    async action(id, action, input = {}, actor = owner) {
      return transaction(async client => {
        const task = await one(`SELECT ${fields} FROM anshel.tasks WHERE id=$1 FOR UPDATE`, [id], client);
        if (!task) throw new Fault(404, 'Tugas tidak ditemukan.');
        const allowed = {
          cancel: ['queued', 'running', 'paused', 'blocked', 'awaiting_approval'],
          pause: ['queued', 'running'], resume: ['paused'], retry: ['failed', 'blocked'],
          approve: ['awaiting_approval'], reject: ['awaiting_approval'],
          assign: ['queued', 'paused', 'blocked'], review: ['queued'],
        };
        if (!Object.hasOwn(allowed, action) || !allowed[action].includes(task.status)) {
          throw new Fault(409, 'Tindakan ini tidak tersedia pada status tersebut.');
        }
        if (action === 'assign') {
          if (!divisions.some(item => item.id === input.division)) throw new Fault(400, 'Divisi tidak valid.');
          await query('UPDATE anshel.tasks SET division=$1 WHERE id=$2', [input.division, id], client);
          await log(id, actor, 'assigned', input.division, client);
          return publicTask((await find(id, client)));
        }
        const status = { cancel:'cancelled', pause:'paused', resume:'queued', retry:'queued',
          approve:'queued', reject:'cancelled', review:'awaiting_approval' }[action];
        await query(`UPDATE anshel.tasks SET status=$1,lease=NULL,lease_until=NULL,error=NULL,ended=$2 WHERE id=$3`,
          [status, status === 'cancelled' ? now() : null, id], client);
        await log(id, actor, action, '', client);
        return publicTask((await find(id, client)));
      });
    },
    async settings(input, actor = owner) {
      if (input.mode !== undefined && !['auto','open','closed','paused','overtime'].includes(input.mode)) {
        throw new Fault(400, 'Mode kantor tidak valid.');
      }
      if (input.schedule !== undefined && !validSchedule(input.schedule)) throw new Fault(400, 'Periksa urutan dan format jadwal.');
      return transaction(async client => {
        if (input.mode === 'paused' && await readSetting('mode', 'auto', client) !== 'paused') {
          await writeSetting('paused_at', { at:now(), phase:await current(client) }, client);
        }
        for (const key of ['mode','schedule']) {
          if (input[key] === undefined) continue;
          await writeSetting(key, input[key], client);
          await log(null, actor, key, JSON.stringify(input[key]), client);
        }
        return { mode: await readSetting('mode', 'auto', client), schedule: await readSetting('schedule', defaults, client) };
      });
    },
    async claim(kinds, taskId = null, scheduled = false) {
      if (!Array.isArray(kinds) || kinds.length > kindsAllowed.length || !kinds.every(kind => kindsAllowed.includes(kind))) {
        throw new Fault(400, 'Kapabilitas worker tidak valid.');
      }
      validateWorkerTaskId(taskId);
      if (scheduled && (taskId !== null || kinds.length !== 1 || kinds[0] !== 'draft')) {
        throw new Fault(400,'Jadwal hanya dapat mengklaim satu draf AI.');
      }
      return transaction(async client => {
        // Serialize claims across cloud functions; retain one-running-task-per-division.
        await query('SELECT pg_advisory_xact_lock(17293105)', [], client);
        await writeSetting('worker_at', now(), client);
        await writeSetting('worker_kinds', kinds, client);
        await expireLeases(client);
        const officePhase = await current(client);
        if (!kinds.length || officePhase === 'paused' || (scheduled && !canDispatch(officePhase))) return null;
        let used = 0;
        const day = scheduled ? scheduledDraftDay(new Date(now())) : '';
        if (scheduled) {
          const quota = await readSetting('scheduled_draft_quota', null, client);
          used = quota?.date === day && Number.isSafeInteger(quota.used) && quota.used >= 0 ? quota.used : 0;
          if (used >= scheduledDraftDailyLimit) return null;
        }
        const task = await one(`SELECT ${fields} FROM anshel.tasks AS queued WHERE status='queued'
          AND kind=ANY($1::text[]) AND ($2 OR urgent=1)
          AND NOT EXISTS (SELECT 1 FROM anshel.tasks WHERE status='running' AND division=queued.division)
          AND ($3::text IS NULL OR queued.id=$3)
          ORDER BY priority DESC,created,seq LIMIT 1 FOR UPDATE OF queued SKIP LOCKED`,
          [kinds, canDispatch(officePhase), taskId], client);
        if (!task) return null;
        if (scheduled) {
          await writeSetting('scheduled_draft_quota',{date:day,used:used+1},client);
          await log(task.id,'worker','scheduled_reserved',day+' '+(used+1)+'/'+scheduledDraftDailyLimit,client);
        }
        const token = randomUUID();
        await query(`UPDATE anshel.tasks SET status='running',started=$1,attempts=attempts+1,lease=$2,lease_until=$3 WHERE id=$4`,
          [now(), token, now()+leaseFor(task.kind), task.id], client);
        await log(task.id, 'worker', 'assigned', task.division, client);
        await log(task.id, 'worker', 'running', '', client);
        return { ...publicTask(await find(task.id, client)), token };
      });
    },
    async heartbeat(id, token) {
      return transaction(async client => {
        const active = await activeLease(id, token, client);
        await writeSetting('worker_at', now(), client);
        await query('UPDATE anshel.tasks SET lease_until=$1 WHERE id=$2', [now()+leaseFor(active.kind),id], client);
      });
    },
    async finish(id, token, input) {
      return transaction(async client => {
        await activeLease(id, token, client);
        if (typeof input.error === 'string' && input.error.trim()) {
          const status = input.unavailable === true ? 'blocked' : 'failed';
          const detail = input.error.slice(0, 1000);
          await query(`UPDATE anshel.tasks SET status=$1,ended=$2,error=$3,lease=NULL,lease_until=NULL WHERE id=$4`,
            [status,now(),detail,id], client);
          await log(id, 'worker', status, detail, client);
          return;
        }
        const { output } = input;
        if (typeof output !== 'string' || !output.trim() || output.length > 100_000) {
          throw new Fault(400, 'Artefak hasil wajib tersedia dan berisi data.');
        }
        const hash = createHash('sha256').update(output).digest('hex');
        await query(`UPDATE anshel.tasks SET status='completed',result=$1,sha256=$2,ended=$3,
          lease=NULL,lease_until=NULL WHERE id=$4`, [output,hash,now(),id], client);
        await log(id, 'worker', 'completed', hash, client);
      });
    },
    async artifact(id) {
      const task = await find(id);
      if (!task || task.status !== 'completed') throw new Fault(404, 'Artefak belum tersedia.');
      return { output: task.result, hash: task.sha256 };
    },
  };
}
