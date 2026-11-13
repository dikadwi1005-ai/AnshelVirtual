/** National calendars as published by the Indonesian government.
 *  Sources:
 *  https://www.setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026
 *  https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027
 *
 *  National public holidays, collective leave, and commemorations are distinct.
 *  Neither national holidays nor collective leave automatically overrides the
 *  virtual office's separately configurable operating schedule.
 */
const holidays2026=[
  ['01-01','Tahun Baru Masehi'],['01-16','Isra Mikraj Nabi Muhammad'],
  ['02-17','Tahun Baru Imlek'],['03-19','Hari Suci Nyepi'],
  ['03-21','Idulfitri'],['03-22','Idulfitri'],['04-03','Wafat Yesus Kristus'],
  ['04-05','Hari Paskah'],['05-01','Hari Buruh Internasional'],
  ['05-14','Kenaikan Yesus Kristus'],['05-27','Iduladha'],
  ['05-31','Hari Raya Waisak'],['06-01','Hari Lahir Pancasila'],
  ['06-16','Tahun Baru Islam'],['08-17','Hari Kemerdekaan Republik Indonesia'],
  ['08-25','Maulid Nabi Muhammad'],['12-25','Hari Natal'],
];
const leave2026=[
  ['02-16','Cuti bersama Imlek'],['03-18','Cuti bersama Nyepi'],
  ['03-20','Cuti bersama Idulfitri'],['03-23','Cuti bersama Idulfitri'],
  ['03-24','Cuti bersama Idulfitri'],['05-15','Cuti bersama Kenaikan Yesus Kristus'],
  ['05-28','Cuti bersama Iduladha'],['12-24','Cuti bersama Natal'],
];
const holidays2027=[
  ['01-01','Tahun Baru Masehi'],['01-05','Isra Mikraj Nabi Muhammad'],
  ['02-06','Tahun Baru Imlek'],['03-08','Hari Suci Nyepi'],
  ['03-10','Idulfitri'],['03-11','Idulfitri'],
  ['03-26','Wafat Yesus Kristus'],['03-28','Hari Paskah'],
  ['05-01','Hari Buruh Internasional'],['05-06','Kenaikan Yesus Kristus'],
  ['05-17','Iduladha'],['05-20','Hari Raya Waisak'],
  ['06-01','Hari Lahir Pancasila'],['06-06','Tahun Baru Islam'],
  ['08-15','Maulid Nabi Muhammad'],['08-17','Hari Kemerdekaan Republik Indonesia'],
  ['12-25','Hari Natal'],['12-26','Isra Mikraj Nabi Muhammad'],
];
const leave2027=[
  ['02-05','Cuti bersama Imlek'],['03-09','Cuti bersama Idulfitri'],
  ['03-12','Cuti bersama Idulfitri'],['03-15','Cuti bersama Idulfitri'],
  ['03-25','Cuti bersama Wafat Yesus Kristus'],
  ['05-18','Cuti bersama Iduladha'],['05-19','Cuti bersama Waisak'],
  ['12-24','Cuti bersama Natal'],
];
const commonCommemorations=[
  ['04-21','Hari Kartini'],['05-02','Hari Pendidikan Nasional'],
  ['10-28','Hari Sumpah Pemuda'],['11-10','Hari Pahlawan'],
  ['12-22','Hari Ibu'],
];
const allEvents=new Map();
for(const [year,holidays,leave] of [[2026,holidays2026,leave2026],[2027,holidays2027,leave2027]]) {
  for(const [suffix,name] of holidays)allEvents.set(year+'-'+suffix,{type:'libur nasional',name});
  for(const [suffix,name] of leave)allEvents.set(year+'-'+suffix,{type:'cuti bersama',name});
  for(const [suffix,name] of commonCommemorations)allEvents.set(year+'-'+suffix,{type:'peringatan',name});
}
const dateFormatter=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',
});
const weekIndex={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
const weekdayLabel=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const oneDay=86_400_000;
export function officeIndonesiaDay(at,offset=0,schedule={}) {
  const time=Number(at instanceof Date?at.getTime():at);
  if(!Number.isFinite(time))return null;
  const parts=Object.fromEntries(dateFormatter.formatToParts(new Date(time+offset*oneDay)).map(p=>[p.type,p.value]));
  const date=[parts.year,parts.month,parts.day].join('-');
  const dow=weekIndex[parts.weekday];
  if(dow===undefined)return null;
  const event=allEvents.get(date)||null;
  const scheduleHolidays=Array.isArray(schedule.holidays)?schedule.holidays:[];
  const scheduleDays=Array.isArray(schedule.days)?schedule.days:[1,2,3,4,5];
  const closedBySchedule=!scheduleDays.includes(dow)||scheduleHolidays.includes(date);
  return {date,day:weekdayLabel[dow],event,
    officeScheduledClosed:closedBySchedule,
    officeClosureReason:!scheduleDays.includes(dow)?'di luar hari kerja':
      scheduleHolidays.includes(date)?'libur khusus di pengaturan kantor':null,
    calendarVerified:parts.year==='2026'||parts.year==='2027'};
}

export function officeIndonesiaCalendarContext(at,schedule={},question='') {
  const today=officeIndonesiaDay(at,0,schedule);
  if(!today)return {timezone:'Asia/Jakarta',available:false};
  const q=String(question||'').slice(0,1500).toLowerCase();
  const wantsTomorrow=/\b(?:besok|esok|tomorrow)\b/.test(q);
  const asksHoliday=/libur|tanggal merah|hari raya|perayaan|peringatan|cuti|natal|imlek|nyepi|idul|lebaran|paskah|waisak|kartini|pahlawan|sumpah pemuda|kemerdekaan|17 agustus|hari ibu|pancasila|tahun baru/.test(q);
  const tomorrow=officeIndonesiaDay(at,1,schedule);
  const upcoming=[];
  if(asksHoliday) {
    for(let offset=0;offset<=90&&upcoming.length<5;offset++) {
      const candidate=officeIndonesiaDay(at,offset,schedule);
      if(candidate?.event && ['libur nasional','cuti bersama'].includes(candidate.event.type))
        upcoming.push({date:candidate.date,day:candidate.day,...candidate.event});
    }
  }
  const matches=[];
  if(asksHoliday) {
    const aliases={
      natal:/natal|christmas/,imlek:/imlek/,nyepi:/nyepi/,
      idulfitri:/idulfitri|idul fitri|lebaran/,iduladha:/iduladha|idul adha/,
      kemerdekaan:/merdeka|17 agustus|kemerdekaan/,
      paskah:/paskah/,pancasila:/pancasila/,kartini:/kartini/,
      pahlawan:/pahlawan/,sumpah:/sumpah pemuda/,ibu:/hari ibu/,
      waisak:/waisak/,
    };
    const searched=Object.entries(aliases).filter(([,pattern])=>pattern.test(q)).map(([key])=>key);
    const nameAliases={natal:/natal/i,imlek:/imlek/i,nyepi:/nyepi/i,
      idulfitri:/idulfitri/i,iduladha:/iduladha/i,
      kemerdekaan:/kemerdekaan/i,paskah:/paskah/i,
      pancasila:/pancasila/i,kartini:/kartini/i,pahlawan:/pahlawan/i,
      sumpah:/sumpah pemuda/i,ibu:/hari ibu/i,waisak:/waisak/i,
    };
    for(const [date,event] of allEvents) {
      if(searched.some(key=>nameAliases[key].test(event.name)))matches.push({date,...event});
    }
  }
  return {timezone:'Asia/Jakarta',today,
    ...(wantsTomorrow?{tomorrow}:{}),
    ...(asksHoliday?{upcomingOfficialHolidays:upcoming,matchingNamedEvents:matches.slice(-12)}:{}),
    disclaimer:'Libur nasional dan cuti bersama tidak otomatis mengubah jadwal kantor virtual. Cuti bersama perusahaan tergantung pengaturan pemilik. Data nasional tersedia untuk 2026-2027; tanggal lain perlu sumber terbaru.'};
}
