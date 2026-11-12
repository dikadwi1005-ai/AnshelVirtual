# n8n Cloud, Gemini, dan Telegram

## Pilot satu tugas Gemini

Impor `office_gemini_pilot.json` ke n8n Cloud. Workflow ini hanya dipicu manual dan memproses satu tugas draf yang dipilih lewat UUID. Jalankan setelah deployment menyajikan `/api/worker/claim-task`. Versi API sebelum rute tersebut mengembalikan 404 sehingga antrean tetap utuh.

1. Pasang kredensial **Header Auth** pada node **Ambil tugas terpilih**, **Perpanjang sewa**, dan **Simpan hasil**. Gunakan header `Authorization` dengan nilai `Bearer <WORKER_TOKEN>` yang sama dengan konfigurasi server Vercel.
2. Setelah perubahan workflow ini di GitHub, impor salinan terbaru ke n8n atau perbarui workflow yang sudah ada; file GitHub tidak otomatis memperbarui node n8n Cloud. Node **Perpanjang sewa** harus memakai kredensial worker yang sama. Draf memiliki waktu sewa awal 10 menit (diagnostik tetap 2 menit); sebelum menyimpan hasil, n8n memperpanjang sewa lewat heartbeat. Jika sewa terlanjur kedaluwarsa, antrekan ulang tugas dari panel, lalu jalankan workflow otomatis dari awal, bukan menyelesaikan run lama secara manual.
3. Pasang kredensial **Header Auth** terpisah pada node **Gemini**. Gunakan header `x-goog-api-key` dengan API key dari Google AI Studio. Model default adalah `gemini-3.5-flash-lite`.
4. Di kantor, buat draf uji untuk **Manajemen**, misalnya “Tulis agenda rapat fiktif tiga poin untuk merencanakan acara kantor.” Izinkan eksekusi di luar jam kerja bila perlu. Di browser yang sudah login, buka `/api/state`, cari deskripsi uji, lalu salin `id` ke node **Tugas uji**.
5. Jalankan **Execute Workflow** sekali. Periksa status **Selesai**, unduh artefak, dan cocokkan SHA-256. Kuota habis, timeout, atau gangguan Gemini akan membuat tugas berstatus terhambat. Setelah pulih, antrekan ulang dari kantor sebelum mencoba kembali.

Gemini menerima teks instruksi tugas dan konteks divisi serta proyek (tanpa token worker). Instruksi baru membedakan tugas Keuangan dari Pemasaran dan melarang mengarang tanggal atau tindakan yang tidak dilakukan. Gunakan contoh fiktif untuk pilot. Workflow menyimpan keluaran teks lengkap sebagai draf. Pelacakan di kantor memakai ID tugas dan checksum artefak. [HTTP Request n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/) · [Model Gemini](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) · [Harga dan penggunaan data Gemini](https://ai.google.dev/gemini-api/docs/pricing).

## Workflow Telegram yang sudah ada

Kedua workflow masih nonaktif. Gunakan instance n8n Cloud milik Dika. Perintah Telegram dan laporan menggunakan token khusus integrasi. Worker mengambil pekerjaan dari API kantor. Jadwal kerja dan antrean tetap berada di SQLite.

1. Siapkan bot Telegram khusus untuk kantor. Isi `TELEGRAM_USER_ID` dan `TELEGRAM_CHAT_ID` dengan ID numerik dari percakapan privat Dika. Gunakan token acak minimal 24 karakter sebagai `N8N_TOKEN`, lalu jalankan ulang server.
2. Setelah jalur jaringan diotorisasi, siapkan gateway HTTPS yang meneruskan **hanya** `POST /api/integrations/telegram` dan `POST /api/integrations/report` ke server lokal. Layar kantor dan API worker tetap menggunakan loopback. Terapkan pembatasan permintaan di gateway.
3. Impor kedua JSON. Pada setiap HTTP Request, ganti hostname contoh. Pilih kredensial **Header Auth** dengan nama header `Authorization` dan nilai `Bearer <N8N_TOKEN>`.
4. Pasang kredensial bot yang sama pada Telegram Trigger dan node balasan. Gunakan satu Telegram Trigger aktif per bot. Pastikan zona workflow `Asia/Jakarta`.
5. Uji `/status` dari chat Dika. Verifikasi kode 403 dari identitas lain dan ketiadaan balasan. Coba `/diagnostik` saat worker lokal hidup dan jadwal mengizinkan eksekusi. Ambil UUID dari balasan, lalu jalankan `/hasil UUID`.
6. Uji Ringkasan harian secara manual. Jadwalnya 17:05 WIB pada hari kerja. Isi laporan menampilkan status antrean saat laporan diambil. Aktifkan workflow setelah uji privat berhasil.

Perintah tersedia lewat `/bantuan`. Frasa seperti “Suruh tim SEO audit website BCIFT” memetakan divisi dan membuat tugas draf. Draf memerlukan Ollama. Eksekusi audit situs belum terpasang. Tugas draf dan diagnostik menghasilkan artefak lokal.

Persetujuan dan penolakan diproses oleh API kantor. Pekerjaan publikasi, pembayaran, akses repositori, dan perubahan eksternal belum memiliki alat eksekusi. Notifikasi perubahan status dan kegagalan per tugas belum dihubungkan ke Telegram.

Referensi [Telegram Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/) dan [Schedule Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/).
