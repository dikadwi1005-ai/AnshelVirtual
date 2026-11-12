# n8n Cloud, Gemini, dan Telegram

## Phase 3D — Kontrol status kantor langsung dari Telegram (HP)

Ini perubahan backend saja. Workflow Natural Gemini dan Auto Office yang sudah Published **tidak perlu diimpor ulang**, dan tidak ada credential/Telegram Trigger baru. Hanya Alya, Bima, Citra, dan Dara yang merespons perintah khusus berikut:

- **/ringkasan** atau **/ringkas** → Alya mengirim ringkasan hitungan status tugas dari seluruh divisi berdasarkan `state.counts` (antre, dikerjakan, selesai, terhambat, gagal). Angka status ini adalah **akumulasi tugas tercatat saat ini**, **bukan** jumlah tugas yang selesai hari ini.
- **/kendala** → Bima mengirim jumlah tugas berstatus `blocked`/`failed` serta contoh maksimal tiga tugas yang terlihat di daftar terbaru, hanya menyertakan nama divisi, proyek singkat, dan status. Teks deskripsi pekerjaan, token, log error, dan artefak tidak dikirim. Nol tugas bermasalah **bukan bukti** server telah diperiksa atau sehat.
- **/cek Bima** → Bima mengabarkan salah satu tugas divisinya yang perlu diperhatikan. Bentuk yang sama berlaku untuk **/cek Alya**, **/cek Citra**, dan **/cek Dara**. Perintah `/cek` bagi delapan nama lain secara eksplisit dikembalikan ke Alya dengan keterangan belum aktif pada pilot Telegram.
- **/bantuan** → daftar singkat perintah yang bisa dipakai dari HP. Perintah `/status`, `/tim`, dan `/tugas Nama | instruksi` yang sudah ada tetap berjalan.

Keempat perintah baru diproses secara deterministik tanpa memanggil Gemini; hanya pemilik dan grup Telegram yang telah diizinkan bisa memicu balasan. Batas 20 pesan pemilik per hari WIB dan jeda minimal delapan detik tetap berlaku. Chat bebas tetap menggunakan Gemini pada workflow Natural Gemini.

### Menguji dari HP setelah PR di-merge dan Production Ready

1. Buka grup Telegram internal Anshel, kirim **/ringkasan** lalu periksa apakah yang membalas Alya.
2. Setelah jeda minimal **8 detik**, kirim **/kendala**. Bima seharusnya membalas dengan status tugas yang tercatat, tanpa mengaku sudah mengecek server.
3. Setelah jeda minimal **8 detik**, kirim **/cek Citra**. Balasan harus datang dari bot Citra.
4. Tidak perlu membuka laptop, mengubah workflow n8n, atau membagikan credential.

**Ringkasan harian terjadwal:** workflow lama bernama Ringkasan Harian di n8n belum diubah/diaktifkan melalui PR ini; perintah `/ringkasan` adalah permintaan manual, bukan pengiriman harian otomatis.

## Phase 3C — Otomatisasi Telegram kantor, hanya empat bot aktif

**Scope pilot:** Alya (management), Bima (operations), Citra (administration), Dara (hr). Delapan bot lainnya **tetap ditunda**. Tidak ada pembuatan bot atau perubahan token, dan workflow Natural Gemini tidak perlu diganti.

Impor file **office_telegram_fourbot_auto.json** sebagai workflow n8n baru; kedua node HTTP Request memakai credential Header Auth **Anshel API** yang sudah ada. Tidak memerlukan credential Telegram atau Gemini tambahan. Workflow ini memakai dua Schedule Trigger dengan timezone Asia/Jakarta.

- **Cek hasil kerja tiap jam:** Senin–Jumat pukul **09.00–17.00 WIB**; endpoint POST /api/integrations/office-group/dispatch mengirim laporan untuk event completed, blocked, atau failed dari audit tugas asli, **maksimal 3 event per hari WIB** dan **jeda satu jam**. Tiap event menghasilkan paling banyak dua pesan dari bot yang dikonfigurasi. Respons kolega hanya mengakui status, tidak berpura-pura sudah melakukan review atau menerbitkan hasil.
- **Obrolan virtual siang:** Senin–Jumat pukul **12.00 WIB**; endpoint POST /api/integrations/office-group/checkin mengirim **satu percakapan dua pesan per hari WIB**, berdasar aktivitas avatar aktual dari state.people, misalnya main PS5 atau mengambil kopi. Ini adalah aktivitas simulasi, bukan bukti kegiatan teknis di dunia nyata. Server hanya mengizinkan waktu 11.00–14.59 WIB pada hari kerja.
- Event dari delapan divisi yang ditunda dilewati tanpa mengirim pesan dan tanpa mengurangi kuota. Jika tidak ada tugas baru yang selesai/terhambat/gagal, tidak ada laporan kerja.
- Total batas **8 pesan otomatis per hari kerja**: 3 peristiwa × maksimal 2 balasan dan satu check-in × 2 balasan. Tidak ada Telegram Trigger baru sehingga tidak memicu loop dengan bot yang lain.
- Update otomatis menggunakan variasi template berdasarkan audit dan persona (bukan Gemini bebas) untuk menghindari laporan palsu serta biaya API tambahan. Percakapan pemilik tetap memakai workflow Natural Gemini yang sudah aktif.
- Check-in dicatat satu kali saat diambil untuk mencegah spam: jika kirim gagal setelah diambil, tidak ada retry hari itu. Laporan pekerjaan hanya mengumumkan event yang muncul dalam 24 jam terakhir.

