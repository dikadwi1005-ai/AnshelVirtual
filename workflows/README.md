# n8n Cloud, Gemini, dan Telegram

## Pilot satu tugas Gemini

Impor `office_gemini_pilot.json` ke n8n Cloud. Workflow ini hanya dipicu manual dan memproses satu tugas draf yang dipilih lewat UUID. Jalankan setelah deployment menyajikan `/api/worker/claim-task`. Versi API sebelum rute tersebut mengembalikan 404 sehingga antrean tetap utuh.

1. Pasang kredensial **Header Auth** pada node **Ambil tugas terpilih**, **Perpanjang sewa**, dan **Simpan hasil**. Gunakan header `Authorization` dengan nilai `Bearer <WORKER_TOKEN>` yang sama dengan konfigurasi server Vercel.
2. Setelah perubahan workflow ini di GitHub, impor salinan terbaru ke n8n atau perbarui workflow yang sudah ada; file GitHub tidak otomatis memperbarui node n8n Cloud. Node **Perpanjang sewa** harus memakai kredensial worker yang sama. Draf memiliki waktu sewa awal 10 menit (diagnostik tetap 2 menit); sebelum menyimpan hasil, n8n memperpanjang sewa lewat heartbeat. Jika sewa terlanjur kedaluwarsa, antrekan ulang tugas dari panel, lalu jalankan workflow otomatis dari awal, bukan menyelesaikan run lama secara manual.
3. Pasang kredensial **Header Auth** terpisah pada node **Gemini**. Gunakan header `x-goog-api-key` dengan API key dari Google AI Studio. Model default adalah `gemini-3.5-flash-lite`.
4. Di kantor, buat draf uji untuk **Manajemen**, misalnya “Tulis agenda rapat fiktif tiga poin untuk merencanakan acara kantor.” Izinkan eksekusi di luar jam kerja bila perlu. Di browser yang sudah login, buka `/api/state`, cari deskripsi uji, lalu salin `id` ke node **Tugas uji**.
5. Jalankan **Execute Workflow** sekali. Periksa status **Selesai**, unduh artefak, dan cocokkan SHA-256. Kuota habis, timeout, atau gangguan Gemini akan membuat tugas berstatus terhambat. Setelah pulih, antrekan ulang dari kantor sebelum mencoba kembali.

