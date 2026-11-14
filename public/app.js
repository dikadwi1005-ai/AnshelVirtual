import { activities, divisions, timezone } from './catalog.js';
import { createCharacterStick } from './character-input.js';
import { displayModes, displayState, workstationTask } from './display-state.js';
import { employeeProfile } from './employee-profiles.js';
import { rooms, roomById, wings } from './layout.js';
import { officeStudio } from './office-studio.js';
import { loadSceneModule, lowGraphics, SceneModuleError, sceneFailureMessage } from './scene-support.js';

const $ = id => document.getElementById(id);
const buttons = query => [...document.querySelectorAll(query)];
const phaseNames = {closed:'Kantor tutup', arrival:'Karyawan tiba', briefing:'Briefing pagi',
  work:'Jam kerja', lunch:'Istirahat siang', review:'Evaluasi harian', paused:'Dijeda', open:'Kantor buka', overtime:'Lembur'};
const statusNames = {queued:'Dalam antrean',running:'Berjalan',paused:'Dijeda',blocked:'Terhambat',
  awaiting_approval:'Menunggu persetujuan',completed:'Selesai',failed:'Gagal',cancelled:'Dibatalkan'};
const modeNames = {auto:'Ikuti jadwal',open:'Buka kantor',closed:'Tutup kantor',paused:'Jeda simulasi',overtime:'Mulai lembur'};
const dialogueNames = {disabled:'Bawaan',ready:'Groq · Menunggu percakapan',active:'Groq · Aktif',
  fallback:'Bawaan · Groq belum merespons',limit:'Bawaan · Batas harian tercapai'};
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
let workstation = null;
let workstationPreview = null;
let scene, office, poller, refreshing, toastTimer, clockOffset = 0;
let openingScene=false;
const presenceClient=crypto.randomUUID();
let presenceTimer, presenceBusy=false, claimPresence=false;

function releasePresence() {
  const snapshot=scene?.sharedSnapshot();
  if(!snapshot || $('workspace').hidden)return;
  const body=JSON.stringify({client:presenceClient,snapshot,release:true});
  void fetch('/api/office-presence',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
}
window.addEventListener('pagehide',releasePresence);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)releasePresence();
  else void syncPresence();
});

async function syncPresence() {
  if (!scene || presenceBusy || studio.replaying || scene.layoutActive() || document.hidden || $('workspace').hidden) return;
  presenceBusy=true;
  const takeOver=claimPresence;
  claimPresence=false;
  try {
    const snapshot=scene.sharedSnapshot();
    const value=await api('office-presence',{client:presenceClient,snapshot,takeOver});
    if (!$('workspace').hidden) scene.sharedOffice(value);
  } catch {
    // Keep the most recent office state during a temporary connection failure.
  } finally { presenceBusy=false; }
}
let taskKey = null;
let lighting = localStorage.getItem('anshel-lighting') ?? 'auto';
let voiceEnabled = localStorage.getItem('anshel-office-voice')==='on';
let spatialAudio = localStorage.getItem('anshel-office-spatial-audio')==='on';
const partnerChoices=divisions.filter(person=>employeeProfile(person.id).presentation==='perempuan');
let partner=partnerChoices.find(person=>person.id===localStorage.getItem('anshel-partner'))?.id ?? '';
let characterActive=false;
const movementKeys=new Map();
const analog={x:0,y:0};
const keyDirections={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',
  KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};

function updateMovement() {
  const directions=new Set(movementKeys.values());
  scene?.moveCharacter(Number(directions.has('right'))-Number(directions.has('left'))+analog.x,
    Number(directions.has('up'))-Number(directions.has('down'))+analog.y);
}

const stick=createCharacterStick($('character-stick'),(x,y)=>{
  analog.x=x;
  analog.y=y;
  updateMovement();
});

function clearMovement() {
  movementKeys.clear();
  stick.reset();
}

function setCharacterMode(enabled) {
  characterActive=scene?.characterMode(enabled) ?? false;
  clearMovement();
  const button=$('character-mode');
  button.classList.toggle('active',characterActive);
  button.setAttribute('aria-pressed',String(characterActive));
  button.title=characterActive?'Kembali ke mode pengamat':'Main sebagai Dika';
  button.setAttribute('aria-label',button.title);
  $('character-controls').hidden=!characterActive;
}
let latestAudit = null;
let pendingPanelRefresh = false;