### Cara mengaktifkan

1. Pastikan PR fitur sudah di-merge dan Vercel Production Ready.
2. Di n8n pilih Import from File untuk **workflows/office_telegram_fourbot_auto.json**.
3. Pada node **Kirim update kerja empat bot** dan **Dua bot ngobrol aktivitas virtual**, pilih credential **Anshel API** yang sudah ada. Save. Jangan bagikan token.
4. Jalankan node **Kirim update kerja empat bot** sekali untuk inisialisasi cursor. Hasil sent:false normal; tugas lama tidak akan diumumkan. Tugas baru yang benar-benar selesai setelah inisialisasi akan dikirim pada jadwal berikut.
5. Jika sedang hari kerja pukul 11–14 WIB, node obrolan virtual boleh diuji manual satu kali. Di luar jadwal akan merespons sent:false. Jangan membuat tugas fiktif untuk menguji notifikasi.
6. Publish workflow **Auto Office** setelah semua credential siap. Biarkan workflow Natural Gemini tetap Published: keduanya tidak bentrok karena Auto Office hanya punya Schedule Trigger.
7. Untuk berhenti, Unpublish Auto Office saja. Percakapan pribadi dengan keempat bot tetap berjalan.

**Catatan:** Ini laporan event nyata dan percakapan avatar simulasi, bukan model yang mengobrol bebas tanpa batas. Workflow lain seperti worker Gemini tetap terpisah.

## Phase 3B — Percakapan Telegram natural dengan Gemini

**Penyempurnaan setelah tes Alya/Bima:** Pertanyaan tentang aktivitas pegawai kini dapat memakai `state.people[division].activity` (label simulasi di `public/catalog.js`). Itu **aktivitas avatar virtual**, bukan bukti akses log atau pemeriksaan server. Jumlah tugas lintas divisi hanya dikirim ke Gemini jika pemilik menanyakan kondisi kantor secara keseluruhan; pertanyaan spesifik ke pegawai hanya mendapat tugas divisinya. Semua 12 persona disesuaikan, dan keluaran yang mengaku memantau log/menyatakan IT aman tanpa bukti akan memakai respons cadangan yang tidak mengarang. Percakapan sebelumnya yang memuat klaim semacam itu tidak dipakai ulang sebagai contoh Gemini.


**Kondisi sekarang:** Alya, Bima, Citra, dan Dara dapat membalas dari bot masing-masing, tetapi workflow lama memakai balasan status berbasis template. Workflow baru `office_telegram_group_natural.json` mengganti hanya **jalur obrolan pemilik**; otomatisasi tugas Gemini dan notifikasi berbasis audit tetap terpisah.

### Yang berubah
- Setiap dari 12 divisi memiliki gaya bicara dan identitas AI sendiri. Pesan santai bisa dibalas santai; permintaan progres menggunakan status tugas aktual dari database.
- Riwayat **6 balasan terakhir per pegawai** menjadi konteks Gemini (maks. 7 hari). Penyimpanan dibatasi 24 giliran total di `anshel.setting`, tanpa migrasi database. Hanya status tugas, proyek singkat, dan ringkasan angka dari kantor yang dikirim ke Gemini; bukan isi draf, token, atau detail rahasia.
- Gemini memakai API `gemini-3.5-flash-lite` via **credential Google AI Studio yang sudah berfungsi di n8n**. Tidak memerlukan kunci Gemini baru di Vercel. Setiap pesan percakapan bebas memicu **satu request Gemini**, sehingga berpotensi memakai kuota API; berbeda dari kuota 3 klaim draf terjadwal.
- `/status`, `/tim`, `/bantuan`, dan `/tugas Nama | instruksi` tetap diproses deterministik tanpa biaya Gemini. Pesan dari bot lain diabaikan. Batas 20 pesan pemilik/hari WIB dan minimal 8 detik berlaku di kedua alur.
- Tiket sementara 5 menit dan satu kali pakai mengikat hasil AI ke divisi asli. Pesan dikirim memakai token bot divisi; input tidak bebas mengganti pengirim. Jawaban Gemini kosong/error memakai fallback berbasis status, sehingga sebagian pesan dapat kembali berupa template ketika provider bermasalah.

