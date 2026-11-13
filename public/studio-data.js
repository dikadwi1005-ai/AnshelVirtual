export const maxFrames=900;
export const maxEvents=240;

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
    return shots('Hasil kerja tersimpan',tasks.filter(task=>task.status==='completed' &&
      (person?task.division===person.id:task.division==='research')).slice(0,5)
      .map(task=>task.description+(task.project?' · '+task.project:'')));
  }
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'});
  const today=events.filter(event=>day.format(event.at)===day.format(now));
  return shots('Aktivitas kantor hari ini',today.slice(-8).map(event=>event.kind==='dialogue'?
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