const graphicsPreference = () => lowGraphics(localStorage.getItem('anshel-quality'),{
  compact:matchMedia('(max-width: 800px)').matches,
  coarse:matchMedia('(pointer: coarse)').matches,
  memory:navigator.deviceMemory,
});

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
  clearInterval(presenceTimer);
  claimPresence=false;
  $('workspace').hidden = true;
  studio.signOut();
  setCharacterMode(false);
  scene?.suspend(true);
  $('workspace').hidden = true;
  $('auth').hidden = false;
  if ($('task-dialog').open) $('task-dialog').close();
  setPanel(null);
}

async function enter() {
  $('workspace').hidden = false;
  $('auth').hidden = true;
  await refresh(true);
  scene?.suspend(false);
  clearInterval(poller);
  poller = setInterval(()=>refresh().catch(error=>notice(error.message)),1500);
  clearInterval(presenceTimer);
  presenceTimer=setInterval(syncPresence,1500);
  if (scene || openingScene) return;
  openingScene=true;
  try {
    const officeScene=await loadSceneModule(()=>import('./scene.js'));
    scene = officeScene($('scene'),$('room-labels'),select,(message)=>{
      $('scene-message').textContent = message;
      $('scene-message').hidden = !message;
    },openWorkstation,input=>api('dialogue',input).then(result=>result.lines).catch(()=>[]),
    {low:graphicsPreference()});
    scene.state(office);
    void studio.syncMeeting();
    await syncPresence();
    scene.voice(voiceEnabled);
    scene.spatialAudio(spatialAudio);
    setLighting(lighting);
    await scene.load();
    void syncPresence();
    scene.partner(partner);
    $('character-mode').disabled=!scene.hasCharacter();
    if (panel==='office') render();
  } catch(error) {
    console.error('Gagal membuka kantor 3D',error);
    try { scene?.dispose(); } catch(cleanupError) { console.error('Gagal membersihkan renderer 3D',cleanupError); }
    scene = null;
    const message=document.createElement('span');
    message.textContent=sceneFailureMessage(error);
    const retry=document.createElement('button');
    retry.type='button';
    retry.className='scene-retry';
    const reload=error instanceof SceneModuleError;
    retry.textContent=reload?'Muat ulang halaman':'Coba lagi';
    retry.addEventListener('click',()=>{
      if (reload) { window.location.reload(); return; }
      $('scene-message').textContent='Memuat ulang kantor 3D…';
      enter().catch(failure=>notice(failure.message));
    });
    $('scene-message').replaceChildren(message,retry);
    $('scene-message').hidden=false;
  } finally { openingScene=false; }
}

