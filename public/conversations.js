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
const casual=[
  ['katanya biskuit pantri tinggal satu. Kamu tahu ceritanya?', 'Tadi masih ada tiga. Mungkin yang dua lagi ikut rapat.', 'Besok kita bawa stok cadangan, deh.', 'Setuju. Tapi kali ini kasih nama di toplesnya.'],
  ['kalau akhir pekan hujan, kamu lebih pilih film atau tidur?', 'Film dulu. Biasanya baru lima menit sudah ketiduran.', 'Berarti dua-duanya jalan.', 'Kalau filmnya bagus, besok baru kita lanjut.'],
  ['ada rekomendasi lagu buat perjalanan pulang?', 'Aku lagi suka musik yang bisa diputar tanpa ikut nyanyi.', 'Nah, itu baru cocok buat naik kendaraan umum.', 'Nanti kita tukeran playlist.'],
];

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
  if (round%4!==0) {
    const text=casual[round%4-1][index];
    return index===0 ? other.employee+', '+text : text;
  }
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
    update(delta,groups,office,focus,request) {
      turns.clear();
      for (const [room,members] of groups) {
        if (members.length<2) continue;
        let session=sessions.get(room);
        if (!session) {
          session={remaining:.45,round:0,index:0,last:null,turn:null};
          sessions.set(room,session);
        }
        const count=Math.max(3,members.length);
        const [x,z]=members[0].anchor?.center ?? [];
        if (request && focus && session.index===0 && !session.script && Math.hypot(focus.x-x,focus.z-z)<7) {
          const first=(members.indexOf(session.last)+1)%members.length;
          const order=[...members.slice(first),...members.slice(0,first)];
          const script={order,lines:null};
          session.script=script;
          session.remaining=Math.max(session.remaining,1.8);
          request({kind:'group',location:room,speakers:order.map(member=>member.person.id)}).then(lines=>{
            if (session.script!==script || session.index!==0 || lines.length!==count) return;
            script.lines=lines;
            session.remaining=Math.min(session.remaining,.12);
          });
        }
        if (session.script?.lines && (session.script.order.length!==members.length ||
            !members.every(member=>session.script.order.includes(member)))) session.script.lines=null;
        if (session.turn && (!members.includes(session.turn.speaker) || !members.includes(session.turn.other))) {
          session.turn=null;
          session.remaining=.25;
        }
        session.remaining-=delta;
        if (session.remaining<=0) {
          if (session.turn) {
            session.turn=null;
            session.remaining=.35;
          } else if (session.index>=count) {
            session.index=0;
            session.round++;
            session.remaining=4;
            session.script=null;
          } else {
            const next=members.indexOf(session.last)+1;
            const speaker=members[next%members.length];
            const other=members[(next+1)%members.length];
            const script=session.script;
            const generated=script?.lines && script.order[session.index%members.length]===speaker && script.lines[session.index];
            const text=generated || line(room,session.round,session.index,other.person,office);
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

const reflections={
  desk:['Aku cek urutannya dulu.','Satu langkah dulu, baru lanjut.','Rapiin catatan sebentar, ah.'],
  coffee:['Waktunya isi ulang kopi.','Aromanya enak juga.'],
  rest:['Duduk sebentar rasanya enak.','Tarik napas dulu.'],
  read:['Bagian ini menarik.','Aku baca satu bagian lagi.'],
  stroll:['Terasnya adem hari ini.','Enak juga jalan sebentar.'],
  talk:['Aku tunggu sebentar di sini.','Hmm, nanti aku mampir ke meja lagi.'],
};

export function createMonologues() {
  let turn=null, pending=null, remaining=5, sequence=0, previous=null;
  return {
    update(delta,actors,groups,office,focus,request) {
      const eligible=actor=>{
        const plan=office?.people?.[actor.person.id];
        const group=groups.get(actor.anchor.conversation);
        return focus && !plan?.task && plan?.activity===actor.actual && reflections[actor.actual] &&
          (actor.stage==='arrived' || actor.stage==='seated') && (group?.length ?? 0)<2 &&
          Math.hypot(actor.root.position.x-focus.x,actor.root.position.z-focus.z)<5;
      };
      remaining-=delta;
      if (pending) {
        if (!eligible(pending.speaker)) { pending=null; remaining=6; }
        else if (remaining<=0) { turn=pending; pending=null; remaining=2.9; }
      }
      if (turn && (remaining<=0 || !eligible(turn.speaker))) {
        turn=null;
        remaining=13+sequence%5*2;
      }
      if (!turn && !pending && remaining<=0) {
        const candidates=actors.filter(eligible);
        const other=candidates.filter(actor=>actor!==previous);
        const pool=other.length ? other : candidates;
        if (pool.length) {
          const speaker=pool[sequence%pool.length];
          const lines=reflections[speaker.actual];
          const remark={speaker,text:lines[sequence%lines.length],solo:true};
          if (request) {
            pending=remark;
            remaining=1.8;
            request({kind:'solo',location:speaker.actual,speakers:[speaker.person.id]}).then(lines=>{
              if (pending!==remark) return;
              if (lines.length===1) remark.text=lines[0];
              remaining=0;
            });
          } else { turn=remark; remaining=2.9; }
          previous=speaker;
          sequence++;
        } else remaining=1;
      }
      return turn;
    },
  };
}
