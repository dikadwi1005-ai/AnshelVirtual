import { divisions } from '../public/catalog.js';
import { Fault } from './store.ts';

const roster=new Map(divisions.map(person=>[person.id,person]));
const rooms=new Map([['hub','atrium'],['reception','resepsionis'],['garden','teras taman']]);
const routines=new Map([['desk','di meja'],['coffee','mengambil kopi'],['rest','bersantai'],
  ['read','membaca'],['stroll','jalan di teras'],['talk','menunggu teman']]);
const topics=[
  'gosip ringan tentang misteri camilan di pantri', 'musik untuk perjalanan pulang',
  'rencana akhir pekan yang spontan', 'cerita konyol tentang tanaman kantor',
  'makanan enak dekat kantor', 'game atau film fiksi yang sedang seru',
  'kebiasaan lucu hewan peliharaan', 'debat receh tentang kopi dan teh',
];
const requestGap=8_000;
const day=24*60*60_000;
const dailyLimit=120;
const empty={lines:[]};

function context(input) {
  const {kind,location,speakers}=input;
  const solo=kind==='solo';
  const where=(solo?routines:rooms).get(location);
  if ((!solo && kind!=='group') || !where || !Array.isArray(speakers) ||
      (solo ? speakers.length!==1 : speakers.length<2 || speakers.length>4) ||
      new Set(speakers).size!==speakers.length || !speakers.every(id=>roster.has(id))) {
    throw new Fault(400,'Konteks dialog tidak valid.');
  }
  const count=solo?1:Math.max(3,speakers.length);
  const voices=Array.from({length:count},(_,i)=>{
    const {employee,personality}=roster.get(speakers[i%speakers.length]);
    return {nama:employee,gaya:personality};
  });
  return {where,voices,solo};
}

export function createDialogue(env, fetchGroq=fetch, now=Date.now) {
  const key=env.GROQ_API_KEY?.trim();
  const attempts=[];
  let next=0, sequence=0, status=key?'ready':'disabled';
  return {
    enabled:!!key,
    get status() { return status; },
    async generate(input) {
      const {where,voices,solo}=context(input);
      const time=now();
      while (attempts.length && attempts[0]<=time-day) attempts.shift();
      if (!key || time<next) return empty;
      if (attempts.length>=dailyLimit) { status='limit'; return empty; }
      next=time+requestGap;
      attempts.push(time);
      const topic=topics[sequence++%topics.length];
      const instructions=[
        'Tulis dialog singkat untuk karakter fiksi dewasa di kantor virtual berbahasa Indonesia.',
        'Gunakan bahasa Indonesia santai dan natural. Tiap giliran maksimal 75 karakter, tanpa nama pembicara, tanda kutip, emoji, narasi, atau markdown.',
        'Buat obrolan yang nyambung, ringan dan spesifik. Gosip boleh tentang kejadian fiktif yang lucu dan sepele.',
        'Hindari tuduhan serius, orang sungguhan, informasi pribadi, dan klaim tentang pekerjaan atau status tugas.',
        'Isi array lines tepat satu kalimat untuk setiap entri dalam urutanGiliran. Jika monolog, buat satu komentar yang wajar diucapkan sendiri.',
      ].join(' ');
      try {
        const response=await fetchGroq('https://api.groq.com/openai/v1/chat/completions',{
          method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
          signal:AbortSignal.timeout(4_000),
          body:JSON.stringify({
            model:'openai/gpt-oss-20b',reasoning_effort:'low',max_completion_tokens:420,
            messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify({
              lokasi:where,topik:topic,monolog:solo,urutanGiliran:voices,
            })}],
            response_format:{type:'json_schema',json_schema:{name:'office_dialogue',strict:true,schema:{
              type:'object',properties:{lines:{type:'array',items:{type:'string'}}},
              required:['lines'],additionalProperties:false,
            }}},
          }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          next=now()+([401,403].includes(response.status)?300_000:60_000);
          status='fallback';
          return empty;
        }
        const payload=await response.json();
        const {lines}=JSON.parse(payload.choices?.[0]?.message?.content ?? '{}');
        if (!Array.isArray(lines) || lines.length!==voices.length ||
            !lines.every(line=>typeof line==='string' && line.trim().length>=4 && line.trim().length<=90 &&
              !/[<>\x00-\x1f]/.test(line))) { status='fallback'; return empty; }
        status='active';
        return {lines:lines.map(line=>line.trim())};
      } catch {
        next=now()+60_000;
        status='fallback';
        return empty;
      }
    },
  };
}
