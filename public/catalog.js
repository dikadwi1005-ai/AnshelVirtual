export const company = 'Anshel Virtual Tech';
export const owner = 'Dika';
export const timezone = 'Asia/Jakarta';

export const floors = [
  {name:'Operasional', detail:'Manajemen & operasional', color:'#75a798'},
  {name:'Studio', detail:'Produk & konten', color:'#d5aa76'},
  {name:'Strategi', detail:'Riset & pertumbuhan', color:'#8f9ab9'},
];

export const divisions = [
  ['management','Manajemen','Alya','Manajer AI','Koordinasi dan prioritas','Terstruktur','talk'],
  ['operations','IT & Operasional','Bima','Analis Operasional','Pemantauan sistem','Praktis','arcade'],
  ['administration','Administrasi','Citra','Administrator','Catatan dan jadwal','Teliti','coffee'],
  ['hr','SDM','Dara','Koordinator SDM','Profil dan jadwal staf','Sosial','talk'],
  ['development','Pengembangan','Eka','Pengembang','Rekayasa perangkat lunak','Penasaran','arcade'],
  ['creative','Kreatif & Desain','Fara','Desainer','Desain produk dan visual','Imajinatif','rest'],
  ['video','Produksi Video','Galih','Produser Video','Storyboard dan penyuntingan','Ekspresif','arcade'],
  ['social','Media Sosial','Hana','Strategis Konten','Kalender dan draf konten','Sosial','talk'],
  ['research','Riset & Intelijen','Indra','Peneliti','Analisis dan verifikasi sumber','Analitis','rest'],
  ['marketing','SEO & Pemasaran','Jihan','Analis SEO','Strategi dan audit pencarian','Eksploratif','coffee'],
  ['qa','Jaminan Mutu','Kirana','Analis QA','Validasi dan pengujian','Cermat','rest'],
  ['finance','Keuangan','Laras','Analis Keuangan','Anggaran dan pemakaian sumber daya','Sistematis','coffee'],
].map(([id,name,employee,role,specialty,personality,hobby], index) => ({
  id,name,employee,role,specialty,personality,hobby,index,floor:Math.floor(index/4),
}));

export const activities = {
  desk:'Di meja kerja', coffee:'Mengambil kopi', arcade:'Bermain arkade',
  rest:'Bersantai', talk:'Bersosialisasi', work:'Mengerjakan tugas', idle:'Menunggu',
};
