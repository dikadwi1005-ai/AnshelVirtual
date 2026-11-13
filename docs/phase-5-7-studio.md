# Checkpoint Phase 5–7 · Studio kantor

## Alur lokal

- Buka layar 3D atau **Ruang → Periksa layar**. Workstation menampilkan antrean, pekerjaan aktif, pegawai, proyek dan hasil dari snapshot backend. **Kecilkan layar** mengembalikan kamera, termasuk kamera Dika. Unduhan artefak memakai rute privat yang sudah ada.
- **Studio → Tata letak** mendukung pemilihan langsung dan melalui daftar, pratinjau, kisi 0,25 m, rotasi 15°, undo/redo, simpan, muat, dan reset. Pilihan terbatas pada perabot bebas. Meja, perangkat di atas meja, dan penopang animasi tetap pada posisi yang dirancang. Editor memeriksa batas ruangan, penghalang, pendekatan ke titik aktivitas, akses dari atrium, dan jalur yang sedang digunakan. Tata letak tersimpan di browser dan dimuat atas permintaan.
- **Studio → Rapat** memakai dua kursi yang sudah memiliki jalur dan animasi duduk. Kehadiran dihitung dari posisi simulasi. Pegawai dengan penguncian tugas tetap menangani tugas itu. Agenda muncul pada dialog dan TV. Panel menghubungkan artefak yang tersedia, notulen, keputusan, riwayat sesi, dan dialog konfirmasi tugas. Rapat berjalan pada simulasi browser yang membukanya.
- **Studio → Riwayat** membedakan perubahan aktivitas avatar dari audit kerja backend. **Replay** menyimpan sampai 900 frame dengan interval target 400 ms dalam memori tab. Replay membaca pose, animasi, dialog dan agenda yang terekam. Saat replay, studio menghentikan simulasi dan partisipasi sinkronisasi browser tersebut. Perubahan layout dan rapat lokal juga memakai simulasi terpisah sampai kembali ke kantor bersama.
- Ekspor merender ulang kantor ke WebM 960 × 540 atau 540 × 960. Pilih potongan 0,5–90 detik, kamera, teks, subtitle, dan jika diperlukan berkas narasi lokal. MP4 bergantung pada dukungan MediaRecorder browser. Video dipratinjau dan diunduh dari browser, tanpa unggahan atau publikasi. Replay sesi hilang saat halaman dimuat ulang.
- **Storyboard** mencocokkan instruksi Bahasa Indonesia dengan kejadian, rapat atau hasil kerja yang tersedia. Draf AI opsional membuka dialog antrean yang harus disetujui pemilik dan bergantung pada kemampuan worker yang dilaporkan.
- **Jadwal** menampilkan pengingat tugas/laporan WIB, status worker, serta reservasi yang tersedia dalam audit. Pengingat disimpan selama sesi tab dan perlu ditinjau manual. Kalender dan hari libur tetap di Pengaturan. Pengaturan jadwal Gemini yang telah tersedia memakai kuota tiga klaim per hari WIB, idempotensi klaim, timeout dan retry yang sudah ada. Pengingat Studio tidak menjalankan pekerjaan saat browser tutup.

## Kontrak baca Nation City

Studio menerima file JSON maksimal 64 KB. Integrasi belum membutuhkan endpoint. Versi 1 menerima `status` bernilai `online`, `degraded` atau `offline`, tanggal ISO, serta maksimal 100 event dengan ID unik. Tipe event yang didukung ialah `city.status`, `city.milestone` dan `city.service`. Label ditampilkan sebagai teks dan field tambahan dibuang.

```json
{
  "version": 1,
  "status": "offline",
  "updatedAt": "2026-11-13T03:00:00Z",
  "events": [{
    "id": "network-01",
    "type": "city.service",
    "at": "2026-11-13T03:00:00Z",
    "label": "Pemeliharaan jaringan"
  }]
}
```

## Verifikasi dan rilis

- Build lokal lulus. Suite regresi lulus 175/175. Cakupan termasuk sesi dan origin, akses artefak, token worker, duplikasi klaim, kuota WIB, kegagalan provider, alur tujuh bot, dan navigasi aktivitas.
- Chrome lokal menguji akses privat, dashboard dan fokus monitor dari menu ruang di desktop dan mode Dika sentuh, kehadiran dua pegawai, agenda TV, konfirmasi tindak lanjut, editor, riwayat untuk storyboard, ekspor WebM landscape/portrait yang dapat diputar, pengingat dan fixture Nation City offline. Label fixture yang menyerupai HTML ditampilkan sebagai teks. Klip landscape contoh berisi sekitar 377 KB.
- Pada pengukuran singkat 60 interval `requestAnimationFrame` di Chrome lokal, kantor live, rapat, replay dan viewport sentuh 390 × 844 mencatat median 11,1 ms dan p95 11,2 ms. Heap JavaScript yang dilaporkan berada di kisaran 29–39 MiB. Angka tersebut belum mencakup GPU memory, browser fisik, MP4, narasi dengan perangkat nyata, atau soak test.
- Jalankan `npm.cmd run build` lalu `npm.cmd test`. Untuk uji browser, jalankan `node scripts/check-office-studio.mjs` dengan Playwright tersedia. `ANSHEL_PLAYWRIGHT_MODULE` dan `ANSHEL_CHROME_PATH` dapat menunjuk instalasi yang sudah ada. `ANSHEL_SCREENSHOTS` menunjuk folder output opsional. Skrip memakai SQLite dalam memori dan server loopback.
- Periksa perubahan kredensial, alur n8n dan migrasi sebelum rilis. Rollback kode menggunakan revert commit Studio melalui proses Git normal. Data yang dihasilkan Studio terpisah dari Production. Jika tata letak lokal bermasalah, **Studio → Tata letak → Reset** mengembalikan denah asli.
- **Pending External Verification** untuk tampilan akhir oleh Dika, sentuhan dan pemasangan Safari pada iPhone, rekonsiliasi data lokal/cloud oleh pemilik, smoke test tujuh bot Telegram dan n8n/Gemini dengan satu tugas nonrahasia, sumber Nation City live, audio/TTS Indonesia fisik, dan stabilitas jangka panjang. Verifikasi tersebut membutuhkan perangkat atau layanan yang sesuai.
