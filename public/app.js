import { activities, divisions, timezone } from './catalog.js';
import { rooms, roomById, wings } from './layout.js';

const $ = id => document.getElementById(id);
const buttons = query => [...document.querySelectorAll(query)];
const phaseNames = {closed:'Kantor tutup', arrival:'Karyawan tiba', briefing:'Briefing pagi',
  work:'Jam kerja', lunch:'Istirahat siang', review:'Evaluasi harian', paused:'Dijeda', open:'Kantor buka', overtime:'Lembur'};
const statusNames = {queued:'Dalam antrean',running:'Berjalan',paused:'Dijeda',blocked:'Terhambat',
  awaiting_approval:'Menunggu persetujuan',completed:'Selesai',failed:'Gagal',cancelled:'Dibatalkan'};
const modeNames = {auto:'Ikuti jadwal',open:'Buka kantor',closed:'Tutup kantor',paused:'Jeda simulasi',overtime:'Mulai lembur'};
const scheduleFields = {arrival:'Kedatangan',open:'Buka',briefingEnd:'Akhir briefing',lunch:'Makan siang',
  lunchEnd:'Akhir makan siang',review:'Mulai evaluasi',close:'Tutup'};
const actionNames = {created:'Dibuat',queued:'Masuk antrean',assigned:'Ditugaskan',running:'Mulai eksekusi',
  completed:'Artefak tersimpan',failed:'Gagal',blocked:'Terhambat',mode:'Mode kantor diubah',
  schedule:'Jadwal diubah',cancel:'Dibatalkan',pause:'Dijeda',resume:'Dilanjutkan',retry:'Diantrekan ulang',
  approve:'Disetujui',reject:'Ditolak',review:'Persetujuan diminta'};
const actionLabels = {pause:'Jeda',resume:'Lanjut',cancel:'Batalkan',retry:'Ulangi',review:'Minta tinjauan',approve:'Setujui',reject:'Tolak'};
const available = {queued:['pause','cancel','review'],running:['pause','cancel'],paused:['resume','cancel'],
  blocked:['retry','cancel'],failed:['retry'],awaiting_approval:['approve','reject','cancel']};
