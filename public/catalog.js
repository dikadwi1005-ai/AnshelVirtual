export const company = 'Anshel Virtual Tech';
export const owner = 'Dika';
export const timezone = 'Asia/Jakarta';

export const divisions = [
  ['management','Manajemen','Alya','Manajer AI','Koordinasi dan prioritas','Terstruktur','talk'],
  ['operations','IT & Operasional','Bima','Analis Operasional','Pemantauan sistem','Praktis','game'],
  ['administration','Administrasi','Citra','Administrator','Catatan dan jadwal','Teliti','coffee'],
  ['hr','SDM','Dara','Koordinator SDM','Profil dan jadwal staf','Sosial','talk'],
  ['development','Pengembangan','Eka','Pengembang','Rekayasa perangkat lunak','Penasaran','game'],
  ['creative','Kreatif & Desain','Fara','Desainer','Desain produk dan visual','Imajinatif','rest'],
  ['video','Produksi Video','Galih','Produser Video','Storyboard dan penyuntingan','Ekspresif','game'],
  ['social','Media Sosial','Hana','Strategis Konten','Kalender dan draf konten','Sosial','talk'],
  ['research','Riset & Intelijen','Indra','Peneliti','Analisis dan verifikasi sumber','Analitis','rest'],
  ['marketing','SEO & Pemasaran','Jihan','Analis SEO','Strategi dan audit pencarian','Eksploratif','coffee'],
  ['qa','Jaminan Mutu','Kirana','Analis QA','Validasi dan pengujian','Cermat','rest'],
  ['finance','Keuangan','Laras','Analis Keuangan','Anggaran dan pemakaian sumber daya','Sistematis','coffee'],
].map(([id,name,employee,role,specialty,personality,hobby], index) => ({
  id,name,employee,role,specialty,personality,hobby,index,
}));

export const activities = {
  'meet-dika':'Menemui Dika',
  desk:'Di meja kerja', coffee:'Mengambil kopi', game:'Bermain PS5',
  rest:'Bersantai', talk:'Bersosialisasi', work:'Mengerjakan tugas', idle:'Menunggu',
  meeting:'Duduk di ruang rapat', visit:'Mengunjungi divisi lain', read:'Membaca di ruang santai',
  tv:'Menonton TV', stroll:'Jalan-jalan di teras', nap:'Beristirahat di meja', celebrate:'Merayakan hasil',
  outdoor:'Duduk di taman depan', commute:'Melalui gerbang kantor',
};
