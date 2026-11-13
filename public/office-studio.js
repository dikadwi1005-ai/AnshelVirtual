import { divisions } from './catalog.js';
import { editProp, layoutItems } from './layout-editor.js';
import { historyEvent, localReminderTime, maxEvents, maxFrames, nationSnapshot, storyboard } from './studio-data.js';
import { recordReplay } from './studio-video.js';

export function officeStudio({host,content,scene,office,escape,notice,release,connect,newTask}) {
  const labels={layout:'Tata letak',meeting:'Rapat',history:'Riwayat',replay:'Replay',plan:'Storyboard',schedule:'Jadwal',city:'Nation City'};
  const names=Object.fromEntries(divisions.map(person=>[person.id,person.employee]));
  const time=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'short',timeStyle:'medium'});
  const frameList=[], events=[], meetings=[], plans=[], layoutHistory=[{}];
  let tab='meeting', cursor=0, item=layoutItems[0].id, meeting=null, attended=new Set(), recording, output, replaying=false, city;
  let visible=false, replayFrames, replayPosition=0, nextDueCheck=0;
  const storageKey='anshel-layout-v1';
  const reminderKey='anshel-reminders-v1';
  try {
    const saved=JSON.parse(sessionStorage.getItem(reminderKey) ?? '[]');
    if (Array.isArray(saved)) plans.push(...saved.slice(0,50).filter(plan=>plan &&
      typeof plan.id==='string' && /^[\w-]{1,64}$/.test(plan.id) && typeof plan.label==='string' && plan.label.length<=120 &&
      ['task','report'].includes(plan.kind) && [plan.when,plan.reviewed ?? 0,plan.notified ?? 0]
        .every(value=>Number.isFinite(value) && Math.abs(value)<8.64e15)));
  } catch { /* Reminders can still run in memory. */ }
  const savePlans=()=>{ try { sessionStorage.setItem(reminderKey,JSON.stringify(plans)); } catch {} };
  const options=divisions.map(person=>'<option value="'+person.id+'">'+escape(person.employee)+'</option>').join('');
  const formValue=(form,key)=>form.elements.namedItem(key).value;
  const button=(action,label)=>'<button type="button" data-studio-action="'+action+'">'+label+'</button>';
  const subtitle=()=>content.querySelector('#replay-subtitle');

  function render() {
    content.innerHTML='<nav class="context-actions studio-tabs" aria-label="Ruang kerja">'+Object.entries(labels)
      .map(([id,label])=>'<button type="button" data-studio-tab="'+id+'" aria-pressed="'+(id===tab)+'">'+label+'</button>').join('')+
      '</nav><section id="studio-body"></section>';
    const body=content.querySelector('#studio-body');
    if (tab==='layout') {
      const value=layoutHistory[cursor][item] ?? [0,0,0];
      body.innerHTML='<form id="studio-layout"><p class="status-text">Pilih objek di denah atau daftar. Satuan meter, kisi 0,25 m. Perubahan berlaku di browser ini.</p>'+
        '<label>Objek<select name="item">'+layoutItems.map(entry=>'<option value="'+entry.id+'"'+(entry.id===item?' selected':'')+'>'+
          escape(entry.room.label+' · '+entry.prop.type+' '+(Number(entry.id.split(':')[1])+1))+'</option>').join('')+'</select></label>'+
        '<div class="form-grid">'+['Geser X','Geser Z','Rotasi °'].map((label,i)=>'<label>'+label+'<input type="number" name="v'+i+
          '" step="'+(i===2?15:.25)+'" min="'+(i===2?-180:-5)+'" max="'+(i===2?180:5)+'" value="'+value[i]+'" required></label>').join('')+'</div>'+
        '<div class="context-actions">'+button('layout-preview','Pratinjau 3D')+'<button type="submit">Terapkan</button>'+
        button('undo','Urungkan')+button('redo','Ulangi')+button('save','Simpan')+button('load','Muat')+button('reset','Reset')+'</div></form>';
    }
    if (tab==='meeting') {
      body.innerHTML=meeting?'<form id="studio-minutes"><h3>'+escape(meeting.agenda)+'</h3><p id="studio-attendance"></p>'+
        '<label>Notulen<textarea name="notes" maxlength="2000">'+escape(meeting.notes)+'</textarea></label>'+
        '<label>Keputusan<textarea name="decisions" maxlength="1000">'+escape(meeting.decisions)+'</textarea></label>'+
        '<div class="context-actions">'+button('presentation','Fokus layar rapat')+button('presentation-close','Kembali ke ruangan')+button('followup','Tinjau tugas tindak lanjut')+
        '<button type="submit">Tutup dan catat rapat</button></div></form>'+materials():
        '<form id="studio-meeting"><label>Agenda rapat<input name="agenda" required maxlength="120"></label>'+
        '<div class="form-grid"><label>Peserta 1<select name="first">'+options+'</select></label>'+
        '<label>Peserta 2<select name="second"><option value="">Pilih peserta</option>'+options+'</select></label></div>'+
        '<button type="submit">Panggil ke Pod Rapat</button></form>';
      if (meetings.length) body.insertAdjacentHTML('beforeend','<h3>Rapat di sesi ini</h3><ul class="audit-list">'+meetings.slice(-8).reverse().map(entry=>
        '<li><strong>'+escape(entry.agenda)+'</strong><br><small>'+time.format(entry.closed)+' WIB · '+escape(entry.attended.map(id=>names[id]).join(', ') || 'Tanpa kehadiran')+
        '</small><p>'+escape(entry.notes)+'</p><p>'+escape(entry.decisions)+'</p></li>').join('')+'</ul>');
      attendance();
    }
    if (tab==='history') {
      body.innerHTML='<h3>Simulasi sesi ini</h3><ul class="audit-list">'+events.slice(-24).reverse().map(event=>'<li>'+time.format(event.at)+
        ' WIB · '+escape(event.kind==='dialogue'?'Dialog '+names[event.employee]:event.kind==='meeting'?'Rapat '+event.action:
          event.count+' pegawai berubah aktivitas')+
        (frameList.length>1 && event.at>=frameList[0].at?'<br><button type="button" data-studio-seek="'+event.at+'">Buka di replay</button>':'')+'</li>').join('')+
        '</ul><h3>Audit kerja</h3><ul class="audit-list">'+(office()?.audit ?? []).slice(0,20).map(event=>
          '<li>'+time.format(event.at)+' WIB · '+escape(event.action)+'</li>').join('')+'</ul>';
    }
    if (tab==='replay') {
      body.innerHTML='<p class="status-text">Hingga enam menit rekaman sesi. Ekspor memakai animasi 3D dan berjalan selama durasi klip.</p>'+
        '<div class="context-actions">'+button('replay-start','Muat rekaman')+button('play','Putar / jeda')+button('replay-stop','Kembali live')+'</div>'+
        '<label>Timeline<input type="range" id="studio-seek" min="0" max="0" value="0" step=".1"></label><p id="replay-subtitle" role="status"></p>'+
        '<form id="studio-video"><div class="form-grid"><label>Kecepatan<select id="studio-speed"><option>.5</option><option selected>1</option><option>2</option></select></label>'+
        '<label>Kamera<select id="studio-camera"><option value="">Seluruh kantor</option><option value="meeting">Pod Rapat</option>'+
        '<option value="gaming">Lounge PS5</option><option value="hub">Atrium</option></select></label>'+
        '<label>Mulai (detik)<input name="start" type="number" min="0" value="0" step=".1" required></label>'+
        '<label>Akhir (detik)<input name="end" type="number" min="0" value="0" step=".1" required></label>'+
        '<label>Ukuran<select name="ratio"><option value="landscape">16:9</option><option value="portrait">9:16</option></select></label>'+
        '<label>Format<select name="format"><option value="webm">WebM</option><option value="mp4">MP4</option></select></label></div>'+
        '<label>Teks video<input name="heading" maxlength="100"></label>'+
        '<label>Audio atau narasi lokal<input name="audio" type="file" accept="audio/*"></label>'+
        '<label class="checkbox"><input name="subtitles" type="checkbox" checked> Subtitle dialog</label>'+
        '<div class="context-actions"><button type="submit">Ekspor video</button>'+button('cancel-video','Batalkan ekspor')+
        '</div><progress id="studio-progress" max="100" value="0"></progress><div id="studio-output"></div></form>';
    }
    if (tab==='plan') {
      body.innerHTML='<form id="studio-plan"><label>Instruksi storyboard<textarea name="instruction" required maxlength="400" placeholder="Jadikan rapat tadi video pendek"></textarea></label>'+
        '<button type="submit">Susun dari riwayat</button></form><div id="studio-storyboard"></div>';
    }
    if (tab==='schedule') {
      const state=office();
      const runs=(state?.audit ?? []).filter(event=>event.action==='scheduled_reserved').slice(0,8);
      body.innerHTML='<p class="status-text">'+(state?.worker?'Worker terhubung.':'Worker offline.')+
        ' Kuota penjadwalan worker yang sudah ada adalah 3 draf per hari WIB. Pengingat lokal tidak mengeksekusi AI. Kalender kerja dan hari libur ada di Pengaturan.</p>'+
        '<form id="studio-schedule"><label>Nama rencana<input name="label" maxlength="120" required></label>'+
        '<div class="form-grid"><label>Jenis<select name="kind"><option value="task">Tugas</option><option value="report">Laporan</option></select></label>'+
        '<label>Waktu WIB<input type="datetime-local" name="when" required></label></div><button type="submit">Simpan pengingat</button></form>'+
        '<ul class="audit-list">'+plans.slice(-15).reverse().map(plan=>'<li><strong>'+escape(plan.label)+'</strong><br><small>'+time.format(plan.when)+
        ' WIB · '+(plan.reviewed?'Ditinjau '+time.format(plan.reviewed):plan.notified?'Pengingat muncul '+time.format(plan.notified):'Terjadwal')+'</small><br>'+
        '<button type="button" data-studio-plan="'+plan.id+'">Tinjau manual</button> <button type="button" data-studio-remove="'+plan.id+
        '">Hapus</button></li>').join('')+'</ul><h3>Reservasi worker</h3>'+
        (runs.length?'<ul class="audit-list">'+runs.map(event=>'<li>'+time.format(event.at)+' WIB · '+escape(event.detail)+'</li>').join('')+'</ul>':
          '<p class="status-text">Belum ada reservasi dalam audit terbaru.</p>');
    }
    if (tab==='city') {
      body.innerHTML='<p class="status-text">Impor JSON status dan event yang diizinkan. Sumber '+(city?'snapshot lokal.':'belum terhubung.')+'</p>'+
        '<form id="studio-city"><label>Snapshot Nation City<input name="snapshot" type="file" accept=".json,application/json" required></label>'+
        '<button type="submit">Baca snapshot</button></form>'+
        (city?'<h3>'+escape(city.status)+' · '+time.format(Date.parse(city.updatedAt))+' WIB</h3><ul class="audit-list">'+
          city.events.map(event=>'<li>'+time.format(Date.parse(event.at))+' WIB · '+escape(event.label)+'</li>').join('')+'</ul>':'');
    }
  }

  function materials() {
    return '<h3>Artefak tersedia</h3><ul class="audit-list">'+(office()?.tasks ?? []).filter(task=>task.status==='completed').slice(0,8)
      .map(task=>'<li><a href="/api/tasks/'+encodeURIComponent(task.id)+'/artifact">'+escape(task.description)+'</a></li>').join('')+'</ul>';
  }
  function attendance() {
    if (!meeting) return;
    const present=meeting.participants.map(id=>{
      const actor=scene()?.actorState(id);
      const seated=actor?.activity==='meeting' && actor.stage==='seated';
      if (seated) attended.add(id);
      return names[id]+' · '+(seated?'Hadir':office()?.people[id]?.taskLock?'Sedang bertugas':'Menuju rapat');
    });
    const target=visible && content.querySelector('#studio-attendance');
    if (target) target.textContent=present.join(' | ');
  }
  function append(event) {
    events.push(event);
    if (events.length>maxEvents) events.shift();
  }
  host.addEventListener('office-frame',event=>{
    const frame={...event.detail,at:Math.max(Date.now(),(frameList.at(-1)?.at ?? 0)+1)};
    if (frameList.length && frame.at-frameList.at(-1).at>4000) frameList.length=0;
    const change=historyEvent(frameList.at(-1),frame);
    if (change) append(change);
    frameList.push(frame);
    if (frameList.length>maxFrames) frameList.shift();
    attendance();
  });
  function applyLayout(next,index=null) {
    release();
    if (!scene()?.layout(next)) {
      void connect();
      return notice('Penempatan menghalangi jalur atau belum aman. Coba posisi lain di mode Director.');
    }
    scene().previewLayout(null);
    frameList.length=0;
    if (index===null) {
      layoutHistory.splice(cursor+1,layoutHistory.length,next);
      if (layoutHistory.length>30) layoutHistory.shift();
      cursor=layoutHistory.length-1;
    } else cursor=index;
    if (!Object.keys(next).length) void connect();
    render();
  }
  function layoutFields(form) {
    if (!form.reportValidity()) return null;
    return [0,1,2].map(i=>Number(formValue(form,'v'+i)));
  }
  function onFrame(_,turn,at,playing) {
    replayPosition=at;
    const slider=content.querySelector('#studio-seek');
    if (slider) slider.value=String((at-replayFrames[0].at)/1000);
    const text=turn?names[turn.id]+' · '+turn.text:'';
    if (subtitle() && subtitle().textContent!==text) subtitle().textContent=text;
    if (!playing) replayPlaying=false;
  }
  let replayPlaying=false;
  function startReplay(at) {
    if (replaying) stopReplay();
    replayFrames=frameList.slice();
    if (replayFrames.length<2) return notice('Tunggu beberapa detik sampai rekaman tersedia.');
    release();
    if (!scene()?.startReplay(replayFrames)) {
      void connect();
      return notice('Tutup rapat aktif atau tunggu sampai kantor selesai dimuat.');
    }
    replaying=true;
    const first=replayFrames[0].at,last=replayFrames.at(-1).at;
    replayPosition=Math.min(last,Math.max(first,at ?? first));
    const duration=(last-first)/1000;
    const form=content.querySelector('#studio-video');
    form.elements.end.value=String(Math.floor(duration*10)/10);
    content.querySelector('#studio-seek').max=String(duration);
    scene().replayOptions({time:replayPosition,onFrame});
  }
  function stopReplay() {
    recording?.cancel();
    if (!replaying) return;
    replaying=replayPlaying=false;
    scene()?.stopReplay();
    void connect();
  }
  function setTab(next) {
    if (tab==='replay' && next!=='replay') stopReplay();
    scene()?.previewLayout(null);
    scene()?.closeDisplay();
    tab=next;
    scene()?.chooseFurniture(next==='layout'?selectFurniture:null);
    render();
  }
  function selectFurniture(id) {
    item=id;
    const target=layoutItems.find(entry=>entry.id===item);
    scene()?.focusRoom(target.room.id);
    scene()?.previewLayout(editProp(item,...(layoutHistory[cursor][item] ?? [0,0,0])));
    render();
  }

  async function exportVideo(form) {
    if (!replaying || recording) return notice('Muat replay sebelum ekspor.');
    const first=replayFrames[0].at,last=replayFrames.at(-1).at;
    const start=first+Number(formValue(form,'start'))*1000,end=first+Number(formValue(form,'end'))*1000;
    if (start<first || end>last || end-start<500 || end-start>90000) return notice('Pilih rentang 0,5–90 detik dalam rekaman.');
    const file=form.elements.audio.files[0];
    if (file && (!file.type.startsWith('audio/') || file.size>25_000_000)) return notice('Pilih berkas audio hingga 25 MB.');
    const audioUrl=file && URL.createObjectURL(file);
    const format=formValue(form,'format');
    try {
      recording=recordReplay(scene(),{format,portrait:formValue(form,'ratio')==='portrait',heading:formValue(form,'heading'),
        subtitles:form.elements.subtitles.checked,audio:audioUrl?new Audio(audioUrl):null,start,end,onProgress(progress) {
          const bar=content.querySelector('#studio-progress');
          if (bar) bar.value=progress;
        }});
      const blob=await recording.result;
      if (!visible || tab!=='replay') return;
      if (output) URL.revokeObjectURL(output);
      output=URL.createObjectURL(blob);
      const target=content.querySelector('#studio-output');
      const video=document.createElement('video'), link=document.createElement('a');
      video.controls=true;
      video.src=link.href=output;
      link.download='anshel-office.'+format;
      link.textContent='Unduh video';
      target.replaceChildren(video,link);
    } catch (error) { notice(error.message); }
    finally {
      recording=null;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      scene()?.replayOptions({end:last,onFrame,speed:Number(content.querySelector('#studio-speed')?.value ?? 1)});
    }
  }
  content.addEventListener('change',event=>{
    if (!visible) return;
    const field=event.target;
    if (field.form?.id==='studio-layout' && field.name==='item') selectFurniture(field.value);
    if (field.id==='studio-speed' && !recording) scene()?.replayOptions({speed:Number(field.value)});
    if (field.id==='studio-camera' && !recording) {
      if (field.value) scene()?.focusRoom(field.value);
      else scene()?.reset();
    }
  });
  content.addEventListener('input',event=>{
    if (!visible) return;
    const field=event.target;
    if (meeting && field.form?.id==='studio-minutes' && ['notes','decisions'].includes(field.name)) {
      meeting[field.name]=field.value;
      return;
    }
    if (!replaying || recording || field.id!=='studio-seek') return;
    scene().replayOptions({time:replayFrames[0].at+Number(field.value)*1000,playing:false});
    replayPlaying=false;
  });
  content.addEventListener('click',event=>{
    if (!visible) return;
    const control=event.target.closest('button');
    if (!control) return;
    const data=control.dataset;
    if (data.studioTab) return setTab(data.studioTab);
    if (data.studioSeek) { setTab('replay'); return startReplay(Number(data.studioSeek)); }
    if (data.studioRemove) {
      const index=plans.findIndex(entry=>entry.id===data.studioRemove);
      if (index>=0) { plans.splice(index,1); savePlans(); render(); }
      return;
    }
    if (data.studioPlan) {
      const plan=plans.find(entry=>entry.id===data.studioPlan);
      if (!plan) return;
      plan.reviewed=Date.now();
      savePlans();
      render();
      return newTask((plan.kind==='report'?'Siapkan laporan: ':'')+plan.label,'');
    }
    switch (data.studioAction) {
      case 'layout-preview': {
        const values=layoutFields(control.form);
        if (!values) break;
        scene()?.focusRoom(layoutItems.find(entry=>entry.id===item).room.id);
        scene()?.previewLayout(editProp(item,...values));
        break;
      }
      case 'undo':
      case 'redo': {
        const index=cursor+(data.studioAction==='undo'?-1:1);
        if (index>=0 && index<layoutHistory.length) applyLayout(layoutHistory[index],index);
        break;
      }
      case 'save':
        try { localStorage.setItem(storageKey,JSON.stringify(layoutHistory[cursor])); notice('Tata letak disimpan.'); }
        catch { notice('Penyimpanan browser tidak tersedia.'); }
        break;
      case 'load':
        try { applyLayout(JSON.parse(localStorage.getItem(storageKey) ?? '{}')); }
        catch { notice('Tata letak tersimpan tidak dapat dibaca.'); }
        break;
      case 'reset': applyLayout({}); break;
      case 'presentation': scene()?.focusDisplay('meeting','tv'); break;
      case 'presentation-close': scene()?.closeDisplay(); break;
      case 'followup': newTask((formValue(control.form,'decisions') || formValue(control.form,'notes') || meeting.agenda).trim(),'Rapat: '+meeting.agenda); break;
      case 'replay-start': if (!recording) startReplay(); break;
      case 'replay-stop': stopReplay(); break;
      case 'cancel-video': recording?.cancel(); break;
      case 'play':
        if (replaying && !recording) {
          if (replayPosition>=replayFrames.at(-1).at) scene().replayOptions({time:replayFrames[0].at});
          scene().replayOptions({playing:replayPlaying=!replayPlaying});
        }
        break;
    }
  });
  content.addEventListener('submit',async event=>{
    const form=event.target;
    if (!visible || !form.id.startsWith('studio-')) return;
    event.preventDefault();
    const value=key=>formValue(form,key);
    switch (form.id) {
      case 'studio-layout': {
        const values=layoutFields(form);
        if (!values) return;
        const next={...layoutHistory[cursor]};
        if (values.some(Boolean)) next[item]=values;
        else delete next[item];
        applyLayout(next);
        break;
      }
      case 'studio-meeting': {
        if (value('first')===value('second') || !value('second') || !value('agenda').trim()) return notice('Pilih dua pegawai berbeda dan isi agenda.');
        const next={agenda:value('agenda').trim(),participants:[value('first'),value('second')]};
        release();
        if (!scene()?.meeting(next)) return notice('Jalankan rapat dari sesi kantor yang aktif dan tidak dijeda.');
        meeting=next;
        attended=new Set();
        append({kind:'meeting',action:'dimulai',at:Date.now(),source:'simulation'});
        scene().focusRoom('meeting');
        render();
        break;
      }
      case 'studio-minutes':
        meetings.push({...meeting,notes:value('notes'),decisions:value('decisions'),attended:[...attended],closed:Date.now()});
        if (meetings.length>30) meetings.shift();
        append({kind:'meeting',action:'ditutup',at:Date.now(),source:'simulation'});
        meeting=null;
        scene()?.meeting(null);
        scene()?.closeDisplay();
        void connect();
        render();
        break;
      case 'studio-video': await exportVideo(form); break;
      case 'studio-plan': {
        const plan=storyboard(value('instruction'),{events,meetings,tasks:office().tasks,people:divisions});
        const target=content.querySelector('#studio-storyboard');
        target.innerHTML='<h3>'+escape(plan.subject)+'</h3>'+(plan.items.length?
          '<ol>'+plan.items.map(line=>'<li>'+escape(line)+'</li>').join('')+'</ol><div class="context-actions"></div>':
          '<p class="status-text">Data sumber belum tersedia untuk instruksi ini.</p>');
        if (plan.items.length) {
          const control=document.createElement('button');
          control.type='button';
          control.textContent=office().worker && office().capabilities.includes('draft')?'Tinjau permintaan draf AI':'Worker draf belum tersedia';
          control.disabled=!office().worker || !office().capabilities.includes('draft');
          control.onclick=()=>newTask('Susun storyboard menggunakan fakta berikut. Jangan menambah klaim atau memublikasikan.\n'+plan.items.join('\n'),
            'Storyboard Anshel');
          target.querySelector('.context-actions').append(control);
        }
        break;
      }
      case 'studio-schedule': {
        const when=localReminderTime(value('when'));
        if (!Number.isFinite(when) || !value('label').trim()) return notice('Tanggal WIB atau nama rencana tidak valid.');
        if (plans.length>=50) return notice('Hapus salah satu pengingat sebelum menambah rencana.');
        if (plans.some(plan=>plan.when===when && plan.kind===value('kind') && plan.label===value('label').trim()))
          return notice('Pengingat ini sudah ada.');
        plans.push({id:crypto.randomUUID(),label:value('label').trim(),kind:value('kind'),when});
        savePlans();
        render();
        break;
      }
      case 'studio-city': {
        try {
          const file=form.elements.snapshot.files[0];
          if (!file || file.size>64_000) throw new Error();
          const next=nationSnapshot(JSON.parse(await file.text()));
          if (!next) throw new Error();
          if (!visible || tab!=='city') return;
          city=next;
          if (visible && tab==='city') render();
        } catch { notice('Snapshot Nation City tidak valid atau terlalu besar.'); }
        break;
      }
    }
  });
  return {
    open() { visible=true; setTab(tab); },
    close() {
      visible=false;
      stopReplay();
      scene()?.previewLayout(null);
      scene()?.chooseFurniture(null);
      scene()?.closeDisplay();
      if (output) { URL.revokeObjectURL(output); output=null; }
    },
    signOut() {
      this.close();
      scene()?.meeting(null);
      meeting=null;
      frameList.length=events.length=meetings.length=plans.length=0;
      savePlans();
      city=null;
    },
    get replaying() { return replaying; },
    tick(now) {
      if (now<nextDueCheck) return;
      nextDueCheck=now+1000;
      const due=plans.filter(plan=>plan.when<=now && !plan.notified);
      for (const plan of due) plan.notified=now;
      if (due.length) {
        savePlans();
        notice(due.length+' pengingat WIB siap ditinjau di Studio.');
      }
    },
  };
}
