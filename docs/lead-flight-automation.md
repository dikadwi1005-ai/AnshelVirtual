# Lead Hunter & Flight Tracker — 22 November 2026

Status: implementasi tersedia; koneksi sumber eksternal tetap bergantung pada akses yang benar-benar tersedia. Tidak ada lead atau harga fixture pada Production.

## Perilaku

- Jihan: input manual dengan bukti publikasi asli, feed JSON berizin, discovery Brave / Google Alerts, Gemini existing di n8n untuk klasifikasi buyer dan draf berdasarkan profil jasa. Publikasi maksimal 24 jam, konfigurasi lebih ketat diperbolehkan, skor default 75, deduplikasi URL dan isi, status tindak lanjut, inline keyboard. Tidak melakukan auto-comment/DM.
- Alya: rute default SUB–BTH, rolling 30 hari tanpa tanggal wajib, pilihan 7/14/30/60/90, tanggal tertentu dan rentang, penumpang/kelas/bagasi/maskapai/transit/provider/budget. Beberapa monitoring, pause/resume/stop, penggantian rute atomik. Histori membandingkan provider, tanggal, penerbangan, kelas, bagasi, tarif dan penumpang yang sama. Notifikasi default kenaikan dan penurunan, juga down/up/budget/nominal/persen/harian.
- Kalender WIB mengeluarkan tanggal lewat dan menambah tanggal baru. Perubahan minimum akibat pergeseran jendela bukan perubahan harga penerbangan. Kegagalan provider tidak membuat harga nol atau menandai penerbangan hilang.
- State, lease 120 detik, revision, outbox, histori dan deduplikasi tersimpan. Pekerjaan tidak bergantung pada browser, laptop, aktivitas avatar atau jam kantor. Pekerjaan utama pegawai tetap mendapat prioritas. Jihan/Alya tampak bekerja hanya selama lease pekerjaan nyata aktif.
- Outbox diperiksa kembali sebelum mengirim. Stop membatalkan antrean/job lama. Request Telegram yang telah terkirim ke jaringan tidak dapat ditarik kembali; timeout ambigu ditahan sebagai `uncertain`, tidak diulang otomatis. Penolakan yang terkonfirmasi dibatasi tiga percobaan.

## Penyimpanan & keamanan

Migration `20261122034020_lead_flight_automation.sql` menambah satu aggregate transaction `anshel.automation_state`, sesuai pola settings existing. Entitas lead, konfigurasi, watch, offer, snapshot, change, log, outbox dan usage merupakan struktur JSON terpisah di dalam aggregate; bukan sebelas tabel baru. PostgreSQL advisory lock melindungi transaksi lintas instance, SQLite memakai transaksi existing untuk lokal. Tidak ada perubahan kontrak task atau tabel proyek lain.

RLS aktif, akses PUBLIC/anon/authenticated dicabut; hanya backend existing mengakses. API dashboard membutuhkan sesi pemilik dan pemeriksaan origin. Endpoint worker membutuhkan token n8n existing. Callback memeriksa identitas pemilik dan grup. Callback Jihan memakai secret turunan token existing, tanpa credential baru. Aktivasi menolak mengganti webhook Jihan jika sudah dipakai layanan lain. Bridge callback Alya mempertahankan trigger Telegram tunggal dan jalur pesan existing, dengan pemulihan workflow jika perubahan gagal.

Batas: 20 watch, 50 antrean manual, 150 penawaran per batch, log 500, histori snapshot 20.000 / perubahan 10.000 sampai 180 hari, lead 2.000 sampai 180 hari, outbox 3.000 sampai 30 hari. Retensi dibatasi, bukan arsip tak terbatas. Aggregate ini cocok untuk pemantauan pribadi; volume besar memerlukan tabel histori terpisah/pagination sebelum memperluas kuota. Tidak ada pembelian tiket, auto-post, CAPTCHA bypass atau akses private API.

## Konfigurasi sumber yang diperlukan

### Aktivasi sumber aktual

