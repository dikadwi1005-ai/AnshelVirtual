import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { divisions, owner } from '../public/catalog.js';
import { employeePlans } from '../public/behavior.js';
import { canDispatch, defaults, phase, validSchedule, scheduledDraftDay, scheduledDraftDailyLimit } from './schedule.ts';
import { evaluateOwnerGroupUpdate,ownerMessageDailyLimit,ownerMessageMinimumGapMs } from './telegram-owner-limits.ts';
import {emptyGroupWorkspace,applyGroupWorkspaceCommand} from './telegram-workspace.ts';

export class Fault extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function validateWorkerTaskId(taskId) {
  if (taskId !== null && (typeof taskId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(taskId))) {
    throw new Fault(400,'ID tugas worker tidak valid.');
  }
}

const leaseDuration = 120_000;
const draftLeaseDuration = 10 * 60_000;
const leaseFor = kind => kind === 'draft' ? draftLeaseDuration : leaseDuration;
const types = ['diagnostic','draft'];

export function createStore(path: string, now = Date.now) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS setting(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks(
      id TEXT PRIMARY KEY, request_id TEXT UNIQUE, creator TEXT NOT NULL, division TEXT NOT NULL,
      project TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL, priority INTEGER NOT NULL,
      status TEXT NOT NULL, urgent INTEGER NOT NULL, created INTEGER NOT NULL, started INTEGER,
      ended INTEGER, attempts INTEGER DEFAULT 0, lease TEXT, lease_until INTEGER,
      result TEXT, sha256 TEXT, error TEXT
    );
    CREATE TABLE IF NOT EXISTS audit(
      id INTEGER PRIMARY KEY, at INTEGER NOT NULL, task TEXT REFERENCES tasks(id), actor TEXT NOT NULL,
      action TEXT NOT NULL, detail TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tasks_queue ON tasks(status, priority DESC, created);
  `);

  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const readSetting = (key, fallback) => {
    const row = get('SELECT value FROM setting WHERE key=?',key);
    return row ? JSON.parse(row.value) : fallback;
  };
  const writeSetting = (key,value) => run('INSERT INTO setting VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
  const log = (task,actor,action,detail = '') =>
    run('INSERT INTO audit(at,task,actor,action,detail) VALUES(?,?,?,?,?)',now(),task,actor,action,detail);
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch(error) { db.exec('ROLLBACK'); throw error; }
  };

  const schedule = () => readSetting('schedule',defaults);
  const mode = () => readSetting('mode','auto');
  const current = () => phase(new Date(now()), schedule(), mode());
  const find = id => get('SELECT * FROM tasks WHERE id=?',id);
  const publicTask = ({lease,lease_until,result,...task}) => task;
  const activeLease = (id, token) => {
    if (typeof id !== 'string' || typeof token !== 'string') throw new Fault(400,'Identitas eksekusi tidak valid.');
    const task = find(id);
    if (!task || task.status !== 'running' || !token || task.lease !== token || task.lease_until <= now()) {
      throw new Fault(409,'Sewa eksekusi sudah berakhir.');
    }
    return task;
  };
  const expireLeases = () => {
    for (const expired of all("SELECT id FROM tasks WHERE status='running' AND lease_until<=?",now())) {
      run("UPDATE tasks SET status='blocked',lease=NULL,lease_until=NULL,error=? WHERE id=?",
        'Worker berhenti merespons. Jalankan ulang dari panel tugas.',expired.id);
      log(expired.id,'worker','blocked','Sewa eksekusi kedaluwarsa');
    }
  };

  return {
    close:() => db.close(),
    // Outbox notifications are stored in the existing setting table and survive restarts.
    claimTelegramNotification() {
      return transaction(() => {
        const key='telegram_notifications_v1';
        const checkpoint=readSetting(key,null);
        // First poll starts at the latest event, not historical tasks.
        if (!checkpoint) {
          const highest=get('SELECT COALESCE(MAX(id),0) AS id FROM audit').id;
          writeSetting(key,{cursor:highest,pending:null,date:'',used:0,lastSent:0});
          return null;
        }
        if (checkpoint.pending && checkpoint.pending.until > now()) return null;
        const today=scheduledDraftDay(new Date(now()));
        const used=checkpoint.date===today?(checkpoint.used||0):0;
        if (used>=3 || now()-(checkpoint.lastSent||0)<60*60_000) return null;
        const sql="SELECT a.id AS eventId,a.at,a.task AS taskId,a.action, "+
          "t.division,t.project FROM audit AS a JOIN tasks AS t ON t.id=a.task "+
          "WHERE a.id>? AND a.at>=? AND a.action IN ('completed','blocked','failed') "+
          "ORDER BY a.id LIMIT 1";
        const event=get(sql,checkpoint.cursor,now()-24*60*60_000);
        if (!event) return null;
        const token=randomUUID();
        writeSetting(key,{...checkpoint,pending:{id:event.eventId,token,until:now()+10*60_000}});
        return {...event,token};
      });
    },
    ackTelegramNotification(eventId,token,sent=true) {
      if (!Number.isSafeInteger(eventId) || eventId<1 || typeof token !== 'string' || !token ||
          typeof sent!=='boolean') throw new Fault(400,'Konfirmasi notifikasi tidak valid.');
      return transaction(() => {
        const key='telegram_notifications_v1';
        const checkpoint=readSetting(key,null);
        if (!checkpoint?.pending || checkpoint.pending.id!==eventId ||
          checkpoint.pending.token!==token || checkpoint.pending.until<=now()) {
          throw new Fault(409,'Sewa notifikasi sudah berakhir atau tidak cocok.');
        }
        const today=scheduledDraftDay(new Date(now()));
        const used=checkpoint.date===today?(checkpoint.used||0):0;
        writeSetting(key,{cursor:eventId,pending:null,date:today,
          used:used+(sent?1:0),lastSent:sent?now():(checkpoint.lastSent||0)});
      });
    },
    // An actual authenticated scheduler call is evidence of connectivity,
    // not evidence of n8n workflow health or successful Gemini requests.
    recordOfficeDispatchPulse() {
      return transaction(()=>{writeSetting('office_dispatch_seen_v1',now());return true;});
    },
    officeDispatchPulse() {return readSetting('office_dispatch_seen_v1',null);},
    officeGroupWorkspace() {
      return readSetting('office_group_workspace_v1',emptyGroupWorkspace());
    },
    applyOfficeGroupWorkspace(command) {
      return transaction(()=>{
        const state=readSetting('office_group_workspace_v1',emptyGroupWorkspace());
        const result=applyGroupWorkspaceCommand(state,command,now());
        writeSetting('office_group_workspace_v1',result.workspace);
        return result;
      });
    },
    claimDueOfficeReminder() {
      return transaction(()=>{
        const state=readSetting('office_group_workspace_v1',emptyGroupWorkspace());
        const selected=(state.reminders||[]).find(r=>!r.sent&&!r.uncertain&&r.due<=now()&&
          (!r.leaseUntil||r.leaseUntil<=now()));
        if(!selected)return null;
        selected.leaseUntil=now()+60_000;
        writeSetting('office_group_workspace_v1',state);
        return {id:selected.id,text:selected.text,date:selected.date,time:selected.time};
      });
    },
    ackOfficeReminder(id,sent,uncertain=false) {
      return transaction(()=>{
        const state=readSetting('office_group_workspace_v1',emptyGroupWorkspace());
        const r=(state.reminders||[]).find(x=>x.id===id);
        if(!r)return false;
        if(sent)r.sent=true;
        if(!sent&&uncertain)r.uncertain=true;
        delete r.leaseUntil;
        writeSetting('office_group_workspace_v1',state);
        return true;
      });
    },
    claimOfficeGroupSignal(kind) {
      if(!['daily-summary','queued-worker-silent','internal-event'].includes(kind)) throw new Fault(400,'Jenis notifikasi kantor tidak valid.');
      return transaction(()=>{
        const key='office_group_signals_v1';
        const today=scheduledDraftDay(new Date(now()));
        const checkpoint=readSetting(key,{date:'',sent:[]});
        const sent=checkpoint.date===today&&Array.isArray(checkpoint.sent)?checkpoint.sent:[];
        if(sent.includes(kind))return false;
        writeSetting(key,{date:today,sent:[...sent,kind]});
        return true;
      });
    },
    releaseOfficeGroupSignal(kind) {
      if(!['daily-summary','queued-worker-silent','internal-event'].includes(kind))
        throw new Fault(400,'Jenis notifikasi kantor tidak valid.');
      return transaction(()=>{
        const key='office_group_signals_v1';
        const today=scheduledDraftDay(new Date(now()));
        const checkpoint=readSetting(key,{date:'',sent:[]});
        if(checkpoint.date!==today)return false;
        const sent=(checkpoint.sent||[]).filter(x=>x!==kind);
        if(sent.length===(checkpoint.sent||[]).length)return false;
        writeSetting(key,{...checkpoint,sent});
        return true;
      });
    },
    claimOfficeGroupCheckin() {
      return transaction(() => {
        const key='office_virtual_checkin_v1';
        const day=scheduledDraftDay(new Date(now()));
        const value=readSetting(key,{date:''});
        if (value.date===day) return false;
        writeSetting(key,{date:day});
        return true;
      });
    },
    reserveOfficeGroupUpdate(updateId) {
      if (typeof updateId !== 'string' || !/^[0-9]{1,24}$/.test(updateId)) throw new Fault(400,'ID pesan Telegram tidak valid.');
      return transaction(() => {
        const key='office_group_updates_v1';
        const snapshot=readSetting(key,{seen:[],at:0,date:'',used:0});
        const day=scheduledDraftDay(new Date(now()));
        const result=evaluateOwnerGroupUpdate(snapshot,updateId,now(),day);
        if(result.duplicate) return false;
        if(result.reason==='daily-limit') throw new Fault(429,
          'Kuota '+ownerMessageDailyLimit+' pesan pemilik per hari WIB tercapai. Coba lagi setelah 00.00 WIB.');
        if(result.reason==='too-fast') throw new Fault(429,
          'Pesan terlalu cepat. Beri jeda minimal '+(ownerMessageMinimumGapMs/1000)+' detik sebelum mengirim berikutnya.');
        writeSetting(key,result.checkpoint);
        return true;
      });
    },
    prepareOfficeGroupAI(updateId, division, question, recipients = null) {
      if (typeof updateId!=='string' || !/^[0-9]{1,24}$/.test(updateId) ||
          !divisions.some(d=>d.id===division) || typeof question!=='string' ||
          !question.trim() || question.length>1500 || (recipients!==null &&
          (!Array.isArray(recipients)||recipients.length<1||recipients.length>5||
          recipients.some(id=>!['management','operations','administration','hr','marketing','research','social'].includes(id))||
          new Set(recipients).size!==recipients.length)))
        throw new Fault(400,'Permintaan percakapan tidak valid.');
      return transaction(() => {
        const pending=readSetting('office_group_ai_pending_v1',{});
        const cleanPending=Object.fromEntries(Object.entries(pending).filter(([,p])=>p.until>now()));
        const recent=readSetting('office_group_ai_history_v1',[])
          .filter(h=>h && h.at>now()-7*24*3600_000);
        const history=recent.filter(h=>h.division===division)
          .slice(-6).map(h=>({question:h.question,reply:h.reply}));
        // For team calls, recall multiple colleagues' prior Telegram replies,
        // never just Alya's history. Never expose unrelated divisions.
        const groupHistory=recipients?recent
          .filter(h=>['management','operations','administration','hr',
            ...['marketing','research','social'].filter(id=>recipients.includes(id))].includes(h.division))
          .slice(-12).map(h=>({division:h.division,question:h.question,reply:h.reply})) : null;
        const ticket=randomUUID();
        cleanPending[updateId]={ticket,division,question:question.trim(),until:now()+5*60_000,
          ...(recipients?{recipients}:{}),};
        writeSetting('office_group_ai_pending_v1',cleanPending);
        return {ticket,history,...(groupHistory?{groupHistory}:{})};
      });
    },
    consumeOfficeGroupAI(updateId,ticket) {
      if (typeof updateId!=='string' || !/^[0-9]{1,24}$/.test(updateId) ||
          typeof ticket!=='string' || !/^[a-f0-9-]{36}$/.test(ticket)) {
        throw new Fault(400,'Tiket percakapan tidak valid.');
      }
      return transaction(() => {
        const pending=readSetting('office_group_ai_pending_v1',{});
        const item=pending[updateId];
        if (!item || item.ticket!==ticket || item.until<=now()) {
          throw new Fault(409,'Tiket percakapan sudah digunakan atau kedaluwarsa.');
        }
        delete pending[updateId];
        writeSetting('office_group_ai_pending_v1',pending);
        return {division:item.division,question:item.question,
          ...(Array.isArray(item.recipients)?{recipients:item.recipients}:{}),};
      });
    },
    rememberOfficeGroupAI(division,question,reply) {
      if (!divisions.some(d=>d.id===division) || typeof question!=='string' ||
          typeof reply!=='string') throw new Fault(400,'Riwayat percakapan tidak valid.');
      return transaction(() => {
        const key='office_group_ai_history_v1';
        const memory=readSetting(key,[]).filter(h=>h.at>now()-7*24*3600_000).slice(-23);
        memory.push({division,question:question.slice(0,350),reply:reply.slice(0,500),at:now()});
        writeSetting(key,memory);
      });
    },
    state() {
      if (get("SELECT id FROM tasks WHERE status='running' AND lease_until<=? LIMIT 1",now())) transaction(expireLeases);
      const running = all("SELECT id,division,description,status,kind,started FROM tasks WHERE status='running' AND lease_until>?",now());
      const assigned = all(`SELECT id,division,description,status,kind FROM (
        SELECT id,division,description,status,kind,
          row_number() OVER (PARTITION BY division ORDER BY priority DESC,created,rowid) AS rank
        FROM tasks WHERE status IN ('queued','blocked')
      ) WHERE rank=1`);
      const officePhase = current();
      const simulation = officePhase === 'paused' ? readSetting('paused_at',null) : null;
      return {
        now:now(), phase:officePhase, mode:mode(), schedule:schedule(),
        worker: now() - readSetting('worker_at', -Infinity) < 40_000,
        capabilities: readSetting('worker_kinds',[]),
        tasks:all('SELECT * FROM tasks ORDER BY created DESC,rowid DESC LIMIT 150').map(publicTask),
        running, people:employeePlans(simulation?.at ?? now(),simulation?.phase ?? officePhase,running,assigned),
        counts:Object.fromEntries(all('SELECT status,count(*) AS count FROM tasks GROUP BY status').map(row=>[row.status,row.count])),
        projects:all("SELECT project,status,count(*) AS count FROM tasks WHERE project<>'' GROUP BY project,status ORDER BY project"),
        audit:all('SELECT * FROM audit ORDER BY id DESC LIMIT 60'),
      };
    },
    create(input, actor = owner, requestId = null) {
      const {division, kind, description, project = '', priority = 0, urgent = false} = input;
      if (!divisions.some(item => item.id === division) || !types.includes(kind) ||
          typeof description !== 'string' || !description.trim() || description.length > 2000 ||
          typeof project !== 'string' || project.length > 80 ||
          ![0,1,2].includes(priority) || typeof urgent !== 'boolean' ||
          (requestId !== null && (typeof requestId !== 'string' || requestId.length > 120))) {
        throw new Fault(400,'Isi tugas, divisi, dan jenis eksekusi yang valid.');
      }
      return transaction(() => {
        const existing = requestId && get('SELECT * FROM tasks WHERE request_id=?',requestId);
        if (existing) {
          if (existing.division !== division || existing.kind !== kind || existing.description !== description.trim() ||
              existing.project !== project.trim() || existing.priority !== priority || existing.urgent !== Number(urgent)) {
            throw new Fault(409,'Kunci permintaan sudah digunakan untuk tugas berbeda.');
          }
          return publicTask(existing);
        }
        const id = randomUUID();
        run('INSERT INTO tasks(id,request_id,creator,division,project,description,kind,priority,status,urgent,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          id,requestId,actor,division,project.trim(),description.trim(),kind,priority,'queued',Number(urgent),now());
        log(id,actor,'created',description.trim());
        log(id,actor,'queued');
        return publicTask(find(id));
      });
    },
    action(id, action, input = {}, actor = owner) {
      return transaction(() => {
        const task = find(id);
        if (!task) throw new Fault(404,'Tugas tidak ditemukan.');
        const allowed = {
          cancel:['queued','running','paused','blocked','awaiting_approval'],
          pause:['queued','running'], resume:['paused'], retry:['failed','blocked'],
          approve:['awaiting_approval'], reject:['awaiting_approval'],
          assign:['queued','paused','blocked'], review:['queued'],
        };
        if (!Object.hasOwn(allowed,action) || !allowed[action].includes(task.status)) {
          throw new Fault(409,'Tindakan ini tidak tersedia pada status tersebut.');
        }
        if (action === 'assign') {
          if (!divisions.some(item => item.id === input.division)) throw new Fault(400,'Divisi tidak valid.');
          run('UPDATE tasks SET division=? WHERE id=?',input.division,id);
          log(id,actor,'assigned',input.division);
          return publicTask(find(id));
        }
        const status = {cancel:'cancelled',pause:'paused',resume:'queued',retry:'queued',
          approve:'queued',reject:'cancelled',review:'awaiting_approval'}[action];
        run('UPDATE tasks SET status=?,lease=NULL,lease_until=NULL,error=NULL,ended=? WHERE id=?',
          status,status === 'cancelled' ? now() : null,id);
        log(id,actor,action);
        return publicTask(find(id));
      });
    },
    // Explicit artifact approval is independent of pre-execution /setujui.
    // Do not expose full result text in Telegram, only review metadata.
    officeArtifactReview(id) {
      validateWorkerTaskId(id);
      const task=find(id);
      if(!task)throw new Fault(404,'Tugas tidak ditemukan.');
      const records=readSetting('office_artifact_reviews_v1',{});
      const record=records[id];
      return {id:task.id,division:task.division,project:task.project,status:task.status,
        sha256:task.sha256||null,ended:task.ended||null,
        review:record?.sha256===task.sha256?record.decision:null};
    },
    decideOfficeArtifact(id,decision,reason='',actor=owner) {
      validateWorkerTaskId(id);
      if(!['approved','rejected'].includes(decision)||typeof reason!=='string'||reason.length>180)
        throw new Fault(400,'Keputusan review tidak valid.');
      return transaction(()=>{
        const task=find(id);
        if(!task)throw new Fault(404,'Tugas tidak ditemukan.');
        if(task.status!=='completed'||!task.sha256||!task.result)
          throw new Fault(409,'Hanya hasil draf yang selesai dan tersimpan dapat direview.');
        const key='office_artifact_reviews_v1';
        const previous=readSetting(key,{});
        if(previous[id]?.sha256===task.sha256&&previous[id]?.decision===decision)
          return {id,decision,sha256:task.sha256,duplicate:true};
        const trimmed=Object.entries(previous).slice(-149);
        const records=Object.fromEntries(trimmed);
        records[id]={decision,sha256:task.sha256,at:now()};
        writeSetting(key,records);
        log(id,actor,decision==='approved'?'artifact_approved':'artifact_rejected',reason.slice(0,160));
        return {id,decision,sha256:task.sha256,duplicate:false};
      });
    },
    settings(input, actor = owner) {
      if (input.mode !== undefined && !['auto','open','closed','paused','overtime'].includes(input.mode)) {
        throw new Fault(400,'Mode kantor tidak valid.');
      }
      if (input.schedule !== undefined && !validSchedule(input.schedule)) throw new Fault(400,'Periksa urutan dan format jadwal.');
      return transaction(() => {
        if (input.mode === 'paused' && mode() !== 'paused') writeSetting('paused_at',{at:now(),phase:current()});
        for (const key of ['mode','schedule']) {
          if (input[key] === undefined) continue;
          writeSetting(key,input[key]);
          log(null,actor,key,JSON.stringify(input[key]));
        }
        return {mode:mode(),schedule:schedule()};
      });
    },
    claim(kinds, taskId = null, scheduled = false) {
      if (!Array.isArray(kinds) || kinds.length > types.length || !kinds.every(kind => types.includes(kind))) {
        throw new Fault(400,'Kapabilitas worker tidak valid.');
      }
      validateWorkerTaskId(taskId);
      if (scheduled && (taskId !== null || kinds.length !== 1 || kinds[0] !== 'draft')) {
        throw new Fault(400,'Jadwal hanya dapat mengklaim satu draf AI.');
      }
      return transaction(() => {
        writeSetting('worker_at',now());
        writeSetting('worker_kinds',kinds);
        expireLeases();
        const officePhase = current();
        if (!kinds.length || officePhase === 'paused' || (scheduled && !canDispatch(officePhase))) return null;
        let used = 0;
        const day = scheduled ? scheduledDraftDay(new Date(now())) : '';
        if (scheduled) {
          const quota = readSetting('scheduled_draft_quota', null);
          used = quota?.date === day && Number.isSafeInteger(quota.used) && quota.used >= 0 ? quota.used : 0;
          if (used >= scheduledDraftDailyLimit) return null;
        }
        const placeholders = kinds.map(() => '?').join(',');
        const task = get(`SELECT * FROM tasks AS queued WHERE status='queued' AND kind IN (${placeholders})
          AND (? OR urgent=1) AND (? IS NULL OR queued.id=?) AND NOT EXISTS (
            SELECT 1 FROM tasks WHERE status='running' AND division=queued.division
          ) ORDER BY priority DESC,created,rowid LIMIT 1`,...kinds,Number(canDispatch(current())),taskId,taskId);
        if (!task) return null;
        if (scheduled) {
          writeSetting('scheduled_draft_quota',{date:day,used:used+1});
          log(task.id,'worker','scheduled_reserved',day+' '+(used+1)+'/'+scheduledDraftDailyLimit);
        }
        const token = randomUUID();
        run("UPDATE tasks SET status='running',started=?,attempts=attempts+1,lease=?,lease_until=? WHERE id=?",
          now(),token,now()+leaseFor(task.kind),task.id);
        log(task.id,'worker','assigned',task.division);
        log(task.id,'worker','running');
        return {...publicTask(find(task.id)),token};
      });
    },
    heartbeat(id,token) {
      return transaction(() => {
        const active=activeLease(id,token);
        writeSetting('worker_at',now());
        run('UPDATE tasks SET lease_until=? WHERE id=?',now()+leaseFor(active.kind),id);
      });
    },
    finish(id,token,input) {
      return transaction(() => {
        activeLease(id,token);
        if (typeof input.error === 'string' && input.error.trim()) {
          const status = input.unavailable === true ? 'blocked' : 'failed';
          const detail = input.error.slice(0,1000);
          run('UPDATE tasks SET status=?,ended=?,error=?,lease=NULL,lease_until=NULL WHERE id=?',status,now(),detail,id);
          log(id,'worker',status,detail);
          return;
        }
        const {output} = input;
        if (typeof output !== 'string' || !output.trim() || output.length > 100_000) {
          throw new Fault(400,'Artefak hasil wajib tersedia dan berisi data.');
        }
        const hash = createHash('sha256').update(output).digest('hex');
        run("UPDATE tasks SET status='completed',result=?,sha256=?,ended=?,lease=NULL,lease_until=NULL WHERE id=?",
          output,hash,now(),id);
        log(id,'worker','completed',hash);
      });
    },
    artifact(id) {
      const task = find(id);
      if (!task || task.status !== 'completed') throw new Fault(404,'Artefak belum tersedia.');
      return {output:task.result, hash:task.sha256};
    },
  };
}
