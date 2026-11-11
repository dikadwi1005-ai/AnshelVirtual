import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const secret = () => randomBytes(24).toString('base64url');
const template = await readFile('.env.example','utf8');
const config = template.replace(/^OWNER_PASSWORD=$/m,'OWNER_PASSWORD='+secret())
  .replace(/^WORKER_TOKEN=$/m,'WORKER_TOKEN='+secret());

try {
  await writeFile('.env',config,{flag:'wx',mode:0o600});
  console.log('Konfigurasi privat dibuat di .env. Buka file lokal untuk menyalin OWNER_PASSWORD.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env sudah tersedia. Gunakan konfigurasi yang tersimpan.');
}
