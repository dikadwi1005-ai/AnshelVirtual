import { DatabaseSync } from 'node:sqlite';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('data/office.sqlite');
await stat(source);
await mkdir('data/backups',{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const target = resolve('data/backups/office-'+stamp+'.sqlite');
const db = new DatabaseSync(source);
try { db.prepare('VACUUM INTO ?').run(target); }
finally { db.close(); }

const backup = new DatabaseSync(target,{readOnly:true});
try {
  if (backup.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Cadangan tidak lolos pemeriksaan.');
} finally { backup.close(); }
console.log(target);
