# Phase 8 · Kampus Anshel dan kesiapan produksi

## Lingkungan dan Living Office

**Implemented, Tested, Visually Verified.** Tapak kantor sekarang berada di lahan berpagar dengan dua bukaan gerbang, akses pejalan kaki, driveway, drop-off, marka parkir, trotoar, jalur samping, vegetasi, bangku dan lampu. Pagar dan perabot luar menggunakan geometri berulang dalam instancing. Kamera Dika mempertimbangkan penghalang outdoor. Perjalanan melalui gerbang mengikuti fase kantor. Dua pegawai dapat menggunakan bangku saat makan siang. Tugas aktif tetap diprioritaskan. Kendaraan dan kurir sebagai aktor dinamis belum diimplementasikan.

## Rapat, riwayat dan media

- **Rapat — Implemented dan Tested.** Empat kursi memakai jalur dan animasi duduk yang sama dengan Living Office. Agenda, notulen, keputusan, peserta, dan kehadiran tersimpan di tabel pengaturan privat yang sudah ada. Revisi mencegah tab lama menimpa perubahan baru. Catatan yang sudah disimpan dapat dibuka setelah reload. Simulasi rapat mengikuti pemimpin presence, sementara data rapat disinkronkan lewat API pemilik.
- **Replay — Implemented dan Tested.** IndexedDB menyimpan klip sekitar 30 detik, maksimum 180 klip atau tujuh hari per browser. Studio menyediakan pemilihan tanggal/waktu dan penghapusan arsip. Data arsip hanya memuat pose, animasi, teks dialog/agenda dan metadata aktivitas. Replay tidak memicu worker. Arsip tersedia pada browser yang merekamnya.
- **Video — Implemented.** WebM dan MP4 memakai encoder browser, dengan penanganan ketika codec tidak tersedia. Narasi Bahasa Indonesia dan audio latar dapat diimpor lalu dicampur secara lokal. Editor mengekspor satu rentang per klip. Narasi sintetis dan penggabungan banyak klip belum diimplementasikan.
- **Storyboard — Implemented.** Ringkasan dapat memakai rapat tercatat, aktivitas minggu ini dan cuplikan artefak privat. Draf eksternal tetap melalui formulir tugas dengan konfirmasi Dika.

## Scheduler dan Nation City

**Scheduler — Tested lokal, Pending External Verification.** Jadwal server disimpan dalam pengaturan privat, mulai nonaktif, dan memerlukan tindakan pemilik untuk diaktifkan. Tick mematuhi jadwal kantor dan libur nasional yang dikenal, memproses maksimal tiga jadwal per panggilan, dan menyimpan status, percobaan, serta hasil. Sewa dan kunci idempotensi mencegah tugas duplikat. Laporan adalah snapshot hitungan nyata, sedangkan tugas otomatis menggunakan jenis diagnostik. Tidak ada Gemini berbayar dari alur Studio. Kegagalan dan kondisi worker dapat dilihat melalui dashboard. Notifikasi Telegram khusus scheduler Studio belum ditambahkan.

Workflow sumber [Studio Scheduler](../workflows/office_studio_schedule.json) bersifat nonaktif. Setelah disetujui, impor sebagai workflow terpisah, pilih kredensial Header Auth untuk token n8n yang sudah berlaku, gunakan deployment yang dituju dan setujui flag server `STUDIO_SCHEDULER_ENABLED`. Jalankan tick uji dengan laporan tanpa biaya, periksa satu hasil, uji ulang idempotensi, lalu publikasikan workflow baru. Trigger Telegram yang sudah berjalan tidak diperlukan oleh workflow ini.