### Penggantian workflow n8n (tanpa menghapus yang lama)

1. Setelah PR di-merge dan **Vercel Production Ready**, unduh `workflows/office_telegram_group_natural.json`, lalu **Import from File** di n8n sebagai workflow baru, simpan Unpublished.
2. Buka node **Pesan grup via Alya** dan pilih **Telegram credential Alya** yang sudah berhasil digunakan.
3. Buka node **Siapkan konteks AI** dan node **Kirim dari bot pegawai**; pilih **Header Auth `Anshel API` yang sudah ada** (nama header `Authorization`, Value `Bearer <N8N_TOKEN>`). Jangan menyalin token ke JSON workflow.
4. Buka node **Gemini obrolan**, pilih **Header Auth credential Gemini** yang sama seperti workflow Gemini Auto Worker sebelumnya (`x-goog-api-key` di Header Auth). Tidak perlu menambah credential lain.
5. Telegram mengizinkan satu webhook aktif per bot: **unpublish workflow lama `Anshel · Grup AI 12 pegawai — chat pemilik` sebelum menjalankan/Publish workflow baru**. Simpan workflow lama untuk rollback; jangan aktifkan dua Trigger Alya bersama.
6. **Test Workflow** baru dengan pesan `Alya, hari ini ada apa?`, lalu `Bima, kamu bisa bantu apa?`, `Citra, kita tadi bahas apa?`, dan `Dara, kabar?` (masing-masing beri jeda minimal 8 detik). Periksa node Gemini, status **ai:true** pada node pengiriman, dan variasi jawaban sesuai karakter bot. Bandingkan dengan data kantor nyata.
7. Uji `/status` dan `/tugas Citra | Susun ringkasan rapat fiktif`. Perintah ini diproses tanpa Gemini, hanya menambah antrean; jangan pakai instruksi sensitif. Lalu lakukan test duplikat pesan dan mode fallback provider. Jika berhasil, barulah Publish workflow baru.
8. Workflow `office_telegram_notifications.json` tetap boleh dipakai untuk laporan pekerjaan nyata, tetapi **bukan** obrolan bebas; jangan Publish jika bot lain belum dikonfigurasi.

**Keterbatasan yang disengaja:** Ini belum membuat antarkaryawan mengobrol bebas memakai Gemini secara terjadwal. Balasan antarkaryawan pada pembaruan kerja masih berbasis template terkontrol agar tidak ada bot-loop, spam, atau biaya tak terduga. Integrasi Telegram asli memerlukan pengujian manual memakai credential milik pemilik. Obrolan bisa diteruskan ke provider Gemini; hindari mengirim rahasia ke grup. Jika Telegram gagal sesudah tiket dikonsumsi, pesan chat itu tidak dikirim ulang otomatis. Semua bot tetap jelas sebagai akun bot AI.



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


## Grup Anshel: 12 pegawai AI, 12 bot Telegram (PR #7)

Fitur ini berbeda dari notifikasi satu bot. Setiap divisi dalam public/catalog.js memiliki bot Telegram sendiri, sedangkan Alya menjadi satu-satunya bot penerima pesan grup melalui n8n. Semua pegawai lain mengirim pesan memakai token masing-masing yang disimpan hanya di Vercel. Tidak ada akun, username, ataupun token yang dibuat otomatis lewat repository.

### Siapkan 12 bot dan grup privat