async function refresh(force = false) {
  if (refreshing) {
    await refreshing;
    if (!force) return;
  }
  refreshing = api('state').then(value=>{
    const signature = JSON.stringify([value.phase,value.mode,value.schedule,value.worker,value.capabilities,value.people,value.tasks,value.audit,value.counts,value.projects]);
    const changes = office?.signature !== signature;
    clockOffset = value.now-Date.now();
    clock();
    office = {...value, signature};
    const dialogueStatus=$('dialogue-status');
    if (dialogueStatus) dialogueStatus.textContent=dialogueNames[value.dialogueStatus] ?? dialogueNames.disabled;
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
  if (panel==='studio' && name!=='studio') studio.close();
  if (panel==='workstation' && name!=='workstation') scene?.closeDisplay();
  panel = name;
  document.querySelector('.inspector').hidden=!name;
  buttons('[data-panel]').forEach(button=>{
    button.classList.toggle('active',button.dataset.panel===name);
    button.setAttribute('aria-pressed',String(button.dataset.panel===name));
  });
  if (name==='studio') {
    title('Anshel Virtual Tech','Studio kantor');
    studio.open();
  } else render();
}

function select(id,room = null) {
  selected = id;
  selectedRoom = room;
  scene?.select(room ?? id);
  if (room) scene?.focusRoom(room);
  setPanel('office');
}

function openWorkstation({room,type}) {
  workstation={room,type:type ?? scene?.displayTypes(room)[0]};
  workstationPreview=null;
  setPanel('workstation');
  if (type) scene?.focusDisplay(room,type);
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
  const life=scene?.employeeLife(selected);
  if (actor) {
    element.dataset.stage=actor.stage;
    element.dataset.animation=actor.animation;
  }
  const moving=['walking','aligning','sitting','departing'].includes(actor?.stage);
  const workStatus=plan.executing?'Eksekusi berjalan':plan.task?.status==='blocked'?'Tugas terhambat':
    plan.task ? (!office.worker || !office.capabilities.includes(plan.task.kind) ? 'Menunggu worker' : 'Dalam antrean') : 'Tanpa tugas aktif';
  const activity=moving ? (plan.executing?'Menuju meja kerja':'Berjalan') :
    actor?.animation?.endsWith('speak')?'Sedang berbicara':activities[actor?.activity ?? plan.activity];
  const markup=stats([
    ['Aktivitas',activity],['Status kerja',workStatus],
    ['Suasana hati',life?.mood ?? plan.mood],
    ...(life ? [['Energi',life.needs.energy],['Fokus',life.needs.focus],['Sosial',life.needs.social],
      ['Istirahat',life.needs.rest],['Hiburan',life.needs.fun]].map(([label,value])=>[label,value+'%']) :
      [['Energi',plan.energy+'%']]),
  ])+(plan.task?'<p class="status-text">'+escape(plan.task.description)+'</p>':'');
  if (element.innerHTML!==markup) element.innerHTML=markup;
  const social=$('employee-social');
  if (!social) return;
  const details=(life?.relations.length?'<p class="section-label">Rekan yang sering diajak bicara</p>'+
    stats(life.relations.map(({id,value})=>[team(id).employee,value+'%'])):'')+
    '<p class="section-label">Obrolan terakhir</p>'+
    (life?.history.length?'<ul class="task-list">'+life.history.map(item=>'<li class="task-card"><strong>'+
      escape(team(item.speaker).employee)+' · '+escape(item.room==='dika'?'Obrolan dengan Dika':roomById[item.room]?.label ?? activities[item.room] ?? 'Kantor')+
      '</strong><p>'+escape(item.text)+'</p></li>').join('')+'</ul>':'<p class="status-text">Belum ada obrolan tercatat.</p>');
  if (social.innerHTML!==details) social.innerHTML=details;
}

function renderOffice() {
  const person = team(selected);
  if (person) {
    const profile=employeeProfile(person.id);
    title(person.name,person.employee);
    $('panel-content').innerHTML = stats([['Jabatan',person.role],['Keahlian',person.specialty],['Kepribadian',person.personality],
      ['Tampilan',profile.presentation],['Pakaian',person.id===partner?'Jas formal senada dengan Dika':profile.outfit]])+
      '<div id="employee-status"></div><div class="context-actions">'+(characterActive?
        '<button id="chat-employee" type="button">Ajak ngobrol</button><button id="invite-employee" type="button">Panggil ke Atrium</button>':
        '<button id="focus-employee" type="button">Fokus karyawan</button><button id="follow" type="button">'+
        (scene?.isFollowing(selected)?'Berhenti mengikuti':'Ikuti dengan kamera')+'</button>')+'</div><div id="employee-social"></div>'+
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
    const hasDisplay=scene?.displayTypes(room.id).length;
    $('panel-content').innerHTML=(personButton?'<div class="roster">'+personButton+'</div>':'')+
      '<div class="context-actions">'+(hasDisplay?'<button type="button" data-workstation="'+room.id+'">Periksa layar</button>':'')+
      '<button type="button" data-directory>Semua ruang</button></div>';
    return;
  }
  title('Denah kantor','Ruang');
  $('panel-content').innerHTML=Object.entries(wings).map(([key,label])=>
    '<p class="section-label">'+label+'</p><div class="quick-rooms">'+rooms.filter(item=>item.wing===key).map(item=>
      '<button type="button" data-room="'+item.id+'">'+item.label+'</button>').join('')+'</div>').join('');
}

const deviceLabels={monitor:'monitor',laptop:'laptop',tv:'TV'};
const gameLabel=()=>{
  const players=scene?.gamePlayers() ?? 0;
  return players ? players+' pemain' : 'Mode demo';
};

function renderWorkstation() {
  const {room:id,type}=workstation;
  const room=roomById[id];
  const snapshot=displayState(office,id);
  const task=workstationTask(office,id);
  title(room.label,id==='gaming'?'Anshel Circuit':'Layar workstation');
  const focusButtons=(scene?.displayTypes(id) ?? []).map(device=>
    '<button type="button" data-focus-display="'+device+'" aria-pressed="'+(device===type)+'">Fokus '+deviceLabels[device]+'</button>');
  const controls='<div class="context-actions">'+focusButtons.join('')+
    '<button type="button" id="minimize-display">Kecilkan layar</button></div>';
  const content=$('panel-content');
  if (id==='gaming') {
    content.innerHTML=controls+'<dl class="stats"><div><dt>Permainan</dt><dd id="game-status">'+gameLabel()+'</dd></div></dl>';
    return;
  }
  const related=office.tasks.filter(item=>item.division===id);
  const queued=related.filter(item=>item.status==='queued');
  const completed=related.filter(item=>item.status==='completed');
  const person=team(id);
  const context=stats([['Pegawai',person?.employee ?? 'Area bersama'],['Antrean',queued.length],
    ['Proyek',[...new Set(related.map(item=>item.project).filter(Boolean))].join(', ') || '—']])+
    '<p class="section-label">Antrean</p>'+renderTasks(queued,false)+
    '<p class="section-label">Hasil terbaru</p>'+renderTasks(completed.slice(0,5),false);
  if (!task) {
    content.innerHTML=controls+stats([['Layar',displayModes[snapshot.mode]]])+context;
    return;
  }
  const logs=office.audit.filter(event=>event.task===task.id).slice(0,8);
  const preview=workstationPreview?.id===task.id
    ? '<pre class="workstation-result">'+escape(workstationPreview.text)+'</pre>' : '';
  const result=task.status==='completed' ? '<div class="task-actions"><button type="button" data-result="'+task.id+
    '">Lihat cuplikan hasil</button><a href="/api/tasks/'+task.id+'/artifact">Unduh hasil</a></div>'+preview : '';
  const rows=[
    ['Layar',displayModes[snapshot.mode]],['Status tugas',statusNames[task.status]??task.status],
    ['Mulai',task.started==null?'—':dateFormat.format(task.started)+' WIB'],
    ['Selesai',task.ended==null?'—':dateFormat.format(task.ended)+' WIB'],
  ];
  if (task.status==='running') rows.push(['Progres',Number.isFinite(task.progress)?task.progress+'%':'Belum dilaporkan']);
  content.innerHTML=controls+'<article class="task-card"><p>'+escape(task.description)+'</p>'+
    (task.project?'<small>'+escape(task.project)+'</small>':'')+stats(rows)+
    (task.error?'<p class="error">'+escape(task.error)+'</p>':'')+
    (task.sha256?'<small class="hash">SHA-256 '+escape(task.sha256)+'</small>':'')+result+'</article>'+
    '<p class="section-label">Log terbaru</p>'+renderAudit(logs)+context;
}

function renderAudit(items) {
  return items.length?'<ul class="audit-list">'+items.map(item=>
    '<li><strong>'+escape(actionNames[item.action]??item.action)+'</strong><br><small>'+
    dateFormat.format(item.at)+' · '+escape(item.actor)+'</small>'+
    (item.detail?'<p>'+escape(item.detail)+'</p>':'')+'</li>').join('')+'</ul>':
    '<p class="status-text">Belum ada aktivitas tercatat.</p>';
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
    '<label>Kualitas grafis<select id="quality">'+optionList([['auto','Otomatis (HP lebih ringan)'],['normal','Standar'],['low','Ringan']],localStorage.getItem('anshel-quality')??'auto')+'</select></label>'+
    '<label>Pasangan Dika<select id="character-partner">'+optionList([['','Belum dipilih'],...partnerChoices.map(person=>[person.id,person.employee])],partner)+'</select></label>'+
    '<label>Suara dialog<select id="office-voice">'+optionList([['off','Subtitle'],['on','Suara Indonesia jika tersedia']],voiceEnabled?'on':'off')+'</select></label>'+
    '<label>Suara langkah<select id="office-spatial-audio">'+optionList([['off','Mati'],['on','Aktif saat kamera dekat']],spatialAudio?'on':'off')+'</select></label>'+
    '<dl class="stats"><div><dt>Dialog</dt><dd id="dialogue-status">'+(dialogueNames[office.dialogueStatus] ?? dialogueNames.disabled)+'</dd></div></dl>'+
    '<p class="section-label">Jadwal · WIB</p><div class="form-grid">'+Object.entries(scheduleFields).map(([key,label])=>
      '<label>'+label+'<input type="time" name="'+key+'" required value="'+escape(schedule[key])+'"></label>').join('')+'</div>'+
    '<div class="days" aria-label="Hari kerja">'+['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map((day,i)=>
      '<label><input type="checkbox" name="day" value="'+i+'"'+(schedule.days.includes(i)?' checked':'')+'> '+day+'</label>').join('')+'</div>'+
    '<label>Tanggal libur <span>YYYY-MM-DD, pisahkan dengan koma</span><textarea name="holidays" rows="2">'+escape(schedule.holidays.join(', '))+'</textarea></label>'+
    '<button type="submit" class="primary">Simpan pengaturan</button><button type="button" id="logout">Keluar</button></form>';
}

function renderMonitoring() {
  title('Data aktual · 4 bot aktif','Monitor aktivitas');
  const watched=['management','operations','administration','hr'];
  const names=watched.map(id=>team(id)).filter(Boolean);
  const snapshot=office;
  const overview=stats([
    ['Worker',snapshot.worker?'Terlihat aktif belakangan ini':'Tidak ada heartbeat dalam 40 detik'],
    ['Antre',snapshot.counts?.queued??0],
    ['Sedang diproses',snapshot.counts?.running??0],
    ['Menunggu persetujuan',snapshot.counts?.awaiting_approval??0],
    ['Terhambat',snapshot.counts?.blocked??0],
    ['Gagal',snapshot.counts?.failed??0],
  ]);
  const roster='<p class="section-label">Pegawai Telegram aktif</p><ul class="task-list">'+
    names.map(p=>{
      const avatar=snapshot.people?.[p.id]||{};
      const jobs=snapshot.tasks.filter(t=>t.division===p.id);
      const current=jobs.find(t=>t.status==='running')||jobs.find(t=>t.status==='queued')||jobs[0];
      const inProgress=avatar.executing===true||jobs.some(t=>t.status==='running');
      const activity=activities[avatar.activity]||'Belum tercatat';
      return '<li class="task-card"><button type="button" data-employee="'+escape(p.id)+'">'+escape(p.employee)+'</button>'+
        stats([['Aktivitas avatar',activity],['Status kerja',inProgress?'Eksekusi tugas sedang berjalan':
          current?.status==='queued'?'Tugas menunggu worker':'Tidak sedang mengeksekusi tugas']])+
        (current?'<p>'+escape(current.project||'Tanpa proyek')+' · '+escape(statusNames[current.status]||current.status)+'</p>':
          '<p class="status-text">Belum ada tugas tercatat</p>')+'</li>';
    }).join('')+'</ul>';
  const results=snapshot.tasks.filter(t=>watched.includes(t.division)&&t.status==='completed').slice(0,4);
  $('panel-content').innerHTML='<p class="status-text">Data ini berasal dari tugas dan aktivitas avatar yang tercatat. Status worker bukan pemeriksaan menyeluruh terhadap server.</p>'+
    overview+roster+'<p class="section-label">Hasil draf terbaru</p>'+renderTasks(results,false);
}
function render() {
  if (!office || !panel) return;
  if (panel==='studio') return;
  if (panel==='office') return renderOffice();
  if (panel==='monitor') return renderMonitoring();
  if (panel==='workstation') return renderWorkstation();
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
    const supported = [['diagnostic','diagnostik'],['draft','draf AI']]
      .filter(([kind])=>office.capabilities.includes(kind)).map(([,label])=>label);
    const worker = !office.worker ? 'Worker belum terhubung.' : supported.length ?
      'Worker menerima '+supported.join(' dan ')+'.' : 'Worker belum melaporkan jenis pekerjaan yang didukung.';
    $('panel-content').innerHTML='<p class="status-text">'+worker+'</p>'+renderTasks(office.tasks);
    return;
  }
  title('Log audit','Aktivitas');
  $('panel-content').innerHTML=renderAudit(office.audit);
}

$('panel-content').addEventListener('click',async event=>{
  const button=event.target.closest('button');
  if (!button) return;
  if (button.id==='minimize-display') return scene?.closeDisplay();
  if (button.dataset.workstation) return openWorkstation({room:button.dataset.workstation});
  if (button.dataset.focusDisplay) {
    workstation.type=button.dataset.focusDisplay;
    scene?.focusDisplay(workstation.room,workstation.type);
    for (const control of $('panel-content').querySelectorAll('[data-focus-display]')) {
      control.setAttribute('aria-pressed',String(control===button));
    }
    return;
  }
  if (button.dataset.result) {
    const id=button.dataset.result;
    button.disabled=true;
    try {
      const response=await fetch('/api/tasks/'+id+'/artifact');
      if (response.status===401) return showLogin();
      if (!response.ok) throw new Error('Cuplikan hasil tidak tersedia.');
      const output=await response.text();
      if (panel!=='workstation' || workstationTask(office,workstation.room)?.id!==id) return;
      workstationPreview={id,text:output.length>1800?output.slice(0,1800)+'…':output};
      renderWorkstation();
    } catch(error) { notice(error.message); }
    finally { button.disabled=false; }
    return;
  }
  if (button.dataset.employee) return select(button.dataset.employee);
  if (button.id==='chat-employee' || button.id==='invite-employee') {
    const message=scene?.interact(selected,button.id==='invite-employee'?'invite':'chat');
    if (message) notice(message);
    else setPanel(null);
    return;
  }
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
  if (field.id==='character-partner') {
    partner=partnerChoices.find(person=>person.id===field.value)?.id ?? '';
    if (partner) localStorage.setItem('anshel-partner',partner);
    else localStorage.removeItem('anshel-partner');
    scene?.partner(partner);
  }
  if (field.id==='office-voice') {
    voiceEnabled=field.value==='on';
    localStorage.setItem('anshel-office-voice',field.value);
    scene?.voice(voiceEnabled);
  }
  if (field.id==='office-spatial-audio') {
    spatialAudio=field.value==='on';
    localStorage.setItem('anshel-office-spatial-audio',field.value);
    scene?.spatialAudio(spatialAudio);
  }
  if (field.id==='quality') {
    if (field.value==='auto') localStorage.removeItem('anshel-quality');
    else localStorage.setItem('anshel-quality',field.value);
    scene?.quality(graphicsPreference());
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
  character:'<circle cx="12" cy="7" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
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
function toggleCharacterMode() {
  const enable=!characterActive;
  setCharacterMode(enable);
  if (enable && characterActive) {
    setPanel(null);
    claimPresence=true;
    void syncPresence();
  }
  else if (enable) notice('Area masuk Dika sedang terhalang. Coba lagi sebentar.');
}
const characterButton=$('character-mode');
function openNearbyEmployee() {
  const id=scene?.nearbyEmployee();
  if (id) select(id);
  else notice('Dekati pegawai untuk berinteraksi.');
}
$('interact-employee').addEventListener('click',openNearbyEmployee);
let lastTouchToggle=-Infinity;
characterButton.addEventListener('pointerup',event=>{
  if (event.pointerType!=='touch' || characterButton.disabled ||
      !characterButton.contains(document.elementFromPoint(event.clientX,event.clientY))) return;
  lastTouchToggle=performance.now();
  toggleCharacterMode();
});
characterButton.addEventListener('click',event=>{
  if (event.detail && performance.now()-lastTouchToggle<500) return;
  toggleCharacterMode();
});
window.addEventListener('keydown',event=>{
  if (!characterActive || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.('input,textarea,select,[contenteditable]') || $('task-dialog').open) return;
  if (event.code==='KeyE') {
    event.preventDefault();
    if (!event.repeat) openNearbyEmployee();
    return;
  }
  if (!keyDirections[event.code]) return;
  event.preventDefault();
  movementKeys.set(event.code,keyDirections[event.code]);
  updateMovement();
});
window.addEventListener('keyup',event=>{
  if (movementKeys.delete(event.code)) updateMovement();
});
window.addEventListener('blur',clearMovement);
document.addEventListener('visibilitychange',()=>{ if (document.hidden) clearMovement(); });
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

function openTask(description='',project='') {
  const form=$('task-form');
  form.reset();
  form.elements.division.innerHTML=teamOptions(selected ?? 'operations');
  form.elements.description.value=description.slice(0,2000);
  form.elements.project.value=project.slice(0,80);
  if (project==='Storyboard Anshel') form.elements.kind.value='draft';
  $('task-error').textContent='';
  taskKey=crypto.randomUUID();
  $('task-dialog').showModal();
}
const studio=officeStudio({host:$('scene'),content:$('panel-content'),scene:()=>scene,office:()=>office,
  escape,notice,release:releasePresence,connect:syncPresence,newTask:openTask,api});
$('new-task').addEventListener('click',()=>openTask());
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
  if (!$('workspace').hidden) studio.tick(Date.now()+clockOffset);
};
clock();
setInterval(clock,1000);
setInterval(()=>{
  if (panel==='office' && selected) updateEmployee();
  const gameStatus=$('game-status');
  if (gameStatus && gameStatus.textContent!==gameLabel()) gameStatus.textContent=gameLabel();
},180);
api('session').then(value=>value.authenticated?enter():showLogin()).catch(error=>{
  showLogin();
  $('login-error').textContent=error.message;
});
