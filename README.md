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

- Tiga lantai, 20 ruang, dan 12 divisi dengan model karyawan beranimasi. Kontrol mencakup rotasi, geser kamera dengan tombol kanan, zoom, ikuti karyawan, pemilihan lantai, dan layar penuh.
- Saat worker mulai mengeksekusi tugas, rencana karyawan divisi berubah ke tugas dan karakter bergerak menuju meja. Ketika longgar, pilihan aktivitas mengikuti kepribadian dan fasilitas lantai. Rute menggunakan koridor dan titik tujuan. Posisi saat pemuatan ulang dibangun dari rencana terkini.
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

[Manifest aset](ASSETS.json) mencatat pembuat, sumber, lisensi, lokasi, format, dan checksum. Aset Kenney CC0 tersimpan lokal. Three.js, DM Sans, dan Space Grotesk dipasang lewat npm.

## Cakupan versi ini

Eksekusi yang tersedia ialah diagnostik lokal dan draf melalui kontrak Ollama. Pengujian model Ollama yang terpasang serta pengujian workflow pada akun n8n Cloud dan Telegram masih diperlukan. Pekerjaan spesialis dengan alat eksternal, notifikasi per tugas, memori sosial persisten, navigasi antarlantai oleh karyawan, prop genggam, animasi wajah, dan peninjauan performa pada perangkat target masih menjadi pekerjaan lanjutan.