1. Buat satu grup privat dengan nama misalnya Anshel Virtual Tech - Internal Office. Buat 12 bot lewat @BotFather: Alya (management), Bima (operations), Citra (administration), Dara (hr), Eka (development), Fara (creative), Galih (video), Hana (social), Indra (research), Jihan (marketing), Kirana (qa), Laras (finance). Tambahkan semuanya sebagai anggota grup dan izinkan mereka mengirim pesan.
2. Gunakan akun bot Alya sebagai pendengar. Nonaktifkan Group Privacy khusus Alya di pengaturan BotFather agar ia dapat menerima pesan manusia dalam grup. Bot-to-Bot Communication Mode dapat diaktifkan untuk pengalaman Telegram, tetapi backend Anshel tetap menolak semua update dari bot sehingga tidak terjadi loop antarbot.
3. Dapatkan TELEGRAM_CHAT_ID numerik negatif dari message.chat.id Telegram Trigger, dan TELEGRAM_USER_ID dari message.from.id pesan pemilik. Jangan tempel token rahasia ke chat ini atau repository.
4. Atur variabel privat di Vercel Production: N8N_TOKEN (minimal 24 karakter, berbeda dari WORKER_TOKEN), TELEGRAM_CHAT_ID, TELEGRAM_USER_ID, TELEGRAM_BOT_TOKENS_JSON. Nilai terakhir merupakan satu objek JSON dengan 12 key divisi yang disebut di atas, masing-masing bernilai token BotFather berbeda. Contoh isi nilai yang tidak boleh digunakan sungguhan: management: TOKEN_BOT_ALYA, development: TOKEN_BOT_EKA, dan seterusnya; gunakan format objek JSON valid.
5. Opsional TELEGRAM_BOT_USERNAMES_JSON adalah objek JSON yang berisi key divisi dan username masing-masing bot tanpa awalan @. Ini membantu pemetaan pesan @AnshelEkaBot. Jika tidak diisi, perintah /tanya Eka | pertanyaan dan sapaan Eka, pertanyaan tetap bisa dipakai.
6. Redeploy Vercel, lalu cek endpoint POST /api/integrations/office-group/config dengan Header Auth Authorization: Bearer N8N_TOKEN dan body JSON {}. Jika semua siap, respons mengandung configured berisi 12 divisi, missing kosong, dan total 12; tidak ada token yang dikembalikan.

### Dua workflow n8n yang baru

- office_telegram_group_intake.json: Trigger Telegram dari bot Alya, node saring pesan manusia, lalu POST /api/integrations/office-group/message dengan N8N_TOKEN. Hanya menerima pemilik dengan ID pengguna dan grup yang telah diizinkan. Jangan Publish workflow lama office_telegram_intake.json bersamaan untuk bot Alya: satu bot hanya boleh memakai satu Telegram Trigger/webhook aktif.
- office_telegram_notifications.json: pemicu terjadwal tiap 30 menit Senin-Jumat 09:00-17:30 WIB, kemudian POST /api/integrations/office-group/dispatch dengan N8N_TOKEN. Satu eksekusi menyiarkan maksimum satu event tugas selesai, gagal, atau terhambat. Bot pegawai pemilik divisi mengirim pesan; pada tugas selesai satu respons singkat dari pegawai lain bisa ditambahkan. Maksimal dua pesan per perubahan tugas.

Tidak ada percakapan acak yang mengarang progres. Semua template percakapan mengacu pada audit/status nyata Anshel. Balasan grup bergaya santai tetapi tetap transparan sebagai akun AI. Tidak ada panggilan Gemini tambahan untuk chat, jadi tidak ada biaya LLM yang dipicu hanya karena obrolan.

### Uji dahulu sebelum Publish

1. Pastikan PR sudah di-merge, deployment Production Ready, 12 bot sudah di grup, token privat dan kedua workflow baru sudah diimpor tetapi belum di-Publish.
2. Pasang Header Auth N8N_TOKEN di node HTTP dari dua workflow. Pasang Telegram bot credential Alya di Trigger masuk.
3. Jalankan satu kali workflow jadwal grup **sebelum** menyelesaikan tugas baru. Respons sent:false benar karena sistem melewatkan backlog lama.
4. Buat satu tugas Draf AI fiktif di Anshel; jalankan worker Gemini sampai selesai; jalankan workflow jadwal grup sekali lagi. Harus ada pesan dari bot divisi yang bersangkutan, dan dapat diikuti balasan satu rekan kerja.
5. Di grup, kirim dari akun pemilik: /bantuan, Eka, progresnya gimana?, /tanya Kirana | ada tugas QA?, dan /tugas desain | Buat tiga konsep desain fiktif. Jeda minimal 8 detik antara pesan. Perintah /tugas benar-benar menambah draf ke antrean; pengerjaannya mengikuti jadwal dan kuota worker yang sudah ada.
6. Setelah tes privat berhasil, Publish kedua workflow. Unpublish untuk menghentikan aktivitas otomatis. Jangan Publish Telegram Trigger lama Alya bersamaan.

Keamanan: pesan dari akun bot diabaikan; ID grup/pemilik diperiksa ulang di backend; token N8N digunakan pada API; maksimum 20 pesan owner per hari WIB, minimum 8 detik antar pesan, update ID diproses sekali. Pesan status memuat divisi, proyek singkat, ID tugas; tidak pernah mengirim teks tugas, artefak, detail error, atau token. Pengiriman terjadwal hanya pada jam kantor, bukan setiap malam. Jika Telegram sudah menerima pesan tetapi ACK gagal, pengiriman ulang dapat terjadi setelah lease 10 menit. Panggilan satu event belum menjamin tepat satu kali secara mutlak.

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
