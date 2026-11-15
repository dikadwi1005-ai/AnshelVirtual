export const maxFrames=900;
export const maxEvents=240;

export function episodeFromReplay(topic,frames,people) {
  // Only recorded poses are used as evidence. Never invent an employee action.
  if(typeof topic!=='string' || !topic.trim() || !Array.isArray(frames) ||
     !Array.isArray(people) || !people.length) return null;
  const valid=frames.filter(frame=>Number.isSafeInteger(frame?.at) &&
    Array.isArray(frame.actors) && frame.actors.length>0).sort((a,b)=>a.at-b.at);
  const first=valid[0]?.at, end=valid.at(-1)?.at;
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(end)||end-first<9000)return null;
  const start=Math.max(first,end-27000);
  const duration=end-start;
  const count=Math.min(5,Math.max(3,Math.floor(duration/5000)));
  const name=topic.toLocaleLowerCase('id');
  const preferred=people.findIndex(person=>typeof person?.employee==='string' &&
    name.includes(person.employee.toLocaleLowerCase('id')));
  const descriptions={walk:'sedang berjalan',speak:'sedang berbicara','seated-speak':'sedang berbicara',
    'desk-work':'sedang bekerja','home-sleep':'sedang beristirahat di rumah',
    read:'sedang membaca',drink:'sedang minum',phone:'sedang menggunakan ponsel',
    'game-play':'sedang bermain'};
  const actionWords=[
    [/jalan|berangkat|pulang|perjalanan|menyeberang/,['walk']],
    [/rapat|diskusi|berbicara|ngobrol/,['speak','seated-speak']],
    [/bekerja|kerja|tugas|kantor/,['desk-work']],
    [/rumah|tidur|istirahat/,['home-sleep']],
    [/baca|riset/,['read']],
    [/minum|kopi/,['drink']],
    [/ponsel|telepon/,['phone']],
    [/game|main|ps5/,['game-play']],
  ];
  const wanted=actionWords.filter(([pattern])=>pattern.test(name)).flatMap(([,actions])=>actions);
  return Array.from({length:count},(_,i)=>{
    const from=Math.round(start+i*duration/count);
    const to=i===count-1?end:Math.round(start+(i+1)*duration/count);
    const middle=(from+to)/2;
    const frame=valid.find(entry=>entry.at>=middle) ?? valid.at(-1);
    const actorList=frame.actors;
    const candidates=actorList.map((actor,index)=>({actor,index})).filter(({actor,index})=>
      actor && people[index] && Object.hasOwn(descriptions,actor.animation));
    const matched=candidates.find(({actor,index})=>index===preferred && wanted.includes(actor.animation)) ??
      candidates.find(({actor})=>wanted.includes(actor.animation)) ??
      candidates.find(({index})=>index===preferred) ?? candidates[i%candidates.length];
    const index=matched?.index ?? (preferred>=0 && actorList[preferred]?preferred:-1);
    const person=index>=0?people[index]:null;
    const actor=index>=0?actorList[index]:null;
    const action=actor && Object.hasOwn(descriptions,actor.animation)?descriptions[actor.animation]:null;
    const caption=person && action?person.employee+' '+action+'.':
      'Cuplikan aktivitas yang terekam di Anshel Virtual Tech.';
    const homeCamera=actor?.animation==='home-sleep' && person;
    return {frames:valid,start:from,end:to,camera:i===0?'campus':
      homeCamera?'home-'+person.id:person?'employee-'+person.id:'campus',
      caption};
  });
}

export function episodeWebVtt(clips) {
  const format=value=>new Date(value).toISOString().slice(11,23);
  let time=0;
  const cues=[];
  for (const clip of clips) {
    const next=time+clip.end-clip.start;
    if (clip.caption) cues.push(format(Math.round(time))+' --> '+format(Math.round(next))+'\n'+clip.caption);
    time=next;
  }
  return cues.length?'WEBVTT\n\n'+cues.join('\n\n')+'\n':null;
}

export function localReminderTime(input) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return NaN;
  const at=Date.parse(input+':00+07:00');
  if (!Number.isFinite(at) || new Date(at+7*3600000).toISOString().slice(0,16)!==input) return NaN;
  return at;
}

export function historyEvent(previous,frame) {
  const event={at:frame.at,source:'simulation'};
  if (frame.turn && (frame.turn.id!==previous?.turn?.id || frame.turn.text!==previous?.turn?.text))
    return {...event,kind:'dialogue',employee:frame.turn.id};
  const changes=frame.actors.reduce((count,actor,index)=>count+Number(actor.stage!==previous?.actors[index]?.stage),0);
  return changes?{...event,kind:'movement',count:changes}:null;
}

export function storyboard(instruction,{events,meetings,tasks,people,now=Date.now()}) {
  const query=instruction.toLocaleLowerCase('id');
  const shots=(subject,items)=>({subject,items});
  if (/\brapat\b/.test(query)) {
    const latest=meetings.at(-1);
    return shots('Rapat terakhir',latest?['Agenda · '+latest.agenda,
      'Hadir · '+(latest.attended.map(id=>people.find(person=>person.id===id)?.employee ?? id).join(', ') || 'Belum tercatat'),
      ...(latest.notes?['Notulen · '+latest.notes]:[]),...(latest.decisions?['Keputusan · '+latest.decisions]:[])]:[]);
  }
  if (/\b(riset|hasil|artefak)\b/.test(query)) {
    const person=people.find(item=>query.includes(item.employee.toLocaleLowerCase('id').split(' ')[0]));
    const sources=tasks.filter(task=>task.status==='completed' &&
      (person?task.division===person.id:task.division==='research')).slice(0,5);
    return {...shots('Hasil kerja tersimpan',sources.map(task=>task.description+(task.project?' · '+task.project:''))),sources};
  }
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'});
  const week=/\bminggu ini\b/.test(query);
  const wibDate=new Date(now+7*3600000);
  const weekStart=Date.UTC(wibDate.getUTCFullYear(),wibDate.getUTCMonth(),wibDate.getUTCDate()-(wibDate.getUTCDay()+6)%7)-7*3600000;
  const selected=events.filter(event=>week?event.at>=weekStart && event.at<=now:day.format(event.at)===day.format(now));
  return shots(week?'Aktivitas kantor minggu ini':'Aktivitas kantor hari ini',selected.slice(-8).map(event=>event.kind==='dialogue'?
    'Giliran bicara · '+(people.find(person=>person.id===event.employee)?.employee ?? event.employee):
    event.kind==='meeting'?'Rapat · '+event.action:'Perubahan aktivitas · '+event.count+' pegawai'));
}

export function nationSnapshot(input) {
  if (!input || input.version!==1 || !['online','offline','degraded'].includes(input.status) ||
    !Number.isFinite(Date.parse(input.updatedAt)) || !Array.isArray(input.events) || input.events.length>100) return null;
  const seen=new Set();
  const events=[];
  for (const entry of input.events) {
    if (!entry || typeof entry.id!=='string' || !/^[\w-]{1,64}$/.test(entry.id) || seen.has(entry.id) ||
      !['city.status','city.milestone','city.service'].includes(entry.type) ||
      !Number.isFinite(Date.parse(entry.at)) || typeof entry.label!=='string' || !entry.label.trim() || entry.label.length>160) return null;
    seen.add(entry.id);
    events.push({id:entry.id,type:entry.type,at:entry.at,label:entry.label.trim()});
  }
  return {version:1,status:input.status,updatedAt:input.updatedAt,events};
}