**Nation City — Tested dengan fixture, Pending External Verification.** Adapter hanya mengambil GET HTTPS memakai URL dan token opsional dari server. Flag `NATION_CITY_ENABLED` default nonaktif. Respons dibatasi 64 KB dan empat detik, redirect ditolak, hasil yang sah dicache 30 detik, dan data lama dapat dipakai maksimal lima menit saat offline. Endpoint Nation City yang berizin dapat menyajikan [kontrak JSON versi 1](phase-5-7-studio.md#kontrak-baca-nation-city). Endpoint nyata dan token baca belum tersedia untuk verifikasi. Impor JSON tetap tersedia.

## Data cloud dan AI

**Cloud Verified, baca-saja.** Pada 14 November 2026, Production berisi 13 pengaturan, 12 tugas, 66 event audit dan 8 artefak selesai. Seluruh SHA-256 artefak cocok. Skema dan pembacaan tugas ditolak untuk role `anon` dan `authenticated`. SQLite lokal berisi 2 pengaturan, 0 tugas dan 4 event audit. Production merupakan sumber yang lebih lengkap untuk tugas. Tinjau konflik pengaturan dan audit berdasarkan ID, timestamp, dan field sebelum rekonsiliasi. Importer sekarang memulai dalam mode preview baca-saja. `--apply` mempertahankan syarat target kosong. [Panduan pemulihan](cloud-recovery.md) · [Dokumentasi backup Supabase](https://supabase.com/docs/guides/platform/backups)

Audit Production menunjukkan 11 kejadian antre, 9 mulai, 8 selesai, 2 terhambat dan 4 reservasi terjadwal. Bukti ini menunjukkan eksekusi tersimpan. Untuk mengesahkan alur live dari Telegram hingga review/notifikasi, gunakan satu tugas tanpa data rahasia dengan Dika dan cek ID tugas, jejak worker, SHA-256, keputusan review, serta pesan dari bot yang benar. Workflow Published, secret, dan data Production tidak diubah.

## Keamanan dan rollback

- Endpoint Studio memerlukan sesi pemilik. Rute tick memakai bearer n8n dan flag khusus. Pengujian mencakup penolakan akses tanpa sesi, origin asing, dan tick ketika flag mati.
- Token Nation City tetap server-side. Teks agenda, notulen, label impor dan kutipan artefak diperlakukan sebagai data. Pembuatan draf dari kutipan tetap memerlukan konfirmasi.
- Tidak ada skema baru atau migrasi wajib. Rollback aplikasi dengan revert commit Phase 8 melalui Git biasa. Jadwal dapat dinonaktifkan dari panel dan workflow terpisah dapat dihentikan. Kunci Studio di tabel pengaturan tidak diperlukan oleh versi sebelumnya. Untuk pemulihan data, gunakan target PostgreSQL terisolasi dari panduan pemulihan.

## Verifikasi akhir

- Build dan 180/180 tes lulus. Chrome desktop dan viewport sentuh memeriksa kampus siang/malam, fokus monitor, empat peserta duduk, reload rapat dengan notulen tersimpan, arsip replay, layout, WebM landscape/portrait dan kontainer MP4 dengan header `ftyp`. Bukti lokal dihasilkan sebagai `phase8-campus-day.png`, `phase8-campus-night.png`, `phase8-meeting.png`, `phase8-mobile.png`, dan `phase8-replay.webm`.
- Pada pengukuran terakhir 60 frame dengan 12 pegawai terlihat, median 11,1 ms (sekitar 90 fps), p95 11,2–22,2 ms, 140–399 draw call, heap JS 28–41 MiB, dan DOM siap 98–140 ms. Ini pengukuran Chrome lokal, termasuk viewport sentuh, tanpa pengukuran GPU memory atau soak test. Tes navigasi memeriksa koridor, kursi dan pagar menggunakan radius pegawai.
- SQLite backup dan restore pada file terisolasi memulihkan rapat dan jadwal Studio. Latihan PostgreSQL baru belum dijalankan karena Docker Engine tidak aktif dan Ubuntu lokal tidak memiliki PostgreSQL. Hasil pemulihan dari 12 November tercatat di panduan backup. Pemulihan snapshot terbaru dan penyatuan data perlu verifikasi lanjutan.
- Jalankan `npm.cmd run build`, `npm.cmd test`, dan `node scripts/check-office-studio.mjs`. Skrip browser membutuhkan Playwright dan menggunakan fixture SQLite loopback.
- **Pending External Verification.** Rekonsiliasi Production, smoke test live tujuh bot/Gemini/n8n, sumber Nation City live, penerbitan scheduler, iPhone fisik, dan uji stabilitas jangka panjang.
- Commit rilis dapat diidentifikasi dengan `git log -1 --format=%H -- docs/phase-8-completion.md`. Status hasil push dicatat pada laporan rilis.
