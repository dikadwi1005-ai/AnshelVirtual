import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';

// One-time, non-destructive transfer of the existing local SQLite data.
// Never upload data/office.sqlite to GitHub or a Vercel deployment.
const path = resolve(process.argv[2] || 'data/office.sqlite');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Atur DATABASE_URL secara lokal hanya saat menjalankan migrasi.');
const details = await stat(path).catch(() => null);
if (!details?.isFile()) throw new Error('File SQLite tidak ditemukan: ' + path);

const taskColumns = ['id','seq','request_id','creator','division','project','description','kind','priority',
  'status','urgent','created','started','ended','attempts','lease','lease_until','result','sha256','error'];
const sqlite = new DatabaseSync(path, { readOnly: true });
let local;
try {
  sqlite.exec('BEGIN');
  if (sqlite.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') {
    throw new Error('SQLite tidak lolos pemeriksaan integritas.');
  }
  local = {
    setting: sqlite.prepare('SELECT key,value FROM setting ORDER BY key COLLATE BINARY').all(),
    tasks: sqlite.prepare('SELECT rowid AS seq,* FROM tasks ORDER BY rowid').all(),
    audit: sqlite.prepare('SELECT * FROM audit ORDER BY id').all(),
  };
} finally { sqlite.close(); }

for (const task of local.tasks) {
  if (task.status === 'running') throw new Error('SQLite masih memiliki tugas berjalan. Selesaikan atau rekonsiliasi tugas sebelum migrasi.');
  if ((task.result === null) !== (task.sha256 === null) ||
      (task.sha256 !== null && createHash('sha256').update(task.result).digest('hex') !== task.sha256)) {
    throw new Error('Checksum artefak SQLite tidak cocok untuk tugas ' + task.id);
  }
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1,
  types:{getTypeParser:oid=>oid===20?Number:pg.types.getTypeParser(oid)},
});
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query('LOCK TABLE anshel.setting, anshel.tasks, anshel.audit IN SHARE ROW EXCLUSIVE MODE');
  const current = await client.query(`SELECT
    (SELECT count(*) FROM anshel.setting)::integer AS setting,
    (SELECT count(*) FROM anshel.tasks)::integer AS tasks,
    (SELECT count(*) FROM anshel.audit)::integer AS audit`);
  if (Object.values(current.rows[0]).some(count => count > 0)) {
    throw new Error('Supabase sudah berisi data Anshel. Migrasi dibatalkan agar tidak mengubah data yang ada.');
  }
  for (const row of local.setting) {
    await client.query('INSERT INTO anshel.setting(key,value) VALUES($1,$2)', [row.key,row.value]);
  }
  for (const row of local.tasks) {
    const params = taskColumns.map(col => row[col]);
    const placeholders = taskColumns.map((_,i) => '$'+(i+1)).join(',');
    await client.query(`INSERT INTO anshel.tasks(${taskColumns.join(',')}) VALUES(${placeholders})`,params);
  }
  for (const row of local.audit) {
    await client.query('INSERT INTO anshel.audit(id,at,task,actor,action,detail) VALUES($1,$2,$3,$4,$5,$6)',
      [row.id,row.at,row.task,row.actor,row.action,row.detail]);
  }
  const actual = {
    setting:(await client.query('SELECT key,value FROM anshel.setting ORDER BY key COLLATE "C"')).rows,
    tasks:(await client.query(`SELECT ${taskColumns.join(',')} FROM anshel.tasks ORDER BY seq`)).rows,
    audit:(await client.query('SELECT * FROM anshel.audit ORDER BY id')).rows,
  };
  for (const table of Object.keys(local)) {
    if (!isDeepStrictEqual(actual[table],local[table].map(row=>({...row})))) {
      throw new Error('Isi data berbeda pada tabel ' + table);
    }
  }
  if (local.tasks.length) {
    await client.query(`SELECT setval(pg_get_serial_sequence('anshel.tasks','seq'),
      (SELECT max(seq) FROM anshel.tasks), true)`);
  }
  if (local.audit.length) {
    await client.query(`SELECT setval(pg_get_serial_sequence('anshel.audit','id'),
      (SELECT max(id) FROM anshel.audit), true)`);
  }
  await client.query('COMMIT');
  console.log('Migrasi selesai:', Object.fromEntries(Object.keys(local).map(name => [name,local[name].length])));
} catch (error) {
  if (client) await client.query('ROLLBACK');
  throw error;
} finally {
  client?.release();
  await pool.end();
}