Gemini menerima teks instruksi tugas dan konteks divisi serta proyek (tanpa token worker). Instruksi baru membedakan tugas Keuangan dari Pemasaran dan melarang mengarang tanggal atau tindakan yang tidak dilakukan. Gunakan contoh fiktif untuk pilot. Workflow menyimpan keluaran teks lengkap sebagai draf. Pelacakan di kantor memakai ID tugas dan checksum artefak. [HTTP Request n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/) · [Model Gemini](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) · [Harga dan penggunaan data Gemini](https://ai.google.dev/gemini-api/docs/pricing).

## Jalankan satu tugas antrean tanpa UUID (checkpoint Phase 3)

File `office_gemini_queue.json` adalah **workflow baru yang terpisah** dari pilot UUID. Workflow ini tidak otomatis berjalan: hanya memiliki **Manual Trigger**, `active:false`, dan setiap eksekusi mengambil **maksimal satu tugas berjenis Draf AI** dari antrean `POST /api/worker/claim`. Urutan tugas diatur backend berdasarkan prioritas, jam kerja, dan batas satu tugas aktif per divisi. Saat tidak ada tugas yang boleh diambil, alur berhenti tanpa memanggil Gemini.

1. Impor file JSON baru sebagai workflow terpisah di n8n; **jangan timpa workflow pilot** yang telah terbukti bekerja.
2. Gunakan kredensial **Header Auth worker** yang sama (`Authorization: Bearer <WORKER_TOKEN>`) di node **Ambil satu draf antrean**, **Perpanjang sewa**, dan **Simpan hasil**.
3. Gunakan kredensial Gemini yang sama di node **Gemini** (`x-goog-api-key` sebagai nama header). Jangan menaruh rahasia dalam JSON workflow atau screenshot.
4. Buat dua tugas draf fiktif di Anshel (dengan prioritas berbeda). Jalankan **Execute Workflow** satu kali: tugas prioritas tertinggi yang memenuhi syarat harus selesai, sedangkan lainnya tetap antre. Jalankan kembali untuk tugas berikutnya.
5. Periksa status dan unduhan artefak privat pada Anshel; uji kuota provider sebagai `Terhambat`. Gunakan prompt nonrahasia untuk pengujian.

**Batas keselamatan:** Alur ini belum terjadwal dan tidak menyalakan eksekusi berulang, sehingga tidak ada panggilan Gemini tanpa pemicu manual. Untuk otomasi penuh perlu batas harian/biaya, pengendalian retry, perlindungan atas pekerjaan sensitif, dan persetujuan Dika terlebih dahulu. Bukan worker gambar/video, bukan audit internet nyata, bukan penulis otomatis ke GitHub, dan bukan Telegram bot. Pastikan impor ulang file setelah perubahan GitHub; n8n tidak menyinkronkan file repository secara otomatis.

## Jadwal Gemini dengan kuota backend (checkpoint Phase 3)

`office_gemini_scheduled.json` adalah **workflow terpisah** dari pilot UUID dan Queue Manual. Saat impor, `active:false` (belum dipublikasikan). Pemicu **Schedule Trigger** berjalan setiap 20 menit, Senin–Jumat pukul 09.00–16.40 **WIB**, setelah workflow dipublikasikan di n8n.

Backend `POST /api/worker/claim-scheduled` memaksa jenis tugas `draft` dan secara atomik membatasi **3 tugas yang diklaim per tanggal WIB**, bukan 3 permintaan Gemini yang sukses. Kuota dipakai saat klaim (termasuk respons 429/timeout), **tidak otomatis dikembalikan** jika gagal atau tugas dibatalkan. Jika kuota habis, tidak ada tugas, sedang istirahat/ditutup/libur/jeda, respons `{"task":null}` dan Gemini tidak dipanggil. Kuota tersimpan dalam `anshel.setting` pada skema privat dan tidak memerlukan perubahan tabel. Tugas yang menunggu tetap antre untuk hari kerja berikutnya. Worker manual tetap tersedia terpisah dan **tidak** memakai kuota jadwal.

1. Tunggu PR diterima dan endpoint terpasang di **Production**; jangan menguji endpoint baru sebelum deployment Ready.
2. Impor `office_gemini_scheduled.json` sebagai workflow baru, **jangan mengubah workflow antrean manual yang lulus uji**.
3. Setel kredensial Header Auth worker di **Klaim draf dengan batas harian**, **Perpanjang sewa**, dan **Simpan hasil**. Kredensial Gemini hanya pada node **Gemini**.
4. Dengan workflow belum dipublikasikan, uji secara manual pada jam kerja dengan tugas draf **nonrahasia**. Cek satu tugas per eksekusi, `task:null` saat antrean kosong, dan data hasil privat.
5. Setelah lolos pengujian dan persetujuan aktivasi, **Publish** workflow terjadwal di n8n dan cek zona waktu `Asia/Jakarta`. Batasi hak pengelola dan awasi kuota. **Unpublish** untuk menghentikan pemicu kapan pun.

Batas 3 **klaim** bukan batas biaya absolut: tarif provider, model, retry internal, request manual, dan perubahan endpoint lain dapat menimbulkan biaya/kuota terpisah. Hindari mengaktifkan dua workflow terjadwal yang sama. Workflow ini hanya menghasilkan **teks** dan belum mengirim Telegram, membuat gambar/video, atau melakukan perubahan GitHub.

## Notifikasi Telegram untuk tugas selesai, gagal, atau terhambat (Phase 3)

Impor `office_telegram_notifications.json` sebagai **workflow baru**, tanpa mengubah Gemini Auto Worker. Ini terpisah dari perintah bot `office_telegram_intake.json` dan ringkasan `office_daily_report.json`. Workflow baru tetap **nonaktif** setelah impor dan berjalan setiap **30 menit sepanjang minggu** setelah Publish (sekitar 1.440 poll per bulan; cek batas n8n Cloud). Setiap polling hanya menangani **satu** event; tidak ada pemanggilan Gemini.

**Konfigurasi aman:**
1. Di Vercel Production, atur `N8N_TOKEN` acak panjang minimal 24 karakter dan `TELEGRAM_CHAT_ID` berupa ID numerik **chat pribadi** yang menerima pesan. Jangan salin token atau ID ke repo maupun chat publik. Variabel `TELEGRAM_USER_ID` hanya diperlukan jika kelak mengaktifkan perintah masuk via Telegram, bukan untuk notifikasi keluar.
2. Di n8n, pasang **Header Auth** `Authorization: Bearer <N8N_TOKEN>` pada node **Ambil notifikasi** dan **Konfirmasi terkirim**. Pasang **Telegram API credential** (token bot dari BotFather) pada node **Kirim ke Telegram**. Bot harus sudah pernah menerima `/start` dari chat tujuan.
3. Pastikan deployment Production endpoint baru **Ready**, lalu dengan alur belum dipublikasikan jalankan **Execute Workflow** **sekali**. Panggilan pertama hanya mengatur titik awal berdasarkan audit terakhir dan mengembalikan `notification:null`, agar tidak membanjiri chat dengan riwayat lama. Setelah itu buat dan selesaikan satu tugas draf **uji nonrahasia**.
4. Jalankan **Execute Workflow** lagi. Alur seharusnya mengambil satu notifikasi, mengirim pesan Telegram, lalu mengonfirmasi sukses ke server. Jika ada event lain, eksekusi ulang untuk event berikutnya. Pastikan event terhambat/gagal juga terkirim tanpa menampilkan teks draf.
5. Setelah berhasil, **Publish** alur dan periksa bahwa `Asia/Jakarta` dipakai. **Unpublish** kapan pun untuk menghentikan polling. Cegah dua workflow notifikasi serupa sama-sama aktif.

**Jaminan pengiriman:** backend menahan satu notifikasi dalam sewa 10 menit dan memindahkan penanda terakhir hanya setelah Telegram node sukses dan endpoint `ack` berhasil. Jika Telegram atau n8n gagal, event boleh diambil lagi setelah sewa habis; dalam kasus pesan terkirim tetapi konfirmasi gagal, **pesan duplikat mungkin terjadi**. Tugas dan status lama diabaikan saat aktivasi pertama. Hanya metadata status, divisi, proyek, dan UUID dikirim—bukan instruksi, artefak, rincian error, atau token. Periksa pemakaian n8n Cloud; 30 menit adalah kompromi biaya dan keterlambatan, **bukan pesan instan**.

## Workflow Telegram lama (perintah masuk dan ringkasan harian)

Kedua workflow lama ini terpisah dari notifikasi status terbaru dan belum teraktivasi. Gunakan instance n8n Cloud milik Dika. Perintah Telegram dan laporan menggunakan token khusus integrasi. Worker mengambil pekerjaan dari API kantor. Jadwal kerja dan antrean tetap berada di database privat Anshel (PostgreSQL pada produksi, SQLite pada pengujian lokal).

1. Siapkan bot Telegram khusus untuk kantor. Isi `TELEGRAM_USER_ID` dan `TELEGRAM_CHAT_ID` dengan ID numerik dari percakapan privat Dika. Gunakan token acak minimal 24 karakter sebagai `N8N_TOKEN`, lalu jalankan ulang server.
2. Pada Vercel Production gunakan host HTTPS `https://anshel-virtual.vercel.app` untuk endpoint integrasi, bukan gateway lokal. Ganti hostname contoh di dua JSON lama secara manual dan pastikan `N8N_TOKEN` sudah tersimpan sebagai environment variable privat.
3. Impor kedua JSON. Pada setiap HTTP Request, ganti hostname contoh. Pilih kredensial **Header Auth** dengan nama header `Authorization` dan nilai `Bearer <N8N_TOKEN>`.
4. Pasang kredensial bot yang sama pada Telegram Trigger dan node balasan. Gunakan satu Telegram Trigger aktif per bot. Pastikan zona workflow `Asia/Jakarta`.
5. Uji `/status` dari chat Dika. Verifikasi kode 403 dari identitas lain dan ketiadaan balasan. Coba `/diagnostik` saat worker lokal hidup dan jadwal mengizinkan eksekusi. Ambil UUID dari balasan, lalu jalankan `/hasil UUID`.
6. Uji Ringkasan harian secara manual. Jadwalnya 17:05 WIB pada hari kerja. Isi laporan menampilkan status antrean saat laporan diambil. Aktifkan workflow setelah uji privat berhasil.

Perintah tersedia lewat `/bantuan`. Frasa seperti “Suruh tim SEO audit website BCIFT” memetakan divisi dan membuat tugas draf. Draf teks dapat dikerjakan worker Gemini cloud jika diklaim; eksekusi audit situs asli belum tersedia. Artefak disimpan secara privat di database Anshel.

Persetujuan dan penolakan diproses oleh API kantor. Pekerjaan publikasi, pembayaran, akses repositori, dan perubahan eksternal belum memiliki alat eksekusi. Notifikasi perubahan status dan kegagalan per tugas belum dihubungkan ke Telegram.

Referensi [Telegram Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/) dan [Schedule Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/).
