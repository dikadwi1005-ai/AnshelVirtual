import { divisions } from '../public/catalog.js';
import { avatarForConversation } from './office-avatar-status.ts';

const people=divisions.map(person=>person.id);
const home=place=>place==='Di rumah';
const commute=place=>place==='Dalam perjalanan pulang'||place==='Dalam perjalanan ke kantor';
const atOffice=place=>place==='Di dalam kantor'||place==='Di area luar kantor';
const clock=at=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(at)).replace(':','.');

export function isOfficeLocationQuestion(question='') {
  const q=String(question);
  return /\b(?:(?:masih|lagi|sedang|udah|sudah|sekarang)\s+(?:di\s+)?kantor|(?:kamu|dia|mereka|semua|pegawai|karyawan|staf)\s+(?:lagi\s+)?di\s+kantor|(?:sudah|udah|lagi|sedang|pada)\s+pulang|(?:masih|sudah|udah|lagi|sedang)\s+(?:di\s+)?rumah|(?:lokasi|posisi)\s+(?:pegawai|staf|tim|karyawan|avatar|kalian|mereka)|(?:pegawai|staf|tim|karyawan|avatar|kalian|mereka)\s+(?:di\s+mana|dimana))\b/i.test(q);
}

export function officeLocationReply(state,division,question='') {
  const phase=state?.phase;
  const isClosed=phase==='closed';
  const phaseText=isClosed?'Kantor lagi tutup':phase==='paused'?'Simulasinya lagi dijeda':
    phase==='overtime'?'Kantor lagi mode lembur':'Kantor lagi beroperasi';
  const plural=/\b(?:semua|seluruh|para\s+pegawai|pegawai|karyawan|staf|staff|tim|mereka|kalian|anak-anak|pada)\b/i.test(question);
  const ids=plural?people:[division];
  const statuses=ids.map(id=>avatarForConversation(state,id));
  const live=statuses.filter(item=>item.quality==='live');
  const latest=statuses.filter(item=>item.quality==='last-seen');
  const noun=plural?'pegawai':'avatar';
  if(live.length===ids.length) {
    const atHome=live.filter(x=>home(x.location)).length;
    const traveling=live.filter(x=>commute(x.location)).length;
    const still=live.filter(x=>atOffice(x.location)).length;
    if(plural) {
      if(atHome===ids.length)return 'Iya Pak, dari simulasi yang lagi jalan, semua 12 pegawai udah sampai rumah.';
      return 'Update dari simulasi, Pak: '+atHome+' di rumah, '+traveling+
        ' masih perjalanan, dan '+still+' di area kantor. Sisanya lagi bergerak di kawasan.';
    }
    return 'Kalau dari simulasinya sekarang, avatarku '+live[0].location.toLowerCase()+
      (live[0].activity?' dan lagi '+live[0].activity.toLowerCase():'')+', Pak.';
  }
  if(latest.length===ids.length && statuses.every(x=>x.at===latest[0].at)) {
    const seen=clock(latest[0].at);
    if(plural) {
      const atHome=latest.filter(x=>home(x.location)).length;
      const going=latest.filter(x=>commute(x.location)).length;
      if(atHome===ids.length)return 'Terakhir kebaca jam '+seen+', semua pegawai udah di rumah, Pak. Tapi itu update terakhir, bukan posisi live.';
      return 'Catatan terakhir jam '+seen+': '+atHome+' pegawai di rumah, '+going+
        ' lagi perjalanan. '+phaseText+', Pak, tapi posisi mereka belum diperbarui lagi.';
    }
    return 'Terakhir jam '+seen+' avatarku '+latest[0].location.toLowerCase()+
      ', Pak. '+phaseText+', tapi aku belum dapat update posisi yang lebih baru.';
  }
  if(isClosed) return 'Kalau ngikut jadwal, jam kerja udah selesai, Pak. Tapi posisi '+noun+
    ' sekarang belum kebaca, jadi aku nggak mau asal bilang semuanya udah sampai rumah.';
  return phaseText+', Pak. Posisi '+noun+' sekarang belum kebaca dari dunia 3D, jadi aku nggak mau nebak.';
}
