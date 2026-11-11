import { divisions } from '../public/catalog.js';
import { Fault } from './store.ts';

const aliases = {
  manager:'management', manajemen:'management', developer:'development', pengembangan:'development',
  seo:'marketing', desain:'creative', 'video production':'video', video:'video', riset:'research',
  qa:'qa', it:'operations', administrasi:'administration', sdm:'hr', keuangan:'finance', sosmed:'social',
};
const actions = { '/setujui':'approve','/tolak':'reject','/jeda':'pause','/lanjut':'resume','/batal':'cancel','/ulang':'retry' };
const help = 'Perintah: /tugas divisi | instruksi, /diagnostik, /status, /pegawai, /laporan, /hasil ID, /alih ID divisi, /jeda ID, /lanjut ID, /batal ID, /setujui ID, /tolak ID, /ulang ID.';
const translate = key => divisions.find(item => item.id === (aliases[key.toLowerCase()] ?? key.toLowerCase()))?.id;
const taskList = tasks => tasks.map(task => [task.id, task.status, task.description.slice(0,85)].join(' · ')).join('\n');

export function telegram(store, data, env) {
  if (!env.TELEGRAM_USER_ID || !env.TELEGRAM_CHAT_ID) throw new Fault(503,'Telegram belum dikonfigurasi.');
  if (String(data.userId) !== env.TELEGRAM_USER_ID || String(data.chatId) !== env.TELEGRAM_CHAT_ID) {
    throw new Fault(403,'Pengirim Telegram tidak diizinkan.');
  }
  const updateId = String(data.updateId ?? '');
  if (typeof data.text !== 'string' || data.text.length > 2050 || !/^\d{1,24}$/.test(updateId)) throw new Fault(400,'Pesan Telegram tidak valid.');
  const message = data.text.trim();
  const [command, id, target] = message.split(/\s+/);
  const state = store.state();
  const actor = 'Dika · Telegram';
  if (command === '/start' || command === '/bantuan') return help;
  if (command === '/status' || command === '/laporan' || /laporkan|pekerjaan hari ini/i.test(message)) {
    return ['Mode kantor: '+state.phase, 'Worker: '+(state.worker ? 'terhubung' : 'offline'),
      taskList(state.tasks.slice(0,8)) || 'Antrean kosong.'].join('\n');
  }
  if (command === '/pegawai' || /siapa.*bekerja/i.test(message)) {
    return divisions.map(item => item.employee+' · '+item.name+' · '+(state.running.some(task => task.division === item.id) ? 'Mengerjakan tugas' : 'Tanpa eksekusi aktif')).join('\n');
  }
  if (command === '/hasil' && id) {
    const artifact = store.artifact(id);
    return 'SHA-256 '+artifact.hash+'\n\n'+artifact.output.slice(0,3200);
  }
  if (id && Object.hasOwn(actions,command)) {
    return 'Status tugas: '+store.action(id,actions[command],{},actor).status;
  }
  if (id && target && command === '/alih') {
    return 'Divisi tugas: '+store.action(id,'assign',{division:translate(target)},actor).division;
  }
  if (/semua pegawai istirahat/i.test(message)) {
    store.settings({mode:'paused'},actor);
    return 'Simulasi dan pengambilan tugas baru dijeda.';
  }
  const match = /^\/tugas\s+([^|]+)\|\s*(.+)$/is.exec(message) ??
    /^(?:suruh tim\s+)?(video production|developer|manajemen|manager|seo|desain|riset|qa|it|video|administrasi|sdm|keuangan|sosmed)[,\s]+(.+)$/is.exec(message);
  const input = command === '/diagnostik' ?
    {division:'operations',kind:'diagnostic',description:'Periksa lingkungan worker lokal'} :
    match && {division:translate(match[1].trim()),kind:'draft',description:match[2].trim()};
  if (!input?.division) return help;
  const task = store.create(input,actor,'telegram:'+updateId);
  return 'Tugas '+task.id+' · '+task.status+(input.kind === 'draft' && !state.capabilities.includes('draft') ? '\nWorker AI draf belum tersedia.' : '');
}
