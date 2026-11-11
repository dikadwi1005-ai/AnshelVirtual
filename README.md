# Anshel Virtual Tech

Kantor virtual 3D privat milik **Dika**. Antarmuka berbahasa Indonesia dan jadwal menggunakan WIB.

## Database cloud dan Vercel

Proyek Supabase `ruskorcdlkylqfqevmrm` mempunyai skema privat `anshel`:

- `anshel.setting` menyimpan jadwal dan pengaturan.
- `anshel.tasks` menyimpan antrean, sewa eksekusi, SHA-256, dan isi artefak teks.
- `anshel.audit` menyimpan riwayat kejadian.
- `anshel.sessions` serta `anshel.login_limits` mengamankan login cloud.

Skema tidak diekspos ke API publik Supabase. Backend Vercel mengaksesnya lewat koneksi PostgreSQL server-side, dengan transaksi untuk antrean dan idempotensi. File SQLite lokal tetap tersedia sebagai salinan sumber, tidak dihapus.

### Pengaturan Vercel

Di Vercel → proyek Anshel → Settings → Environment Variables, isi:

| Nama | Isi |
| --- | --- |
| `DATABASE_URL` | Connection string **Transaction pooler** dari Supabase → Connect, port `6543` |
| `OWNER_PASSWORD` | Kata sandi pemilik yang panjang dan acak, minimal 24 karakter |
| `WORKER_TOKEN` | Rahasia acak terpisah untuk worker, minimal 24 karakter |
| `N8N_TOKEN` | Rahasia acak lain untuk n8n Cloud, jika integrasi digunakan |
| `TELEGRAM_USER_ID` dan `TELEGRAM_CHAT_ID` | Opsional, ID privat Telegram saat integrasi aktif |

Pilih lingkungan **Production**. Jangan taruh connection string, password atau token pada GitHub, `.env.example`, atau kode JavaScript browser. Pada Vercel, gunakan Node.js 24.x dan deploy ulang setelah menyimpan variabel. `vercel.json` membangun aset Three.js/font dan meneruskan `/api/*` ke Web API cloud.

Uji `https://anshel-virtual.vercel.app/api/session`. Jika backend sudah terhubung dan belum login, responsnya JSON `{"authenticated":false}`, bukan halaman `404`. Kemudian masuk lewat halaman kantor, buat tugas, dan periksa antreannya. Tanpa workflow AI cloud yang sudah aktif, tugas akan tetap mengantre; migrasi database sendiri belum menjalankan AI.

### Pindahkan data SQLite yang sudah ada

Ini **satu kali saja** pada perangkat yang menyimpan `data/office.sqlite`. Jangan menjalankan worker atau server lokal saat membuat cadangan. Jalankan `npm.cmd run backup` terlebih dahulu, lalu gunakan salinan database konsisten yang dihasilkan atau file SQLite sumber ketika prosesnya sudah berhenti.

Atur `DATABASE_URL` sebagai environment variable hanya pada terminal lokal saat migrasi (jangan commit ke repositori), kemudian:

```powershell
npm.cmd ci
npm.cmd run migrate:sqlite -- "D:\Web Project\VirtualOffice\anshel-virtual-tech\data\office.sqlite"
```

Importer menolak sumber yang tidak ada, memeriksa checksum artefak, menolak target yang sudah berisi data, lalu memindahkan isi ketiga tabel dalam **satu transaksi**. Bila terjadi kesalahan, transaksi dibatalkan. Setelah sukses, hapus variabel `DATABASE_URL` dari terminal. Jika SQLite ternyata tidak mempunyai tugas, tidak ada pekerjaan yang perlu dipindahkan.

## Jalankan lokal