const clockFormat = new Intl.DateTimeFormat('id-ID',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const dateFormat = new Intl.DateTimeFormat('id-ID',{timeZone:timezone,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const team = id => divisions.find(person=>person.id===id);

let panel = null, selected = null, selectedRoom = null;
let scene, office, poller, refreshing, toastTimer, clockOffset = 0;
let taskKey = null;
let lighting = localStorage.getItem('anshel-lighting') ?? 'auto';
let latestAudit = null;
let pendingPanelRefresh = false;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const optionList = (list,current) => list.map(([value,label])=>'<option value="'+escape(value)+'"'+
  (current===value?' selected':'')+'>'+escape(label)+'</option>').join('');
const teamOptions = current => optionList(divisions.map(person=>[person.id,person.name]),current);
const stats = rows => '<dl class="stats">'+rows.map(([key,value])=>'<div><dt>'+escape(key)+'</dt><dd>'+escape(value)+'</dd></div>').join('')+'</dl>';

async function api(path,body,headers={}) {
  const response = await fetch('/api/'+path,body === undefined ? undefined : {
    method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') showLogin();
    throw new Error(data.error ?? 'Permintaan gagal.');
  }
  return data;
}

function notice(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>$('toast').hidden=true,4200);
}

function showLogin() {
  clearInterval(poller);
  $('workspace').hidden = true;
  $('auth').hidden = false;
  if ($('task-dialog').open) $('task-dialog').close();
  setPanel(null);
}

async function enter() {
  $('workspace').hidden = false;
  $('auth').hidden = true;
  await refresh(true);
  clearInterval(poller);
  poller = setInterval(()=>refresh().catch(error=>notice(error.message)),1500);
  if (scene) return;
  try {
    const {officeScene} = await import('./scene.js');
    scene = officeScene($('scene'),$('room-labels'),select,(message)=>{
      $('scene-message').textContent = message;
      $('scene-message').hidden = !message;
    });
    scene.state(office);
    scene.quality(localStorage.getItem('anshel-quality')==='low');
    setLighting(lighting);
    await scene.load();
  } catch(error) {
    console.error(error);
    $('scene-message').textContent='Kantor 3D memerlukan WebGL 2. Panel tugas tetap tersedia.';
  }
}

async function refresh(force = false) {
  if (refreshing) {
    await refreshing;
    if (!force) return;
  }
  refreshing = api('state').then(value=>{
    const signature = JSON.stringify([value.phase,value.mode,value.schedule,value.worker,value.capabilities,value.tasks,value.audit,value.counts,value.projects]);
    const changes = office?.signature !== signature;
    clockOffset = value.now-Date.now();
    office = {...value, signature};
    scene?.state(office);
    const completed = latestAudit===null ? null : value.audit.find(item=>item.id>latestAudit && item.action==='completed');
    if (completed) {
      const task=value.tasks.find(item=>item.id===completed.task);
      if (task) notice('Hasil siap · '+team(task.division)?.name);
    }
    latestAudit=value.audit[0]?.id ?? 0;
    $('phase').classList.toggle('live',!['closed','paused'].includes(value.phase));
    $('phase').lastElementChild.textContent = phaseNames[value.phase] ?? value.phase;
    $('worker-light').classList.toggle('online',value.worker);
    $('worker-status').textContent = value.worker ? 'Worker terhubung' : 'Worker offline';
    const queued = value.counts.queued ?? 0;
    $('queue-badge').hidden = queued === 0;
    $('queue-badge').textContent = queued;
    pendingPanelRefresh ||= changes;
    const editing = document.activeElement?.matches('#panel-content :is(input,textarea,select)');
    if (force || (pendingPanelRefresh && panel !== 'settings' && !editing)) {
      pendingPanelRefresh=false;
      render();
    }
    else if (panel==='office' && selected) updateEmployee();
  });
  try { await refreshing; } finally { refreshing = null; }
}

function setPanel(name) {
  panel = name;
  document.querySelector('.inspector').hidden=!name;
  buttons('[data-panel]').forEach(button=>{
    button.classList.toggle('active',button.dataset.panel===name);
    button.setAttribute('aria-pressed',String(button.dataset.panel===name));
  });
  render();
}

function select(id,room = null) {
  selected = id;
  selectedRoom = room;
  scene?.select(room ?? id);
  if (room) scene?.focusRoom(room);
  setPanel('office');
}

function title(kicker,title) {
  $('panel-kicker').textContent=kicker;
  $('panel-title').textContent=title;
}

function updateEmployee() {
  const plan = office?.people[selected];
  const element=$('employee-status');
  if (!element || !plan) return;
  const actor=scene?.actorState(selected);
  if (actor) {
    element.dataset.stage=actor.stage;
    element.dataset.animation=actor.animation;
  }
  const moving=['walking','aligning','sitting','departing'].includes(actor?.stage);
  const workStatus=plan.executing?'Eksekusi berjalan':plan.task?.status==='blocked'?'Tugas terhambat':
    plan.task ? (!office.worker || !office.capabilities.includes(plan.task.kind) ? 'Menunggu worker' : 'Dalam antrean') : 'Tanpa tugas aktif';
  const activity=moving ? (plan.task?'Menuju meja kerja':'Berjalan') :
    plan.task && !plan.executing ? 'Siap di meja' : activities[actor?.activity ?? plan.activity];
  const markup=stats([
    ['Aktivitas',activity],['Status kerja',workStatus],
    ['Suasana hati',plan.mood],['Energi',plan.energy+'%'],
  ])+(plan.task?'<p class="status-text">'+escape(plan.task.description)+'</p>':'');
  if (element.innerHTML!==markup) element.innerHTML=markup;
}

function renderOffice() {
  const person = team(selected);
  if (person) {
    title(person.name,person.employee);
    $('panel-content').innerHTML = stats([['Jabatan',person.role],['Keahlian',person.specialty],['Kepribadian',person.personality]])+
      '<div id="employee-status"></div><div class="context-actions"><button id="focus-employee" type="button">Fokus karyawan</button><button id="follow" type="button">'+
      (scene?.isFollowing(selected)?'Berhenti mengikuti':'Ikuti dengan kamera')+'</button></div>'+
      '<p class="section-label">Tugas terbaru</p>'+renderTasks(office.tasks.filter(task=>task.division===person.id).slice(0,3),false);
    updateEmployee();
    return;
  }
  const room=roomById[selectedRoom];
  if (room) {
    title(wings[room.wing],room.label);
    const personButton=room.person ? '<button type="button" class="person" data-employee="'+room.person.id+
      '"><span class="initial" style="--swatch:'+room.accent+'">'+room.person.employee[0]+'</span>'+
      '<span><strong>'+room.person.employee+'</strong><small>'+room.person.role+'</small></span><span>›</span></button>' : '';
    $('panel-content').innerHTML=(personButton?'<div class="roster">'+personButton+'</div>':'')+
      '<div class="context-actions"><button type="button" data-directory>Semua ruang</button></div>';
    return;
  }
  title('Denah kantor','Ruang');
  $('panel-content').innerHTML=Object.entries(wings).map(([key,label])=>
    '<p class="section-label">'+label+'</p><div class="quick-rooms">'+rooms.filter(item=>item.wing===key).map(item=>
      '<button type="button" data-room="'+item.id+'">'+item.label+'</button>').join('')+'</div>').join('');
}

function renderTasks(tasks,interactive=true) {
  if (!tasks.length) return '<p class="status-text">Belum ada tugas.</p>';
  return '<ul class="task-list">'+tasks.map(task=>{
    const actions = interactive ? (available[task.status] ?? []).map(action=>
      '<button data-action="'+action+'" data-task="'+task.id+'" type="button">'+actionLabels[action]+'</button>').join('') : '';
    const result = task.status==='completed'?'<a href="/api/tasks/'+task.id+'/artifact">Unduh hasil</a>':'';
    const assign = interactive && ['queued','paused','blocked'].includes(task.status)?
      '<select aria-label="Alihkan divisi" data-assign="'+task.id+'">'+teamOptions(task.division)+'</select>':'';
    return '<li class="task-card"><span class="task-state">'+statusNames[task.status]+'</span>'+
      '<p>'+escape(task.description)+'</p><small>'+escape(team(task.division)?.name)+
      (task.project?' · '+escape(task.project):'')+' · '+dateFormat.format(task.created)+'</small>'+
      (task.error?'<p class="error">'+escape(task.error)+'</p>':'')+
      (task.sha256?'<small class="hash">SHA-256 '+escape(task.sha256)+'</small>':'')+
      (actions||result||assign?'<div class="task-actions">'+actions+result+assign+'</div>':'')+'</li>';
  }).join('')+'</ul>';
}

function renderSettings() {
  title('Kantor privat','Pengaturan');
  const {schedule,mode} = office;
  $('panel-content').innerHTML = '<form class="settings-form" id="settings-form">'+
    '<label>Mode kantor<select name="mode">'+optionList(Object.entries(modeNames),mode)+'</select></label>'+
    '<label>Pencahayaan<select id="lighting">'+optionList([['auto','Otomatis · WIB'],['day','Siang'],['evening','Malam']],lighting)+'</select></label>'+
    '<label>Kualitas grafis<select id="quality">'+optionList([['normal','Standar'],['low','Ringan']],localStorage.getItem('anshel-quality')??'normal')+'</select></label>'+
    '<p class="section-label">Jadwal · WIB</p><div class="form-grid">'+Object.entries(scheduleFields).map(([key,label])=>
      '<label>'+label+'<input type="time" name="'+key+'" required value="'+escape(schedule[key])+'"></label>').join('')+'</div>'+
    '<div class="days" aria-label="Hari kerja">'+['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map((day,i)=>
      '<label><input type="checkbox" name="day" value="'+i+'"'+(schedule.days.includes(i)?' checked':'')+'> '+day+'</label>').join('')+'</div>'+
    '<label>Tanggal libur <span>YYYY-MM-DD, pisahkan dengan koma</span><textarea name="holidays" rows="2">'+escape(schedule.holidays.join(', '))+'</textarea></label>'+
    '<button type="submit" class="primary">Simpan pengaturan</button><button type="button" id="logout">Keluar</button></form>';
}

function render() {
  if (!office || !panel) return;
  if (panel==='office') return renderOffice();
  if (panel==='settings') return renderSettings();
  if (panel==='projects') {
    const projects = new Map();
    for (const row of office.projects) {
      if (!projects.has(row.project)) projects.set(row.project,[]);
      projects.get(row.project).push([statusNames[row.status],row.count]);
    }
    title(projects.size+' proyek','Proyek');
    $('panel-content').innerHTML = projects.size ?
      '<ul class="task-list">'+[...projects].map(([name,rows])=>
        '<li class="task-card"><strong>'+escape(name)+'</strong>'+stats(rows)+'</li>').join('')+'</ul>' :
      '<p class="status-text">Isi nama proyek saat membuat tugas untuk melihat ringkasannya di sini.</p>';
    return;
  }
  if (panel==='tasks') {
    const queued = office.counts.queued ?? 0;
    title(queued+' dalam antrean','Tugas');
    const worker = !office.worker ? 'Worker belum terhubung.' : office.capabilities.includes('draft') ?
      'Worker menerima diagnostik dan draf AI.' : 'Worker menerima diagnostik. Draf AI membutuhkan Ollama.';
    $('panel-content').innerHTML='<p class="status-text">'+worker+'</p>'+renderTasks(office.tasks);
    return;
  }
  title('Log audit','Aktivitas');
  $('panel-content').innerHTML=office.audit.length?'<ul class="audit-list">'+office.audit.map(item=>
    '<li><strong>'+escape(actionNames[item.action]??item.action)+'</strong><br><small>'+
    dateFormat.format(item.at)+' · '+escape(item.actor)+'</small>'+
    (item.detail?'<p>'+escape(item.detail)+'</p>':'')+'</li>').join('')+'</ul>':
    '<p class="status-text">Belum ada aktivitas tercatat.</p>';
}

$('panel-content').addEventListener('click',async event=>{
  const button=event.target.closest('button');
  if (!button) return;
  if (button.dataset.employee) return select(button.dataset.employee);
  if (button.dataset.room) return select(null,button.dataset.room);
  if ('directory' in button.dataset) return select(null);
  if (button.id==='focus-employee') return scene?.focusEmployee(selected);
  if (button.id==='logout') return api('logout',{}).then(showLogin).catch(error=>notice(error.message));
  if (button.id==='follow') {
    const following=scene?.follow(selected);
    button.textContent=following?'Berhenti mengikuti':'Ikuti dengan kamera';
    return;
  }
  if (!button.dataset.action) return;
  button.disabled=true;
  try {
    await api('tasks/'+button.dataset.task+'/action',{action:button.dataset.action});
    await refresh(true);
  } catch(error) { notice(error.message); button.disabled=false; }
});

$('panel-content').addEventListener('change',async event=>{
  const field=event.target;
  if (field.id==='lighting') setLighting(field.value);
  if (field.id==='quality') {
    localStorage.setItem('anshel-quality',field.value);
    scene?.quality(field.value==='low');
  }
  if (!field.dataset.assign) return;
  try {
    await api('tasks/'+field.dataset.assign+'/action',{action:'assign',division:field.value});
    await refresh(true);
  } catch(error) { notice(error.message); render(); }
});

$('panel-content').addEventListener('submit',async event=>{
  if (event.target.id!=='settings-form') return;
  event.preventDefault();
  const fields = new FormData(event.target);
  const schedule = Object.fromEntries(Object.keys(scheduleFields).map(key=>[key,fields.get(key)]));
  schedule.days = fields.getAll('day').map(Number);
  schedule.holidays = fields.get('holidays').split(',').map(date=>date.trim()).filter(Boolean);
  try {
    await api('settings',{mode:fields.get('mode'),schedule});
    await refresh(true);
    notice('Pengaturan tersimpan.');
  } catch(error) { notice(error.message); }
});

buttons('[data-panel]').forEach(button=>button.addEventListener('click',()=>{
  const next=button.dataset.panel;
  if (panel===next) setPanel(null);
  else if (next==='office') select(null);
  else setPanel(next);
}));
$('inspector-back').addEventListener('click',()=>setPanel(null));
document.addEventListener('keydown',event=>{
  if (event.key==='Escape' && !$('task-dialog').open) setPanel(null);
});

const icons = {zoomIn:'<path d="M6 12h12M12 6v12"/>',zoomOut:'<path d="M6 12h12"/>',
  reset:'<path d="m3 7 9-4 9 4-9 4-9-4zm0 5 9 4 9-4m-18 5 9 4 9-4"/>',
  fullscreen:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  moon:'<path d="M19.5 14.5A7.7 7.7 0 0 1 9.5 4.4 8 8 0 1 0 19.5 14.5Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  settings:'<path d="M5 6h14M5 12h14M5 18h14M9 4v4m6 2v4m-6 2v4"/>',
  map:'<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zm6-2v14m6-12v14"/>',
  project:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  activity:'<path d="M3 12h4l3-6 4 12 3-6h4"/>',
  tasks:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6m-6 4h6m-6 4h4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>'};
const icon=key=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[key]+'</svg>';
buttons('[data-icon]').forEach(button=>button.insertAdjacentHTML('afterbegin',icon(button.dataset.icon)));
function setLighting(value) {
  lighting=value;
  localStorage.setItem('anshel-lighting',value);
  scene?.lighting(value);
  if ($('lighting')) $('lighting').value=value;
  syncLightingControl();
}
function syncLightingControl() {
  const hour=new Date(Date.now()+clockOffset+7*3600_000).getUTCHours();
  const night=lighting==='evening' || (lighting==='auto' && (hour>=18 || hour<6));
  const button=$('light-toggle');
  const next=night?'day':'evening';
  if (button.dataset.next===next) return;
  button.innerHTML=icon(night?'sun':'moon');
  button.title=night?'Tampilkan siang':'Tampilkan malam';
  button.setAttribute('aria-label',button.title);
  button.dataset.next=next;
}
$('light-toggle').addEventListener('click',()=>setLighting($('light-toggle').dataset.next ?? 'evening'));
buttons('[data-camera]').forEach(button=>{
  const key=button.dataset.camera;
  button.addEventListener('click',async()=>{
    if (key==='fullscreen') {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.querySelector('.viewport').requestFullscreen();
      } catch { notice('Layar penuh tidak tersedia.'); }
    } else if (key==='reset') {
      scene?.reset();
      setPanel(null);
      if ($('follow')) $('follow').textContent='Ikuti dengan kamera';
    } else scene?.zoom(key==='zoomIn'?1.2:1/1.2);
  });
});

$('new-task').addEventListener('click',()=>{
  const form=$('task-form');
  form.reset();
  form.elements.division.innerHTML=teamOptions(selected ?? 'operations');
  $('task-error').textContent='';
  taskKey=crypto.randomUUID();
  $('task-dialog').showModal();
});
buttons('[data-close]').forEach(button=>button.addEventListener('click',()=>$('task-dialog').close()));
$('task-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target;
  const submit=form.querySelector('button[type=submit]');
  const fields=Object.fromEntries(new FormData(form));
  const data={...fields,priority:Number(fields.priority),urgent:fields.urgent==='on'};
  submit.disabled=true;
  try {
    await api('tasks',data,{'Idempotency-Key':taskKey});
    $('task-dialog').close();
    await refresh(true);
    setPanel('tasks');
  } catch(error) { $('task-error').textContent=error.message; }
  finally { submit.disabled=false; }
});

$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.target.querySelector('button');
  button.disabled=true;
  try {
    await api('login',{password:$('password').value});
    $('password').value='';
    $('login-error').textContent='';
    await enter();
  } catch(error) { $('login-error').textContent=error.message; }
  finally { button.disabled=false; }
});
const clock = () => {
  $('clock').textContent=clockFormat.format(Date.now()+clockOffset).replace('.',':');
  syncLightingControl();
};
clock();
setInterval(clock,1000);
setInterval(()=>{if (panel==='office' && selected) updateEmployee();},180);
api('session').then(value=>value.authenticated?enter():showLogin()).catch(error=>{
  showLogin();
  $('login-error').textContent=error.message;
});
