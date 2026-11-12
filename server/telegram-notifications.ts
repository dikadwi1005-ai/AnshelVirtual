import { divisions } from '../public/catalog.js';

// Only status metadata, never the task instruction, output, error details, or worker credentials.
const status = { completed:'Selesai', failed:'Gagal', blocked:'Terhambat' };
export function formatTelegramTaskNotification(event) {
  const division=divisions.find(item => item.id===event.division)?.name || 'Tidak diketahui';
  const lines=[
    'Anshel Virtual Tech · Pembaruan tugas',
    'Status: '+(status[event.action] ?? 'Tidak diketahui'),
    'Divisi: '+division,
    ...(event.project ? ['Proyek: '+event.project.slice(0,80)] : []),
    'ID tugas: '+event.taskId,
    'Lihat detail dan hasil di dashboard privat Anshel Virtual Tech.',
  ];
  return lines.join('\n');
}
