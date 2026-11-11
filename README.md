# Anshel Virtual Tech

Kantor virtual 3D privat milik **Dika**. Antarmuka berbahasa Indonesia dan jadwal menggunakan WIB.

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