1. [Google Alerts](https://www.google.com/alerts) — buat alert untuk kueri seperti `"butuh jasa pembuatan website" OR "cari developer aplikasi"`. Di **Show options**, pilih notifikasi sesegera mungkin, bahasa Indonesia, dan **RSS feed** jika tersedia di akun. Simpan URL ikon RSS yang berawalan `https://www.google.com/alerts/feeds/` sebagai `GOOGLE_ALERTS_FEED_URL`. Simpan URL sebagai rahasia. Periksa halaman asli sebelum memasukkan kandidat melalui dashboard. Waktu di feed adalah waktu alert.
2. [Brave Search API](https://api-dashboard.search.brave.com/) — buat key Search setelah memastikan kredit bulanan, atribusi, hak simpan, dan pengaturan batas biaya sesuai akun. Simpan key sebagai `BRAVE_SEARCH_API_KEY` dan set `BRAVE_SEARCH_ALLOWED=true` hanya setelah ketentuan tersebut terpenuhi. Batas aplikasi adalah 600 pencarian per bulan WIB, maksimum 20 per hari dan jeda minimum satu jam. Gunakan juga batas di dashboard Brave karena penggunaan dari aplikasi lain tidak tercatat di sini. [Dokumentasi pengaturan batas Brave](https://api-dashboard.search.brave.com/documentation/resources/help-feedback).
3. [Skyscanner Travel API](https://developers.skyscanner.net/docs/getting-started/authentication) — ajukan akses partner dan minta konfirmasi tertulis untuk polling otomatis, histori tarif, notifikasi Telegram dan cakupan SUB–BTH di pasar ID. [Akses Live standar mensyaratkan setiap pencarian dipicu pengguna](https://developers.skyscanner.net/docs/getting-started/usage-guidelines). Jika partner menyetujui penggunaan ini tanpa biaya, set `SKYSCANNER_API_KEY`, `SKYSCANNER_MONITORING_ALLOWED=true`, `SKYSCANNER_STORAGE_ALLOWED=true`, `SKYSCANNER_DAILY_LIMIT` dan `SKYSCANNER_MONTHLY_LIMIT` sesuai kuota tertulis. Satu tanggal memakai reservasi dua panggilan untuk create dan satu kemungkinan poll, dengan jeda minimum satu jam antarreservasi.
4. [Google Flights SUB–BTH](https://www.google.com/travel/flights/flights-from-surabaya-to-batam.html) — untuk alert resmi tanpa tanggal, pilih rute SUB–BTH, aktifkan **Track prices**, lalu pilih **Any dates**. Google mengirim email untuk penurunan minimum yang signifikan dan pembaruan berkala. Ini pilihan terpisah yang belum terhubung ke Telegram. [Cara kerja Google Flights Price Tracking](https://support.google.com/travel/answer/6235879).
5. Untuk Traveloka dan tiket.com, aktifkan alert di akun pemilik sesuai akses yang tersedia. Gunakan hanya email alert yang sah dari mailbox yang diotorisasi. Sebelum mengaktifkan intake, konfirmasi ketentuan penerusan/pemrosesan dengan provider dan gunakan contoh pesan yang telah disamarkan untuk memetakan rute, tanggal, harga, identitas pesan, dan autentikasi pengirim. Integrasi tepercaya harus memverifikasi DKIM asli sebelum membentuk payload. [Traveloka Price Alerts](https://www.traveloka.com/id-id/flights/price-alerts) · [tiket.com Price Alert](https://www.tiket.com/id-id/stories/tips/mencari-promo-tiket-pesawat-2026).

Amadeus menutup portal Self-Service pada 17 Juli 2026. Duffel mengenakan biaya Excess Search untuk rasio pencarian terhadap pemesanan yang terlalu tinggi. Aviasales Flight Search mensyaratkan pencarian yang dipicu pengguna, sementara Data API mengambil harga cache dan perlu validasi cakupan SUB–BTH. [Amadeus Enterprise](https://developers.amadeus.com/) · [Duffel Excess Search](https://help.duffel.com/hc/en-gb/articles/4412912264466-What-is-Excess-Search) · [Aturan Search API Aviasales](https://support.travelpayouts.com/hc/en-us/articles/34788165535250-Search-API-usage-rules) · [Dokumentasi Data API Aviasales](https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API).

### Ringkasan adapter

| Sumber | Adapter | Batas faktual |
|---|---|---|
| Manual | Siap, publikasi asli harus diperiksa pemilik | Bukan pencarian otomatis |
| Feed berizin | `LEAD_SOURCE_URL`, `LEAD_SOURCE_ALLOWED=true`, opsional `LEAD_SOURCE_TOKEN` | JSON version 1, posts maksimum 50; bukti original/owner_verified wajib |
| Brave | `BRAVE_SEARCH_API_KEY` | Discovery; tanggal indeks/pembaruan tidak diterima sebagai publikasi |
| Google Alerts | `GOOGLE_ALERTS_FEED_URL` dari feed resmi Google | Discovery; waktu alert tidak membuktikan umur postingan |
| Facebook groups | Tidak memakai Groups API lama | Perlu feed berizin atau impor manual, tidak scraping grup |
| Traveloka | Intake alert autentik melalui n8n | Perlu email/akses partner yang diizinkan; tidak mendukung rolling otomatis |
| tiket.com | Intake alert autentik melalui n8n | Perlu email/akses partner yang diizinkan; tidak mendukung rolling otomatis |
| Amadeus | Self-Service dihentikan | Adapter lama tidak digunakan |
| Skyscanner | API partner, nonaktif secara bawaan | Key, izin penggunaan rolling dan histori, serta batas kuota harian dan bulanan |

Gemini memakai reference credential n8n yang sudah ada; alternatif backend opsional `GEMINI_API_KEY`, `GEMINI_AUTOMATION_MODEL`. `LEAD_AI_DAILY_LIMIT` default 12 membatasi panggilan.

Skyscanner memeriksa satu tanggal per reservasi. Scheduler tetap berjalan tiap 15 menit, sementara frekuensi observasi tiap tanggal bergantung pada kuota, jeda sumber, dan jumlah watch. Hasil parsial tidak digunakan untuk menandai tarif hilang. Notifikasi perubahan memerlukan dua observasi dengan kondisi tarif yang sebanding.

Intake email `/api/integrations/automation/price-alert` hanya aktif dengan `FLIGHT_ALERT_INTAKE_ENABLED=true`, token n8n, provider traveloka/tiket, messageId unik, sender domain benar dan hasil DKIM pass dari integration terpercaya. Payload memuat ID/revision watch specific serta penawaran yang dinormalisasi. Tidak ada koneksi inbox atau parser email provider yang diklaim aktif: template email asli dan izin mailbox/forwarding masih diperlukan. Satu flag intake tidak menjamin mailbox telah terhubung. Alert hanya mencatat perubahan yang dilaporkan provider.

## Operasi cloud

Dashboard privat: `/automation.html`, login sebagai Dika melalui kantor existing.

- `POST /api/automation/scheduler {activate:true}` membuat/memperbarui hanya workflow bernama `Anshel · Lead Hunter + Flight Tracker · 24 jam`. Memakai credential reference N8N dan Gemini existing, cron `*/15 * * * *`, Asia/Jakarta. Tidak menyalin nilai rahasia ke repo. Memerlukan API n8n existing dengan scope yang cukup.
- `POST /api/automation/callback-setup {}` memasang callback Jihan bila aman dan bridge callback pada workflow Alya existing. Tidak menambah Telegram trigger kedua.
- Tick `/api/integrations/automation/tick`, hasil Gemini `/lead-result`, intake `/price-alert` dan `/callback` dilindungi token n8n.
- Bima `/diagnosa` membaca tick terakhir, jumlah watch, status sumber dan kegagalan; tidak menyamakan database tersedia dengan sumber sehat.
- Template workflow tersimpan di `workflows/office_leads_flights.json`, nonaktif dan tanpa nilai credential; installer mengambil reference existing, bukan credential palsu.
- Tidak mengaktifkan Studio Scheduler, mengubah token, Nation City atau BCIFT.

## Pengujian lokal

44 tes modul automation: batas umur 1/6/23/24/>24 jam, original vs indeks/komentar/modified, duplikat, buyer vs seller/spam/job, prompt injection, persistence/restart, rolling WIB, seluruh window, harga setara, kegagalan provider, invalidasi route/pause/stop, seluruh mode notifikasi, deduplikasi/timeout outbox, autentikasi/CSRF, command natural, callback history/status, email spoof/revision, task priority, sumber dan scheduler reference.

Suite regresi lengkap: 285/285 lulus; build Production lulus. Percobaan di lingkungan terbatas sempat gagal karena Windows EACCES pada koneksi localhost; pengulangan dengan akses lokal yang diperlukan lulus, tanpa mengubah tes agar mengabaikan kegagalan.

Browser lokal: desktop 1440×1000 dan viewport sentuh 390×844, kosong tanpa fixture Production, watch tanpa tanggal, refresh/persistensi, pause/resume/edit/stop, grafik fare setara, status lead, XSS escaped, error koneksi dan pemulihan. Tidak ada pageerror. Ini emulasi viewport, bukan perangkat fisik. Script `scripts/check-office-automation.mjs`; screenshot di folder artifacts di luar repository. Angka harga pada screenshot lokal adalah fixture pengujian, bukan penawaran nyata.

## Referensi resmi yang diperiksa

- [Traveloka Price Alerts](https://www.traveloka.com/id-id/flights/price-alerts): push/email; bukan API bebas untuk semua perubahan.
- [tiket.com perjanjian affiliate](https://www.tiket.com/public/downloads/b2b/affiliate/Affiliate_SyaratKetentuan_ID.pdf): akses partner memerlukan hubungan resmi.
- [Brave Search API](https://api-dashboard.search.brave.com/api-reference/web/search/get): freshness dapat mencakup publikasi atau modifikasi.
- [Amadeus for Developers FAQ](https://amadeus4dev.github.io/developer-guides/faq/): test dataset dan cakupan berbeda dengan Production.

## Checkpoint rilis

Lihat laporan rilis setelah pemeriksaan GitHub/Vercel/n8n dan smoke test Production. Jangan menyebut pencarian lead/harga live berhasil sebelum akses sumber dan datanya diuji. Sampai akses itu tersedia, tidak ada waktu postingan lead terbaru atau harga aktual yang dapat dilaporkan.

## Production smoke test — 22 November 2026 WIB

Implementasi awal merged PR #49, commit `5603aad65d22794f3677e3a02f6c286f0cc221bc`, Vercel `dpl_6dGRhAGPiR6z7SGpBkc9YUhbdVPW` Ready. GitHub Validate Anshel #121 berhasil. Dashboard Production terbuka dengan sesi pemilik; GET API automation/state tanpa sesi mengembalikan 401.

Workflow cloud [Lead Hunter + Flight Tracker](https://n8n-s75gjxx8g8lx.jkt6.sumopod.my.id/workflow/UNWbXWqAgngjXYaM) Published/active, cron `*/15 * * * *`. Zona waktu instance yang ditampilkan UI: Asia/Jakarta. API key existing hanya mengizinkan baca (pembuatan workflow melalui API mendapat 403); pemasangan dilakukan melalui editor n8n yang sudah login, memakai referensi credential existing. Ekspor workflow memastikan keenam node, koneksi dan credential reference sesuai template. Tick manual berhasil tersimpan di Supabase. Pemeriksaan sumber menghasilkan kendala sebenarnya; bukan data dummy. Belum dilakukan soak test 24 jam atau menunggu seluruh siklus rolling 30 hari.

Live Telegram berhasil diverifikasi:

- Kalimat “Alya, pantau harga tiket Surabaya ke Batam” membuat watch `bfabad0d-bbcf-48a5-b0dd-902c283f001f`, rolling 30 hari tanpa tanggal wajib.
- Tombol pause mengubah status di Supabase menjadi paused/revision 2; kalimat “Alya, lanjutkan monitoring terakhir” memulihkannya menjadi active/revision 3.
- `/leadon` dijawab Jihan dan status enabled tersimpan. `/leads` menjawab jujur belum ada publikasi terverifikasi.
- `/diagnosa` dijawab Bima dengan pembacaan database, metadata n8n, tick automation, watch aktif dan daftar sumber yang belum terhubung. Tugas lama yang dijeda tidak diubah.
- Webhook callback Jihan dipasang melalui endpoint pemilik. Alya tetap memakai satu trigger existing; hanya update callback_query dan prefix avt:callback-bridge ditambahkan melalui editor, lalu Published. Jalur pesan/media/Gemini existing dipertahankan.

Source status saat smoke test: approved-feed/Brave/Google Alerts belum memiliki konfigurasi; Facebook Groups API lama tidak digunakan; Traveloka dan tiket.com belum memiliki akses partner atau mailbox/forwarding berizin; Amadeus belum memiliki credential Production dan batas kuota yang disetujui. Rolling tersedia pada adapter API Amadeus setelah akses tersebut tersedia; email Traveloka/tiket hanya specific-date event intake, bukan rolling atau setiap perubahan aktual. Tidak ada lead terverifikasi yang ditemukan, sehingga waktu postingan terbaru tidak tersedia. Tidak ada harga aktual yang diperoleh. Jalur klasifikasi Gemini memakai credential reference existing, tetapi analisis lead live belum teruji tanpa postingan nyata terverifikasi; pengujian struktur/parser memakai fixture lokal.

Pengaturan bawaan penyimpanan execution n8n dipertahankan. Percobaan mengurangi retensi sukses dan menambah workflow timeout ditolak review persetujuan otomatis; dialog dibatalkan dan pengaturan tidak disimpan. Timeout HTTP per-node 45 detik tetap bagian dari template yang dipasang. Tidak mengubah scope API key, credential, atau pengaturan instance.

Bukti lokal/Production: `automation-2026-11-22` di direktori artifacts Codex (di luar Git), termasuk screenshot dashboard desktop/mobile, workflow Published, hasil browser-check dan log tes. Informasi RLS no-policy dari advisor hanya INFO dan disengaja karena seluruh tabel anshel privat/backend-only; [penjelasan advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Akses anon/authenticated tetap ditolak.

Perbaikan setelah smoke test: pemeriksaan scheduler yang sudah Published dan cocok kini baca-saja, sehingga tombol dashboard tidak mencoba deactivation/republish dengan API key read-only. Webhook callback Jihan yang sudah sesuai juga cukup diverifikasi. Tes tambahan memastikan tidak ada request mutation pada scheduler terverifikasi.

Release gate setelah perbaikan verifikasi: 286/286 tes regresi lulus, 45 tes automation termasuk di dalamnya; build Production lulus.
