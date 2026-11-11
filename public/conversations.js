import { conversationAnchors } from './furnishings.js';

const prompts={
  hub:[
    'ada yang perlu kita koordinasikan sebelum kembali ke meja?',
    'kalau prioritas berubah, kita cek panel tugas dulu, ya.',
  ],
  reception:[
    'mau ngobrol sebentar sebelum balik ke ruangan?',
    'kalau perlu cari tim lain, kita bisa lihat daftar ruang.',
  ],
  garden:[
    'enak juga ngobrol sebentar di teras.',
    'mau rehat di sini sebentar lagi?',
  ],
};

export function chooseConversationAnchor(actor,reservations,isAvailable) {
  const existing=[actor.pending,actor.anchor].find(anchor=>anchor?.conversation);
  if (existing) return existing;
  const groups=conversationAnchors.map(slots=>({slots,occupied:slots.filter(slot=>reservations.has(slot.id)).length}));
  groups.sort((a,b)=>b.occupied-a.occupied);
  for (const {slots} of groups) {
    const filled=slots.filter(slot=>reservations.has(slot.id));
    const first=filled[0]?.slot;
    const opposing=filled.length===1 ? slots[first+(first%2===0 ? 1 : -1)] : null;
    const options=opposing ? [opposing,...slots] : slots;
    const slot=options.find(candidate=>!reservations.has(candidate.id) && isAvailable(candidate));
    if (slot) return slot;
  }
  return null;
}

function line(room,round,index,other,office) {
  if (index===0) return other.employee+', '+prompts[room][round%2];
  if (index===1) {
    const colleagues=Object.values(office?.people ?? {});
    if (room==='hub' && colleagues.some(person=>person.task?.status==='queued')) {
      return 'Masih ada tugas di antrean. Kita cek statusnya dari panel.';
    }
    if (room==='garden') return 'Boleh. Kita lanjut kegiatan masing-masing setelah ini.';
    return 'Boleh. Kalau ada perubahan, kita cek lagi sebelum mulai.';
  }
  if (index===2) return 'Sip. Terima kasih sudah mengingatkan.';
  return 'Oke, sampai ketemu lagi di kantor.';
}

export function createConversations() {
  const sessions=new Map();
  const turns=new Map();
  return {
    turns,
    update(delta,groups,office) {
      turns.clear();
      for (const [room,members] of groups) {
        if (members.length<2) continue;
        let session=sessions.get(room);
        if (!session) {
          session={remaining:.45,round:0,index:0,last:null,turn:null};
          sessions.set(room,session);
        }
        if (session.turn && (!members.includes(session.turn.speaker) || !members.includes(session.turn.other))) {
          session.turn=null;
          session.remaining=.25;
        }
        session.remaining-=delta;
        if (session.remaining<=0) {
          if (session.turn) {
            session.turn=null;
            session.remaining=.35;
          } else if (session.index>=Math.max(3,members.length)) {
            session.index=0;
            session.round++;
            session.remaining=4;
          } else {
            const next=members.indexOf(session.last)+1;
            const speaker=members[next%members.length];
            const other=members[(next+1)%members.length];
            const text=line(room,session.round,session.index,other.person,office);
            session.turn={speaker,other,text};
            session.last=speaker;
            session.index++;
            session.remaining=Math.max(2.65,text.length/17);
          }
        }
        if (session.turn) turns.set(room,session.turn);
      }
      for (const room of sessions.keys()) if ((groups.get(room)?.length ?? 0)<2) sessions.delete(room);
    },
  };
}
