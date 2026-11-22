const $=id=>document.getElementById(id);
const escape=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const when=at=>Number.isFinite(at)?new Date(at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'Belum tersedia';
const money=amount=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(amount);
let state,activeTab='leads',busy=false;
async function api(input) {
  const response=await fetch('/api/automation',input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{});
  if (response.status===401) throw new Error('Masuk lewat halaman kantor, lalu buka kembali halaman ini.');
  const data=await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Permintaan belum berhasil.');
  return data;
}
function notify(message,error=false) { $('feedback').textContent=message;$('feedback').classList.toggle('error',error); }
async function act(input,message='Perubahan tersimpan.') {
  if (busy) return;
  busy=true;document.querySelectorAll('button').forEach(button=>button.disabled=true);
  try { await api(input);await refresh();notify(message); }
  catch (error) {notify(error.message,true);}
  finally {busy=false;document.querySelectorAll('button').forEach(button=>button.disabled=false);}
}
function values(form) { return Object.fromEntries(new FormData(form)); }
function fill(form,data) {
  for (const [key,value] of Object.entries(data)) {
    const field=form.elements.namedItem(key);
    if (field && !['id'].includes(key)) field.value=Array.isArray(value)?value.join(key==='keywords'?'\n':','):value ?? '';
  }
}
function renderLeads() {
  $('lead-discovery').innerHTML=(state.discovery ?? []).map(item=>'<p><a target="_blank" rel="noopener noreferrer" href="'+escape(item.url)+'">'+escape(item.title || item.url)+'</a><br>'+escape(item.reason)+'</p>').join('') || '<p>Belum ada penemuan. Hasil ini belum dihitung sebagai lead.</p>';
  const labels={total:'Lead tersimpan',today:'Masuk hari ini',sixHours:'Terbit ≤6 jam',new:'Belum ditindaklanjuti',
    commented:'Dikomentari',negotiating:'Negosiasi',deal:'Deal',irrelevant:'Ditolak'};
  $('lead-summary').innerHTML=Object.entries(labels).map(([key,label])=>'<div><strong>'+state.stats[key]+'</strong><span>'+label+'</span></div>').join('');
  const query=$('lead-search').value.toLocaleLowerCase('id'),filter=$('lead-filter').value;
  const leads=state.leads.filter(lead=>(!filter || lead.status===filter) &&
    [lead.text,lead.platform,lead.analysis.category].join(' ').toLocaleLowerCase('id').includes(query));
  $('lead-list').innerHTML=leads.length?leads.map(lead=>{
    const expired=state.now-lead.publishedAt>state.leadSettings.maxAgeHours*3600000;
    return '<article class="lead-entry"><h3>'+escape(lead.analysis.summary)+'</h3><p class="meta">'+escape(lead.platform)+
      ' · '+escape(lead.group)+' · '+escape(when(lead.publishedAt))+' WIB · '+Math.floor((state.now-lead.publishedAt)/60000)+
      ' menit · '+lead.analysis.score+'/100'+(expired?' · Melewati batas usia':'')+'</p><p>'+escape(lead.analysis.reason)+
      '</p><p>'+escape(lead.analysis.category)+' · '+escape(lead.analysis.budget ?? 'Budget belum disebutkan')+'</p>'+
      '<blockquote>'+escape(lead.analysis.comment)+'</blockquote><div class="toolbar"><a href="'+escape(lead.url)+
      '" target="_blank" rel="noopener noreferrer">Buka postingan</a><button data-copy="'+lead.id+'">Salin draf</button>'+
      '<label>Status<select data-lead-id="'+lead.id+'">'+['new','commented','negotiating','deal','skipped','irrelevant'].map(status=>
        '<option '+(lead.status===status?'selected ':'')+'value="'+status+'">'+status+'</option>').join('')+'</select></label></div></article>';
  }).join(''):'<p class="empty">Belum ada lead yang sesuai. Postingan hanya masuk setelah waktu publikasi asli dan analisis kebutuhan lolos.</p>';
}
function renderFlights() {
  const watches=state.watches.filter(w=>w.status!=='deleted');
  $('watch-list').innerHTML=watches.length?watches.map(watch=>{
    const latest=state.offers.filter(offer=>offer.watchId===watch.id && offer.revision===watch.revision &&
      offer.available && watch.dates.includes(offer.date));
    const historical=state.snapshots.filter(row=>row.watchId===watch.id);
    const minimum=latest.length?money(Math.min(...latest.map(row=>row.total))):'Belum tersedia';
    const lowest=historical.length?money(Math.min(...historical.map(row=>row.total))):'Belum tersedia';
    return '<article class="watch-row"><h3>'+escape(watch.route.from)+' → '+
    escape(watch.route.to)+'</h3><p>'+escape(watch.status)+' · '+(watch.mode==='rolling'?'Rolling '+watch.windowDays+' hari':escape(watch.mode))+
    ' · '+watch.passengers+' penumpang · '+watch.cabin+'</p><p class="hint">Diperiksa '+when(watch.lastAt)+' · Berikutnya '+
    (watch.status==='active'?when(watch.nextAt):'menunggu dilanjutkan')+' WIB</p><p>Termurah saat ini '+minimum+
    ' · Terendah dalam histori tersimpan '+lowest+'</p><div class="toolbar"><button data-edit-watch="'+watch.id+'">Edit</button>'+
    ['check','pause','resume','stop','delete'].map(control=>'<button data-watch="'+watch.id+'" data-control="'+control+'">'+
      ({check:'Cek sekarang',pause:'Jeda',resume:'Lanjut',stop:'Stop',delete:'Hapus dari daftar'}[control])+'</button>').join('')+'</div></article>';
  }).join(''):
      '<p class="empty">Belum ada monitoring. Rute SUB → BTH tersedia di formulir, tanggal keberangkatan dapat dikosongkan untuk rolling 30 hari.</p>';
  const selection=$('history-watch').value;
  $('history-watch').innerHTML=watches.map(watch=>'<option value="'+watch.id+'">'+watch.route.from+' → '+watch.route.to+' · '+watch.id.slice(0,8)+'</option>').join('');
  if (watches.some(w=>w.id===selection)) $('history-watch').value=selection;
  renderHistory();
}
function renderHistory() {
  const id=$('history-watch').value,watch=state.watches.find(w=>w.id===id);
  if (!watch) {for(const key of ['price-calendar','price-chart','price-history','flight-offers']) $(key).replaceChildren();return;}
  const offers=state.offers.filter(offer=>offer.watchId===id && offer.revision===watch.revision &&
    offer.available && watch.dates.includes(offer.date));
  const history=state.changes.filter(change=>change.watchId===id).slice(-100).reverse();
  $('price-calendar').innerHTML=watch.dates.map(date=>{
    const values=offers.filter(offer=>offer.date===date).map(offer=>offer.total);
    return '<div><span>'+date+'</span><strong>'+(values.length?money(Math.min(...values)):'—')+'</strong></div>';
  }).join('');
  $('price-history').innerHTML=history.length?history.map(change=>'<tr><td>'+change.offer.date+'</td><td>'+escape(change.offer.provider)+
    ' / '+escape(change.offer.flight)+'</td><td>'+(change.type==='price'?money(change.previous)+' → '+money(change.total):
      change.type==='discovered'?'Penawaran baru':change.type==='daily-minimum'?'Harga terendah tanggal berubah':
        change.type==='route-minimum'?'Harga terendah rute berubah':'Tidak tersedia dalam respons lengkap')+'</td><td>'+escape(change.offer.baggage)+
    '</td><td>'+when(change.at)+'</td></tr>').join(''):'<tr><td colspan="5">Belum ada riwayat harga terverifikasi.</td></tr>';
  $('flight-offers').innerHTML=offers.length?offers.map(offer=>'<tr><td>'+offer.date+'</td><td>'+escape(offer.provider)+'</td><td>'+
    escape(offer.flight)+' / '+escape(offer.cabin)+'<br>'+escape(offer.fare)+'<br>'+escape(offer.departure)+'</td><td>'+money(offer.total)+'</td><td>'+escape(offer.baggage)+
    '</td></tr>').join(''):'<tr><td colspan="5">Belum ada penawaran aktual untuk monitoring ini.</td></tr>';
  const series=state.snapshots.filter(row=>row.watchId===id),keys=[...new Set(series.map(row=>row.key))];
  const selected=$('history-fare').value;
  $('history-fare').innerHTML=keys.map(key=>{
    const row=series.find(offer=>offer.key===key);
    return '<option value="'+key+'">'+escape(row.date+' · '+row.provider+' · '+row.flight+' · '+row.fare+' · '+row.baggage)+'</option>';
  }).join('');
  if (keys.includes(selected)) $('history-fare').value=selected;
  const points=series.filter(row=>row.key===$('history-fare').value).slice(-40),maximum=Math.max(1,...points.map(row=>row.total));
  $('price-chart').innerHTML=points.length?points.map(row=>'<span style="height:'+Math.round(100*row.total/maximum)+
    '%" title="'+escape(row.date+' · '+row.provider+' · '+money(row.total)+' · '+when(row.observedAt))+'"></span>').join(''):'<p class="empty">Grafik tersedia setelah ada observasi.</p>';
}
async function refresh() {
  state=await api();
  fill($('lead-settings'),state.leadSettings);fill($('service-profile'),state.leadSettings.profile);
  renderLeads();renderFlights();
  const sources=[...state.capabilities.leads,...state.capabilities.flights];
  $('provider-health').innerHTML=sources.map(source=>{
    const observed=state.sources[source.id];
    return '<tr><td>'+escape(source.id)+'</td><td>'+escape(source.mode)+(source.rolling===false?' · rolling belum didukung':'')+
      '</td><td>'+escape(observed?.state ?? (source.configured?'Belum diuji':'Belum terhubung'))+'</td><td>'+escape(observed?.error || source.reason)+
      (observed?.lastAt?'<br>'+when(observed.lastAt):'')+'</td></tr>';
  }).join('');
  $('scheduler-state').textContent='Tick cloud terakhir '+when(state.lastSchedulerAt)+'. Lead Hunter '+
    (state.leadSettings.enabled?'aktif':'dihentikan')+'. Pencarian berikutnya '+when(state.leadSettings.nextAt)+' WIB.';
  $('scan-log').innerHTML=state.logs.slice(-80).reverse().map(row=>'<tr><td>'+when(row.at)+'</td><td>'+escape(row.module)+
    '</td><td>'+escape(row.operation)+'</td><td>'+escape(row.detail?.error ?? row.detail?.source ?? row.detail?.id ?? 'Tercatat')+'</td></tr>').join('');
  notify('Data diperbarui '+when(state.now)+' WIB.');
}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
  activeTab=button.dataset.tab;
  $('leads-view').hidden=activeTab!=='leads';$('flights-view').hidden=activeTab!=='flights';
  $('page-title').textContent=activeTab==='leads'?'Lead Hunter':'Flight Price Tracker';
  document.querySelectorAll('[data-tab]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));
}));
$('refresh').onclick=()=>refresh().catch(error=>notify(error.message,true));
$('lead-search').oninput=renderLeads;$('lead-filter').onchange=renderLeads;$('history-watch').onchange=renderHistory;
$('history-fare').onchange=renderHistory;
$('lead-settings').onsubmit=event=>{
  event.preventDefault();const input=values(event.currentTarget);
  void act({action:'lead-config',keywords:input.keywords.split('\n').map(word=>word.trim()).filter(Boolean),
    maxAgeHours:Number(input.maxAgeHours),minScore:Number(input.minScore),intervalMinutes:Number(input.intervalMinutes)});
};
$('service-profile').onsubmit=event=>{
  event.preventDefault();const profile=values(event.currentTarget);profile.services=profile.services.split(',').map(value=>value.trim()).filter(Boolean);
  void act({action:'lead-config',profile});
};
$('lead-input').onsubmit=event=>{
  event.preventDefault();const input=values(event.currentTarget);
  const publishedAt=Date.parse(input.published+':00+07:00');
  void act({action:'lead-candidate',candidate:{...input,publishedAt,dateEvidence:'owner_verified'}},
    'Post tersimpan untuk analisis Gemini. Aktifkan Lead Hunter agar tick cloud memproses antrean.');
};
$('watch-settings').onsubmit=event=>{
  event.preventDefault();const input=values(event.currentTarget),id=input.id;
  const config={...input,route:{from:input.from.toUpperCase(),to:input.to.toUpperCase()},
    windowDays:Number(input.windowDays),passengers:Number(input.passengers),intervalMinutes:Number(input.intervalMinutes),
    providers:input.providers.split(','),airlines:input.airlines.split(',').map(value=>value.trim().toUpperCase()).filter(Boolean),
    nonstop:input.nonstop==='true',threshold:Number(input.threshold),budget:input.budget?Number(input.budget):null};
  void act({action:'watch-save',...(id?{id}:{}),config});
};
$('watch-reset').onclick=()=>{$('watch-settings').reset();$('watch-settings').elements.id.value='';$('watch-form-title').textContent='Tambah monitoring';};
$('stop-all').onclick=()=>act({action:'watch-control',id:'all',control:'stop'});
async function connect(path,body) {
  if (busy) return;
  busy=true;
  notify('Memeriksa koneksi cloud…');
  try {
    const response=await fetch('/api/automation/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Konfigurasi belum berhasil.');
    await refresh();
    notify(path==='scheduler'?'Scheduler cloud telah terhubung.':'Callback Jihan telah terhubung.');
  } catch (error) { notify(error.message,true); }
  finally {busy=false;}
}
$('scheduler-connect').onclick=()=>connect('scheduler',{activate:true});
$('callback-connect').onclick=()=>connect('callback-setup',{});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if (!button || !state) return;
  if (button.dataset.leadEnabled) void act({action:'lead-config',enabled:button.dataset.leadEnabled==='true'});
  if (button.dataset.watch) void act({action:'watch-control',id:button.dataset.watch,control:button.dataset.control});
  if (button.dataset.editWatch) {
    const watch=state.watches.find(w=>w.id===button.dataset.editWatch);
    fill($('watch-settings'),{...watch,from:watch.route.from,to:watch.route.to});
    $('watch-settings').elements.id.value=watch.id;$('watch-form-title').textContent='Edit monitoring';
    $('watch-settings').scrollIntoView({behavior:'smooth',block:'start'});
  }
  if (button.dataset.copy) {
    const lead=state.leads.find(lead=>lead.id===button.dataset.copy);
    navigator.clipboard.writeText(lead.analysis.comment).then(()=>notify('Draf disalin.')).catch(()=>notify('Clipboard belum tersedia. Pilih teks draf dan salin manual.',true));
  }
});
document.addEventListener('change',event=>{
  const field=event.target;
  if (field.dataset.leadId) void act({action:'lead-status',id:field.dataset.leadId,status:field.value});
});
void refresh().catch(error=>notify(error.message,true));