Gunakan Node.js 24.12 atau yang lebih baru dan browser dengan WebGL 2. Di PowerShell, jalankan dari direktori proyek:

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd start
```

Buka http://127.0.0.1:4310 dan masuk dengan nilai `OWNER_PASSWORD` dari `.env`. Perintah setup membuat rahasia lokal apabila file belum tersedia. Jalankan worker di terminal kedua dari direktori yang sama:

```powershell
npm.cmd run worker
```

Buat **Tugas baru → Diagnostik worker lokal** untuk menguji alur dari antrean sampai hasil. Bila di luar jam kerja, centang **Boleh dijalankan di luar jam kerja**. Hasil memuat versi Node.js, data lingkungan worker, dan hasil pemeriksaan SQLite dalam memori. Panel Tugas menyediakan unduhan artefak dan SHA-256. Panel Aktivitas menyimpan jejak perubahan dan eksekusi.

## Kantor dan tugas

- Satu lantai dengan bentang 48,8 × 43 meter, 12 area divisi, dan 9 area bersama. Jalur dari resepsionis bertemu di Atrium Kolaborasi. Area kerja terbuka berbagi lantai dengan pod kaca dan ruang tertutup. Satu unit dunia sama dengan satu meter. `public/layout.js` mendefinisikan tapak dan denah, sedangkan `public/furnishings.js` menyimpan ukuran furnitur, partisi, dan titik interaksi.
- Tekan label atau pilih **Ruang** untuk memusatkan kamera pada departemen. Klik karyawan untuk melihat detail atau mengikuti pergerakannya. Geser untuk mengorbit, gunakan tombol kanan untuk menggeser kamera, dan gulir untuk zoom. Pada layar sentuh, gunakan satu jari untuk orbit dan dua jari untuk geser atau zoom. Tombol **Lihat seluruh kantor** mengembalikan kamera ke denah lengkap.
- Ikon bulan/matahari mengganti pencahayaan. Mode **Otomatis · WIB** mengikuti siang dari 06.00 hingga sebelum 18.00. Pilih **Ringan** untuk menonaktifkan bayangan arah matahari sambil mempertahankan bayangan kontak. Tombol **Layar penuh** memakai Fullscreen API. Browser yang mendukung pemasangan aplikasi dapat menggunakan manifest dengan tampilan standalone.
- Tugas antrean mengarahkan karyawan ke meja. Panel menampilkan **Menunggu worker** saat worker atau kapabilitas terkait belum tersedia. Animasi kerja diputar setelah karakter duduk dan backend mengonfirmasi eksekusi. Log penyelesaian memicu reaksi, lalu karyawan kembali ke rutinitasnya.
- Klik permukaan monitor, laptop, atau TV, atau buka **Ruang → Periksa layar**. Layar 3D menampilkan status dan animasi sesuai divisi. Panel tugas memuat waktu eksekusi WIB, progres yang dilaporkan worker, log terbaru, cuplikan hasil dan tautan unduh jika tersedia.
- Dekatkan kamera untuk melihat percakapan atau monolog singkat saat pegawai menjalani rutinitas. Satu bubble tampil pada satu waktu.
- Buka **Ruang → Lounge PS5 → Periksa layar → Fokus TV** untuk melihat Anshel Circuit. Layar memutar demo sambil menunggu pemain dan menampilkan hingga dua pegawai yang bermain.

## Dialog dengan Groq

Tambahkan `GROQ_API_KEY` ke `.env` di folder proyek dan jalankan ulang server dengan `npm.cmd start`. Saat kamera mendekati pegawai, server dapat meminta variasi percakapan dan monolog dari `openai/gpt-oss-20b` di Groq. Topiknya termasuk hobi, makanan, musik, dan gosip ringan fiktif. Server mengirim nama karakter, gaya bicara, topik, dan lokasi atau rutinitas. Dialog bawaan tetap tersedia saat kunci kosong atau Groq gagal merespons. **Pengaturan → Dialog** menunjukkan status Groq.

Setiap proses server memberi jeda minimal delapan detik dan batas 120 permintaan per 24 jam untuk fitur ini. Satu permintaan menghasilkan satu putaran dialog grup atau satu monolog. [Dokumentasi Groq](https://console.groq.com/docs/structured-outputs).
- Rute A* memakai grid dengan radius karakter 0,29 meter, pintu 1,75 meter, dan pengecekan segmen terhadap penghalang. Titik interaksi dipesan oleh satu karyawan. Duduk dan berdiri memakai lintasan pendek dari titik pendekatan ke kursi. Posisi setelah memuat ulang dibangun dari rencana terkini.
- Pengaturan WIB mencakup jam kerja, libur, jeda, buka, tutup, dan lembur. Jeda menghentikan animasi dan pengambilan tugas baru. Tugas yang sedang berjalan dapat dijeda atau dibatalkan secara terpisah.
- Tugas, jadwal, log, dan hasil tersimpan di `data/office.sqlite`. Worker melakukan polling dengan token terpisah dan sewa eksekusi. Sewa yang habis memindahkan tugas ke status terhambat. Tugas tersebut dapat diantrekan ulang dari panel.
- Kolom Proyek pada tugas mengisi ringkasan pada tab Proyek. Pekerjaan terkait Nation City AI dapat dicatat di sini. Adaptor repositori dan akses lintas proyek masih perlu diimplementasikan.

## AI lokal dan otomasi

Untuk draf AI, jalankan Ollama lokal, pasang model sesuai kapasitas perangkat, lalu isi `OLLAMA_MODEL` dengan nama model yang sudah dipasang dan mulai ulang worker. `OLLAMA_URL` secara default menunjuk ke http://127.0.0.1:11434. Worker menyimpan keluaran model sebagai draf teks. Kontrak memakai [endpoint Generate Ollama](https://docs.ollama.com/api/generate).

Dua workflow n8n yang dapat diimpor dan kontrak Telegram ada di [panduan integrasi](workflows/README.md). Aktivasi memerlukan kredensial bot, ID privat Dika, dan jalur HTTPS yang diotorisasi untuk dua endpoint integrasi. Server web hanya mendengarkan pada loopback.

## Pengujian dan cadangan

```powershell
npm.cmd test
npm.cmd run backup
```

Tes integrasi membuka koneksi loopback sementara. Cadangan memakai snapshot SQLite konsisten dan menjalankan `PRAGMA integrity_check`. File cadangan berada di `data/backups`. Untuk pemulihan, hentikan server dan worker, pindahkan database lama beserta file WAL/SHM jika tersedia ke direktori cadangan, lalu salin snapshot terverifikasi menjadi `data/office.sqlite`.

[Manifest aset](ASSETS.json) mencatat pembuat, sumber, lisensi, lokasi, format, dan checksum. Model Kenney dan rak server Innerscene berlisensi CC0 tersimpan lokal. Three.js, DM Sans, dan Space Grotesk dipasang lewat npm.

## Cakupan versi ini

[Audit dan roadmap Phase 0–7](docs/roadmap.md) memuat baseline, kriteria penerimaan, rencana migrasi cloud, dan status checkpoint.

Eksekusi yang tersedia ialah diagnostik lokal dan draf melalui kontrak Ollama. Pengujian model Ollama yang terpasang serta pengujian workflow pada akun n8n Cloud dan Telegram masih diperlukan. Interaksi permainan memakai arkade dan area TV. Prop genggam, animasi wajah, pekerjaan spesialis dengan alat eksternal, notifikasi Telegram per tugas, dan memori sosial persisten masih menjadi pekerjaan lanjutan.
