# n8n Cloud, Gemini, dan Telegram

## Jihan BCIFT News Hunter + Indra/Hana lintas proyek

**Rilis fitur bersyarat:** perubahan kode GitHub tidak otomatis berlaku ke Production sampai commit baru benar-benar di-deploy ke Vercel. Kode ini tidak mengubah workflow Published di n8n.

- **Jihan (marketing)** khusus SEO dan pemasaran **BCIFT** (`bcift.co.id`), bukan domain ferry, bisnis, atau proyek klien lain. Aktif otomatis bila token `marketing` ada di `TELEGRAM_BOT_TOKENS_JSON`. Tidak memerlukan `ANSHEL_JIHAN_ENABLED`.
- **Indra (research)** melayani riset dan verifikasi lintas proyek; aktif otomatis saat token `research` ditambahkan. **Hana (social)** menangani konten media sosial lintas proyek; aktif saat token `social` ditambahkan. Jangan aktivasi sebelum bot resmi dibuat dan diundang ke grup.
- Ketiga bot memakai **Telegram Trigger Alya yang sama**, bukan trigger, webhook, atau workflow n8n baru. Satu Telegram update dari pemilik diproses sekali, tetapi pengiriman pesan dilakukan oleh akun bot masing-masing.
- Contoh perintah: `Jihan, carikan hot news minggu ini untuk blog BCIFT`, `Indra, riset sejarah Indonesia dari sumber primer`, `Hana, buat ide Reels untuk proyek animasi sejarah`, `Indra dan Hana, bahas konsep konten edukasi sejarah`.
- Berita BCIFT dicari **saat diminta**, dengan `Gemini 3.5 Flash-Lite` dan Google Search grounding; *bukan* hasil riset dari database internal, bukan pemantauan otomatis yang selalu berjalan. Penelusuran Google lewat Gemini **dapat dikenakan biaya sesuai tarif penyedia**. Belum ada jadwal berita mingguan tanpa persetujuan khusus.
- Permintaan hot news memaksa tanggal sumber dalam **7 hari terakhir WIB** dan URL **HTTPS sumber resmi** (`.go.id`, `.gov.sg`, atau BCIFT). Kandidat yang tanggal/URL-nya tidak lolos pemeriksaan tidak dikirim sebagai rekomendasi: bot menyatakan tidak menemukan bukti yang cukup. Tautan yang dicantumkan adalah petunjuk verifikasi dan masih perlu **pemeriksaan manusia atas isi halaman** sebelum membuat artikel.
- Judul artikel lama BCIFT dibaca dari `https://bcift.co.id/blog/` saat mencari berita, dengan batas waktu unduh 2,6 detik dan daftar artikel lama yang diketahui sebagai fallback; jika pembacaan gagal, pengecekan duplikat bisa tidak lengkap. Pembuatan/publikasi artikel, backlink, perubahan website, dan pengambilan metrik SEO live **tidak dilakukan otomatis**.
- Karena node n8n Published `Periksa jawaban AI` saat ini membatasi jawaban hingga 700 karakter, Jihan menyajikan maksimal **dua kandidat pendek** per pesan. Bila ingin laporan 3–5 topik lengkap, perlu menaikkan batas pesan pada workflow yang sama setelah pengujian (bukan membuat workflow duplikat).
- Panggilan kolektif maksimal lima bot per update agar tidak melewati batas HTTP 12 detik di n8n; identitas peserta dirotasi. Diskusi berpasangan tetap memungkinkan Indra/Hana, dan tujuh divisi yang belum punya bot tidak boleh berpura-pura hadir.
- Aktifkan token hanya melalui Vercel Production → `TELEGRAM_BOT_TOKENS_JSON` dengan key `research` / `social`, menjaga empat token lama. Token tidak boleh dikirim lewat chat, GitHub PR, atau screenshot. Gunakan satu deployment Production commit terbaru setelah konfigurasi siap; `ANSHEL_JIHAN_ENABLED` diabaikan.


## Aktivasi Jihan — SEO & Pemasaran (token saja)

Jihan mengikuti pola Alya, Bima, Citra, Dara: jika key `marketing` berisi token bot Telegram yang valid dalam `TELEGRAM_BOT_TOKENS_JSON`, Jihan otomatis dapat menjawab pesan dari Telegram setelah **commit yang mendukung Jihan** dipasang di Vercel Production. **Tidak perlu** `ANSHEL_JIHAN_ENABLED`; variabel lama tersebut diabaikan, baik nilainya `true` maupun `false`.

Untuk mengaktifkan Jihan:
1. Buat bot dengan @BotFather dan undang ke grup Anshel yang sudah digunakan; izinkan mengirim pesan.
2. Pada Vercel Production, tambahkan `"marketing":"TOKEN_JIHAN"` ke **JSON lama**, tanpa menghapus empat token sebelumnya. Jangan salin token ke chat, screenshot, issue, atau workflow n8n.
3. Deploy commit `main` yang berisi perbaikan token-only ke **Production**, bukan Redeploy commit lama. Lingkungan Production harus menggunakan `TELEGRAM_BOT_TOKENS_JSON` terbaru.
4. Uji `Jihan, halo!`, `Alya dan Jihan, bahas strategi SEO`, dan `/tugas Jihan | Rancangan audit SEO`. Balasan harus berasal dari akun Jihan; tugas hanya tercatat sampai dikerjakan worker yang benar-benar tersedia.

Tidak perlu mengubah n8n Published atau menambah Telegram Trigger. Tujuh divisi lain tetap nonaktif **meski tokennya disimpan**. Aktivasi Jihan hanya memberi akses percakapan dan pemberitahuan tugas, bukan akses langsung ke OpenSEO, Google Analytics/Search Console, perubahan situs, atau publikasi konten.

Untuk menonaktifkan Jihan di masa depan, hilangkan **hanya key `marketing`** dari `TELEGRAM_BOT_TOKENS_JSON` sambil mempertahankan empat token lainnya, lalu deploy Production. Sebaiknya validasi JSON terlebih dahulu dan simpan backup kredensial di pengelola rahasia sebelum perubahan.

---

## Pembagian tanggung jawab API dan IT (Phase 3P)

- **Bima — IT & Operasional** adalah pemilik masalah API, server, database, webhook, koneksi, insiden integrasi, dan status teknis worker. Perintah `/kesehatan` dijawab Bima. Jika token Bima belum tersedia, Alya boleh menyampaikan status yang diperoleh tanpa berpura-pura menjadi Bima.
- **Alya — Manajemen** mengoordinasikan atau meneruskan laporan teknis, bukan mengaku sudah melakukan diagnosis atau memperbaiki API.
- **Eka — Pengembangan** menangani perancangan dan perubahan kode, tetapi bot Telegram-nya masih nonaktif pada pilot empat bot. Tidak ada aktivasi otomatis.
- Keluhan teknis tanpa nama pegawai yang dituju dipetakan ke Bima, termasuk ketika pesan merupakan Reply terhadap pegawai lain. Penyebutan pegawai secara eksplisit tetap dihormati. Mengobrol soal insiden **tidak otomatis membuat tugas, menjalankan diagnosis, atau memperbaiki server**.
- Tidak perlu mengubah node n8n atau menambahkan trigger untuk koreksi pembagian peran ini; backend diperbarui lewat deployment GitHub/Vercel.


## Phase 3O — Pengiriman andal, audit kesehatan, dan review hasil

**Penerapan ke n8n Published bukan bagian dari merge GitHub.** Jangan mengimpor workflow duplikat atau membuat Telegram Trigger baru.

1. Dalam n8n, buka workflow grup yang sudah Published: **Anshel · Grup AI Natural Gemini (12 pegawai)**. Di node **Saring pesan manusia**, salin seluruh isi `workflows/n8n_saring_pesan_manusia_telegram_2026.js` yang sudah ada dalam repo. Save, Publish workflow yang sama, dan pertahankan credential serta trigger yang ada.
2. Pada workflow **Anshel · Auto Office — Alya Bima Citra Dara** yang sudah Published, ubah hanya ekspresi cron node **Cek hasil kerja tiap jam** menjadi `0 * * * *`, dengan timezone `Asia/Jakarta`, dan Publish. Node check-in siang tetap `0 12 * * 1-5`. Tidak perlu membuat workflow tambahan. Perubahan template repo tidak otomatis memodifikasi workflow Published.
3. Pastikan Vercel Production menunjukkan commit yang sudah di-merge, bukan hanya preview PR. Periksa endpoint `/api/session` melalui URL produksi dengan aman tanpa membagikan cookie atau token.
4. Dari akun pemilik dalam grup yang diizinkan, kirim `/kesehatan` untuk membaca konektivitas permintaan API/database, worker heartbeat, dan timestamp panggilan `/dispatch` yang benar-benar teramati. **Timestamp ini bukan bukti n8n Published, Gemini, Vercel, atau Supabase secara keseluruhan sehat.**
5. Uji `Eka, tolong jelaskan status divisi` dan pastikan Alya menjelaskan status belum aktif, bukan berpura-pura menjadi Eka; kirim `/tugas desain | Buat draf konsep visual` lalu pastikan dashboard hanya mencatat antrean dan bukan hasil selesai.
6. Uji lampiran foto kecil dan voice/PDF kurang dari 1,5 MB; n8n harus meneruskan `fileId`, `fileSize`, `mimeType`, `mediaType`, `replyTo` pada alur yang sama. Bila metadata masih hilang, jangan klaim AI sudah membaca file.
7. Selesaikan satu **draf nonrahasia** melalui worker yang benar-benar terhubung. Kirim `/hasil UUID` dan pastikan SHA-256 tersedia; tinjau dokumen lengkap lewat panel privat sebelum `/sahkan UUID` atau `/kembalikan UUID | alasan`. Perintah ini mencatat keputusan **artefak setelah selesai**, tidak mempublikasikan atau menjalankan pembayaran. `/setujui UUID` tetap untuk antrean sebelum dikerjakan.
8. Untuk failure test, gunakan test CI yang memalsukan penolakan API; jangan sengaja membuat kegagalan produksi. Penolakan eksplisit membuka retry pada dispatch berikutnya. Timeout/koneksi putus memiliki hasil tidak pasti sehingga retry otomatis ditahan agar tidak menggandakan pesan. Ingatkan operator untuk memeriksa Telegram dan n8n Executions saat ada kegagalan.

**Monitoring yang tersedia:** backend merespons, koneksi database berhasil dibaca, heartbeat worker maksimum 40 detik, dan panggilan scheduler berotorisasi terakhir. Monitoring eksternal independen Vercel, n8n, Supabase, dan Google Gemini masih memerlukan koneksi/status API serta pengujian nyata; jangan mengasumsikan semua layanan aman.

**Aktivasi delapan divisi lain:** tetap opt-in. Sebelum mengaktifkan setiap bot, verifikasi token dan identitas Telegram, alur n8n satu trigger, kapasitas worker nyata per peran, izin akses data, batas kuota Gemini, kasus regresi dan rollback. Menyimpan token non-pilot tidak mengaktifkan bot. Tidak ada aktivasi massal pada Phase 3O.

**Batas pengingat:** cron tiap jam bukan jaminan pengiriman tepat menit. Jika scheduler tidak Published atau berhenti, pengingat tidak mungkin dikirim hingga dispatcher kembali aktif; review laporan gagal di n8n dan lakukan penanganan manual.

---

## Phase 3N — Analisis lampiran Telegram oleh Gemini

**Fitur baru yang ditambahkan dalam kode backend:** ketika pemilik mengirim foto, voice note, audio, PDF, dokumen teks, atau video kecil, Vercel mengambil berkas privat menggunakan token Telegram Alya yang sudah tersimpan di environment. Hanya **setelah** ID grup dan ID pemilik cocok, tipe MIME serta ukuran file diperiksa; berkas maksimal **1.500.000 byte** (sekitar 1,5 MB). Backend mengambil file dari host Telegram yang tetap (bukan URL bebas), menolak path berbahaya, dan mengirim base64 hanya pada satu permintaan \`Gemini 3.5 Flash-Lite\` yang sudah dipakai workflow. File mentah tidak dicatat di PostgreSQL/SQLite maupun memori percakapan tujuh hari. Model diinstruksikan agar tidak mengikuti perintah di dalam lampiran atau mengarang pekerjaan.

**Sangat penting: pekerjaan repository TIDAK mengubah workflow n8n yang sudah Published.** Sebelum foto/voice/PDF dapat dianalisis, pemilik harus memperbarui satu node \`Code\` di workflow yang sama:

1. Buka n8n → \`Anshel · Grup AI Natural Gemini (12 pegawai)\`.
2. Pilih node **Saring pesan manusia**. Ganti hanya \`JavaScript Code\` dengan isi file [\`workflows/n8n_saring_pesan_manusia_telegram_2026.js\`](./n8n_saring_pesan_manusia_telegram_2026.js) di repo. Code ini meneruskan \`replyTo\`, \`mediaType\`, \`fileId\`, \`fileSize\`, \`mimeType\` (metadata saja), tanpa mengambil berkas di n8n.
3. Save dan **Publish** perubahan pada workflow yang sama; pertahankan satu Telegram Trigger, credential, dan enam node lainnya. Jangan membuat workflow baru/duplikat, jangan menaruh token bot ke Code node.
4. Setelah Vercel **Production Ready** pada commit terbaru, uji dengan foto Telegram kecil dan pertanyaan \`Alya, jelaskan foto ini\`, lalu pesan suara pendek dan PDF kurang dari 1,5 MB. Foto tanpa caption juga menggunakan pertanyaan standar agar dapat dibaca, bukan hanya ditandai diterima.

Jika n8n masih menggunakan kode node lama atau file melewati batas ukuran/MIME, bot akan **memberi tahu bahwa lampiran diterima tetapi belum dianalisis**. Ini jauh lebih aman daripada mengaku sudah membaca atau mentranskripsikan file. Uji end-to-end pada akun Telegram tetap diperlukan; pengujian GitHub memalsukan HTTP Telegram/Gemini dan tidak membuktikan seluruh kombinasi codec perangkat berhasil.

Daftar MIME yang didukung secara terbatas: JPEG/PNG, PDF, text/plain, voice OGG, rekaman MP3/M4A/WAV/WEBM/FLAC dan video MP4/WEBM/QuickTime. Tidak memproses berkas eksekusi, arsip ZIP, tautan media luar, dokumen besar, atau file yang gagal diunduh. Satu file maksimal per pesan dan satu panggilan Gemini, memakai kuota Google yang sudah berlaku. Jangan mengirim data rahasia perusahaan ke penyedia AI tanpa izin.

**Sumber kemampuan model:** [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) mendukung teks, gambar, video, audio, dan PDF sebagai input.


## Phase 3M — Diskusi beberapa putaran, tindak lanjut rapat, dan notifikasi

**Lanjutan diskusi dengan kendali pemilik:** saat rapat aktif, ketik \`/rapat lanjut\`. Keempat bot tersedia membahas agenda dan keputusan yang tersimpan dalam satu permintaan Gemini, dengan riwayat percakapan pendek. Setelah \`/mode diskusi\`, pesan pemilik seperti \`Lanjutkan\` atau \`Menurut kalian?\` juga melanjutkan pembahasan. Setiap putaran membutuhkan pesan **baru dari pemilik**; bot tidak saling memicu pesan berulang atau membuat biaya tanpa persetujuan.

**Tindak lanjut yang benar-benar tercatat:**
- \`/rapat tugas Citra | Susun draf notulen hasil evaluasi\` membuat tugas draf baru pada antrean Citra dan menautkan ID asli ke notulen rapat yang masih aktif.
- \`/serahkan ID-TUGAS | Bima\` mengalihkan tugas yang masih boleh dipindahkan ke Bima. Tidak mengubah hasil yang sudah selesai atau menjalankan kode secara otomatis.
- \`/tinjau ID-TUGAS\` menandai tugas dalam antrean untuk meminta peninjauan (\`awaiting_approval\`). \`/setujui ID-TUGAS\` mengembalikannya ke antrean menurut alur status backend; **ini bukan tanda hasil akhir sudah lolos review**.
- \`/tolak ID-TUGAS\`, \`/ulang ID-TUGAS\`, \`/jeda ID-TUGAS\`, dan \`/batalkan ID-TUGAS\` menggunakan validasi status dan jejak audit yang sudah tersedia.
- \`/revisi ID-TUGAS | Perjelas poin risiko dan tindak lanjut\` membuat **tugas draf baru** yang merujuk ID tugas asal. Tugas asal dan hasilnya tidak ditimpa diam-diam.

**Pengaturan sosial:** pemilik dapat mengatur \`/notifikasi penting\` untuk menonaktifkan percakapan check-in santai; \`/notifikasi semua\` mengaktifkannya kembali. \`/hening on\` mengirim pesan tanpa suara notifikasi (tetap ada di grup). Acara internal yang didaftarkan lewat \`/acara YYYY-MM-DD | Nama acara\` diberitahukan satu kali pada pemanggilan Auto Office di tanggal yang cocok, jika notifikasi tidak dibatasi ke penting. **Jam dan hari pemanggilan bergantung pada jadwal workflow Auto Office yang Published**, sehingga acara akhir pekan/tanggal di luar jadwal tidak dijamin menerima pesan di tanggal itu.

Hanya empat bot yang telah terhubung digunakan. Tidak ada tindakan eksternal, publikasi, pembayaran, atau percakapan otomatis tanpa perintah pemilik. Status draf dan hasil tetap terpisah. Kegagalan pengiriman Telegram tidak boleh dianggap bukti tugas berhasil.


## Phase 3K — Grup Telegram: perbaikan klaim tidak terverifikasi (uji 13 Nov 2026)

Screenshot pengujian `Guys, hari ini ada kabar apa?` menunjukkan empat balasan berikut, padahal ada satu tugas Citra yang nyata-nyata masih **antre**:

- Alya: `Hari ini belum ada info baru yang masuk ke tim kita.`
- Bima: `Semua sistem terpantau aman dan belum ada laporan kendala.`
- Citra: `Arsip dan catatan harian masih belum ada penambahan data baru.`
- Dara: `Suasana tim hari ini tetap kondusif dan saling mendukung.`

Balasan seperti ini bukan pemeriksaan sistem maupun kondisi sosial pegawai. Backend sekarang:

- Menyaring pernyataan **sistem terpantau aman**, **suasana tim kondusif/kompak**, **arsip tidak bertambah** tanpa dasar verifikasi.
- Ketika pemilik meminta kabar atau status, memasukkan **snapshot tugas empat pegawai aktif** dan angka antrean yang benar-benar tercatat ke konteks Gemini.
- Menolak pernyataan umum "tidak ada info baru" saat ada pekerjaan antre/berjalan/terhambat/gagal; mengganti balasan dengan komentar kontekstual sesuai peran, misalnya menyebut tugas Citra masih antre. Tidak mengarang tugas baru ataupun menyatakan worker telah memeriksa server.
- Tetap membolehkan kalimat seperti "Belum punya hasil pemeriksaan server" dan "Tugas Citra masih antre". Pengecekan berlaku untuk grup dan percakapan satu pegawai.
- Tidak mengubah jeda dua detik, kalender Indonesia, bot, token, workflow n8n, atau jadwal operasional. Satu deployment backend setelah GitHub CI cukup.


## Phase 3J — Jeda balasan grup dan kalender Indonesia

### Percakapan seperti chat manusia, bukan spam empat akun sekaligus
- Saat pemilik menulis `Guys, ...`, empat akun aktif (Alya, Bima, Citra, Dara) **tidak lagi dikirim secara paralel**. Backend mengirim berurutan, berjarak target **2 detik** antara pesan.
- Saat pemilik menulis `Alya dan Bima, diskusikan ...`, satu permintaan Gemini tetap membuat dua jawaban saling terkait. Jawaban Bima muncul setelah sekitar dua detik serta **di-reply** ke pesan Alya.
- Delay memakai batas lunak sekitar **9 detik** agar tidak menambah risiko timeout pada node n8n **Kirim dari bot pegawai** yang sekarang memakai timeout 12 detik. Jika koneksi Telegram sedang lambat, sebagian jeda boleh dilewati; hal ini **tidak menjamin** jeda persis 2 detik dalam semua kondisi. Tidak ada penjadwalan pesan di background, tidak ada workflow, token, ataupun node baru.
- Jangan membuat satu respons AI untuk setiap pegawai secara terpisah. Mekanisme satu request Gemini dan pemilihan identitas hanya dari backend tetap dipertahankan, termasuk pengecualian pegawai yang sedang mengerjakan tugas.

### Kesadaran tanggal merah dan perayaan Indonesia
- Server punya daftar **hari libur nasional dan cuti bersama 2026–2027** dari publikasi resmi pemerintah. Kalender memakai **WIB (Asia/Jakarta)** dan memisahkan:
  1. Libur nasional: contoh Natal, Imlek, Nyepi, Idulfitri, Iduladha, Pancasila, Kemerdekaan, Paskah, dan lain-lain menurut tahun.
  2. Cuti bersama: tanggal dan alasan tersendiri, tidak otomatis berarti semua kantor swasta libur.
  3. Peringatan umum yang **bukan otomatis libur**: Hari Kartini, Hari Pendidikan Nasional, Hari Sumpah Pemuda, Hari Pahlawan, Hari Ibu.
- Data tanggal hari ini dan besok dimasukkan secara ringkas ke prompt Gemini tiap pegawai, sedangkan kalender yang mendekati atau cocok dengan pertanyaan dimasukkan ketika relevan. Jangan mengarang hari raya untuk tahun tanpa daftar resmi.
- Jadwal `state.schedule.days` dan `state.schedule.holidays` adalah **sumber keputusan kapan kantor virtual tutup**. Penambahan informasi hari libur resmi tidak diam-diam mengubah jadwal, mematikan worker, atau mengirim pengumuman massal.
- Perintah `/kalender` (alias `/libur`) dijawab langsung oleh Alya berdasarkan data resmi, tidak memerlukan request Gemini. Pertanyaan biasa seperti `Alya, besok kantor libur nggak?` tetap memakai aturan operasional backend dan akan menjelaskan hari libur nasional yang relevan.
- Penggunaan salam hari raya dibuat kontekstual dan tidak terus-menerus; jangan mengasumsikan agama atau kebiasaan perayaan pemilik maupun pegawai.
- Jadwal Idulfitri dan Iduladha pada SKB bisa memerlukan penetapan lanjutan Kementerian Agama. Perbarui daftar resmi jika ada perubahan; untuk tahun setelah 2027 kalender nasional belum diverifikasi.

**Sumber resmi:**
- [Kementerian Sekretariat Negara — SKB 3 Menteri Libur Nasional dan Cuti Bersama 2026](https://www.setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026)
- [Kementerian Sekretariat Negara — SKB 3 Menteri Libur Nasional dan Cuti Bersama 2027](https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027)

**Cara cek lewat HP setelah Production Ready:** Kirim `/kalender`, kemudian `Alya, besok kantor libur nggak?`, dan `Guys, minggu depan ada perayaan apa?`. Untuk jeda, coba `Guys, hari ini ada kabar?` atau `Alya dan Bima, diskusikan status antrean tugas`. Balasan harus terurut, tidak memanggil pegawai sibuk atau menyebut tanggal libur palsu.


## Phase 3I — Operasional Telegram, monitoring, laporan, dan kontrol dari HP

**Hanya empat bot yang sudah aktif:** Alya, Bima, Citra, Dara. Delapan bot lain tetap ditunda. Workflow n8n Auto Office yang sudah Published tetap bisa dipakai, karena backend memanfaatkan panggilan `POST /api/integrations/office-group/dispatch` setiap jam pada hari kerja pukul 09–17 WIB. Tidak ada Telegram Trigger baru, credential baru, atau database schema baru. Setelah perubahan masuk Production, cek bahwa workflow Auto Office itu memang Published dan berjalan pada jam tersebut.

### Pemantauan langsung
- Dashboard web privat memiliki panel **Monitor** khusus, di samping Ruang, Proyek, Aktivitas, dan Tugas. Panel menunjukkan kegiatan avatar, tugas berjalan/antre, hasil draf terakhir, status worker yang tercatat, antrean menunggu persetujuan, dan masalah. Tampilan otomatis mengikuti respons `/api/state` yang sudah butuh login pemilik. Status worker bermakna **heartbeat baru-baru ini** (40 detik), bukan audit semua server.
- Dari Telegram grup, pemilik bisa mengetik **/aktivitas**, **/pegawai**, atau **/monitor**. Alya memberi ringkasan empat pegawai dari data, bukan mengarang kerja fisik atau hasil tes.

### Notifikasi masalah
- Notifikasi `blocked` dan `failed` yang bersumber dari audit worker asli tetap dikirim lewat alur Auto Office yang ada, dibatasi maksimal tiga event per hari WIB dengan jeda satu jam.
- Tambahan: ketika ada tugas **empat divisi aktif** yang antre sedikitnya **dua jam** dan worker tidak punya heartbeat dalam 40 detik saat jam kerja, **Bima mengirim peringatan satu kali per hari WIB**. Teks peringatan mengatakan ini indikasi antrean, **bukan bukti server mati**. Belum ada akses monitoring eksternal (Vercel/Supabase/Google API) untuk mengumumkan kondisi layanan lain sebagai fakta.
- Bila tidak ada kondisi terdeteksi, bot tidak membuat peringatan. Notifikasi antrean disimpan secara atomik di `office_group_signals_v1`.

### Ringkasan sore Alya
- Pada pemanggilan terjadwal pertama yang terjadi setelah **jam tutup kantor** (default 17.00 WIB, hari operasional menurut `state.schedule`) hingga dua jam sesudahnya, Alya mengirim **satu ringkasan per hari WIB**.
- Jumlah **tugas selesai/blocked/failed hari itu** dihitung dari audit bertanggal WIB; status **antre/diproses/menunggu persetujuan** dijelaskan sebagai snapshot seluruh antrean saat laporan dibuat, bukan salah disebut hasil kerja hari itu.
- Hasil draf yang baru selesai di empat divisi diperlihatkan hanya melalui nama proyek dan divisi, tidak membocorkan teks tugas, output, error log, atau token. Draf belum dianggap sudah ditinjau/dipublikasikan.
- Ringkasan ini **tidak memerlukan workflow Ringkasan Harian lama** dan tidak perlu mengaktifkannya, untuk menghindari dua laporan ganda. Jika Auto Office Cron tidak memanggil `/dispatch` sesudah jam tutup, ringkasan tidak dapat terkirim—jadi jadwal trigger n8n tetap perlu dicek.

### Percakapan antarkaryawan
- Obrolan virtual siang pada `/checkin` kini memilih dua pegawai yang **tidak sedang mengeksekusi tugas** dan, jika ada tugas yang tercatat, membahas status tugas/proyek tersebut secara terbatas. Tidak mengarang status penyelesaian atau aktivitas di server.
- Perhatikan: obrolan otomatis ini masih **disusun secara deterministik dari data kantor**, bukan percakapan Gemini bebas yang selalu berubah. Untuk obrolan AI antarkaryawan yang sepenuhnya generatif dibutuhkan perubahan workflow n8n dan persetujuan kuota khusus; perubahan ini tidak berpura-pura sudah mengaktifkannya.
- Pemilik tetap bisa memanggil `Guys` untuk memperoleh jawaban terpisah satu permintaan Gemini melalui workflow Natural Gemini. Memori singkat lintas pegawai dari Phase 3H tetap tersedia.
- **Diskusi dua pegawai yang benar-benar ditulis Gemini**, dipicu pemilik: `Alya dan Bima, diskusikan status pemeriksaan API terbaru` atau `Citra dan Dara, bahas catatan rapat yang kemarin`. Backend memilih hanya dua bot aktif yang disebut dan tidak sibuk. Satu request Gemini menghasilkan dua pendapat berdasarkan konteks dan status tugas; balasan pegawai kedua di-*reply* ke pesan pegawai pertama dalam grup agar alurnya jelas. Tidak mengklaim telah memeriksa server, menyelesaikan tugas atau berkomunikasi tanpa perintah pemilik. Ini berbeda dari **check-in siang otomatis**, yang masih berbasis data dan variasi teks aman.

### Kontrol melalui Telegram
- Perintah manual `/ringkasan`, `/status`, `/kendala`, `/cek Nama`, dan `/tugas Nama | instruksi` tetap aktif.
- Pengguna juga bisa memberi instruksi tugas draf eksplisit tanpa slash, contohnya **`Tolong Bima buat draf pemeriksaan layanan API`** atau **`Citra, tolong rangkum catatan rapat besok`**. Backend menerima hanya nama empat bot dan kata kerja yang jelas. Hasilnya **antrean tugas draf**, bukan klaim sudah dikerjakan atau tindakan langsung di server/akun lain.
- Permintaan ambigu, percakapan biasa, dan panggilan bersama tidak otomatis menciptakan tugas. Pemilik dan grup tetap diverifikasi, update Telegram diproses satu kali, dan pembatasan 1.000 pesan/hari WIB dengan jeda dua detik masih berlaku.

### Pengujian dari HP sesudah Production Ready
Kirim `/aktivitas`, kemudian `Tolong Citra buat catatan ringkas rapat pagi nanti`, lalu `/cek Citra`. Pastikan bot hanya mengaku tugas **masuk antrean** hingga worker benar-benar menyelesaikan draf. Buka panel **Monitor** untuk melihat hasil dan status. Peringatan worker dan laporan sore harus didasarkan pada **kejadian nyata**, jangan membuat kegagalan produksi hanya untuk memicu pesan.


## Phase 3H — Memori percakapan grup Telegram lintas pegawai

Sebelumnya, panggilan "Guys" hanya memakai pertanyaan terbaru dan fakta tugas. Meskipun kantor sudah menyimpan jawaban masing-masing pegawai, grup tidak memiliki konteks bersama. Sekarang saat **panggilan kolektif** ditujukan kepada pegawai bebas, satu request Gemini menerima **ringkasan maksimal lima putaran percakapan terbaru** dari Alya, Bima, Citra, dan Dara, termasuk saat sebelumnya pengguna berbicara secara pribadi di grup dengan salah satu pegawai. **Balasan yang dicatat berasal dari grup Telegram privat yang sama**, bukan sumber luar.

- Penyimpanan existing `office_group_ai_history_v1` dipakai kembali di SQLite dan PostgreSQL. Tidak ada skema tabel baru, token, workflow tambahan, atau trigger Telegram baru.
- Backend membatasi konteks pada maksimal 12 entri percakapan dari tujuh hari terakhir, memotong isi masing-masing entri dan menggabungkan balasan pada pertanyaan bersama yang sama. Maksimal lima putaran dimasukkan ke request untuk menghemat token.
- Riwayat antarpegawai bisa dipakai memahami kata "tadi", "yang barusan", atau "lanjut bahasan itu" tanpa memaksa pemilik menjelaskan topik berulang. Model diinstruksikan bahwa **riwayat bukan bukti penyelesaian pekerjaan**, dan teks lama berisi klaim pekerjaan personal yang tidak didukung dikeluarkan dari konteks.
- Hanya empat bot Telegram yang sudah aktif yang boleh menjadi pemberi jawaban. Pegawai yang sedang mengerjakan tugas tidak ikut membalas, tetapi pesan lamanya boleh menjadi konteks historis. Tidak membuat loop antarbot atau percakapan otomatis tanpa pesan pemilik.
- Bila riwayat belum cukup untuk memahami rujukan, pegawai boleh bertanya singkat, **tidak mengarang peristiwa, rencana, atau pekerjaan**.
- Pengujian mencakup konteks lintas pegawai, pegawai sibuk, filter divisi belum aktif, batas konteks, dan berakhirnya memori sesudah tujuh hari.

**Pengujian dari HP setelah Production Ready:** kirim `Bima, kalau ada error nanti gimana?`; tunggu balasan, kemudian kirim `Guys, lanjut bahasan Bima yang tadi, menurut kalian gimana?`. Alya, Citra, dan Dara harus dapat memahami bahwa pembahasannya tentang cara merespons error, tanpa mengarang bahwa error benar-benar terjadi. Jangan menganggap aktivitas virtual sebagai pemeriksaan sistem sungguhan.


## Phase 3G — Mencegah klaim pekerjaan selesai yang tidak terbukti

Saat diuji pada 13 November 2026, panggilan "Guys, besok semua semangat ya! Ada yang mau disampaikan?" menghasilkan respons lebih alami, namun beberapa pegawai mengklaim pekerjaan yang belum dibuktikan sistem:

- Alya: "Jadwal dan koordinasi untuk besok sudah saya siapkan ya."
- Citra: "Catatan penting sudah saya rapikan untuk di cek kembali."

Perubahan ini memperjelas instruksi Gemini serta **memvalidasi balasan sebelum dikirim**. Klaim orang pertama tentang pekerjaan yang "sudah/telah/udah/tadi" disiapkan, dirapikan, disusun, dicek, atau dikerjakan akan ditolak dan diganti jawaban kontekstual jika tidak ada verifikasi aksi tersendiri. Aturan berlaku untuk chat individu dan grup, termasuk saat AI mengirim JSON valid. Status draf yang benar-benar tercatat tetap boleh diceritakan sebagai fakta sistem, tetapi tidak diklaim sebagai tindakan personal tanpa bukti.

Pengujian baru mengambil kalimat **persis dari Telegram**, memeriksa pencampuran jawaban valid dan fallback (hanya balasan Alya/Citra yang diganti), serta memastikan tawaran bantuan dan status draf tercatat tetap diizinkan. Alur tujuh node di n8n tetap tidak berubah; tidak perlu mengimpor workflow atau mengganti credential. Seperti biasa, jangan menganggap status tugas/aktivitas avatar sebagai bukti pemeriksaan server atau penyelesaian pekerjaan nyata.


## Perbaikan respons panggilan "Guys" yang jatuh ke template cadangan (Phase 3F)

Screenshot pengguna menunjukkan empat balasan grup tepat sama seperti template fallback backend, bukan berarti empat respons itu dihasilkan oleh Gemini. **Akar penyebab Gemini yang persis masih perlu dibuktikan dari eksekusi n8n**, sebab node "Periksa jawaban AI" mengirim `output:null` ketika HTTP Gemini gagal, `finishReason` bukan STOP, hasil kosong atau panjang teks lebih dari 700 karakter.

- Backend kini mengirim **`generationConfig.responseSchema`** dengan properti wajib sesuai daftar bot yang bebas. Ini didukung oleh endpoint **Gemini generateContent** dan membantu menghasilkan JSON yang benar serta memisahkan gaya tiap bot; maksimum output dinaikkan dari 550 ke 1.600 token untuk menghindari potong jawaban saat model menggunakan token berpikir.
- **Jika Gemini tetap gagal**, respons cadangan dibedakan menurut maksud pesan pemilik: semangat, ucapan terima kasih, pertanyaan progres, aktivitas avatar, sapaan atau bantuan. Keempat bot tak lagi selalu menjawab dengan kalimat tak terkait topik. Fallback progres menggunakan status tugas yang benar-benar terlihat; aktivitas avatar tetap dikatakan virtual, bukan tugas nyata.
- Jawaban Gemini yang valid tetap dilewatkan pemeriksaan klaim aksi, status palsu dan format internal. Kunci orang tambahan tidak dapat mengirim; **maksimal satu sapaan Pak di seluruh respons**. Jika hanya sebagian respons model valid, selebihnya fallback.
- Node n8n **Kirim dari bot pegawai** sekarang menerima metadata hasil `fallbackReason` dan `generated` yang tidak memuat teks model maupun token. `none` artinya semua berhasil; `provider-empty` artinya n8n mengirim output kosong; `provider-invalid-json` artinya JSON gagal diproses; `provider-no-valid-replies` artinya semua teks ditolak; `provider-partial-fallback` artinya ada sebagian teks yang dipakai; `provider-too-long` bila panjang melebihi batas backend. Ini untuk troubleshooting, bukan balasan Telegram.
- Alur n8n tetap **7 node**, satu Telegram Trigger, credential tetap sama, tidak memerlukan impor ulang. Jika `provider-empty` terus terjadi sesudah Production Ready, periksa **node Gemini obrolan** dan **Periksa jawaban AI** di eksekusi n8n: response HTTP, `finishReason`, dan panjang `candidate.content.parts.text`; jangan mengirim API key atau token ke chat.
- Lakukan pengujian dari HP dengan `Guys, besok semua semangat ya!` dan `Guys, ada kabar progres pekerjaan?` setelah merge/deploy. Data keempat bot yang sedang bekerja tetap di-skip. Jangan membuat commit tambahan semata untuk mengulang deployment.


## Phase 3E — Identitas pemilik dan panggilan semua pegawai

**Perilaku baru Telegram, tanpa impor ulang workflow:** Telegram pemilik sudah memiliki identitas yang terverifikasi melalui TELEGRAM_USER_ID. Gemini kini mendapat instruksi bahwa pemilik berbicara sebagai pimpinan Anshel Virtual Tech, bukan pelanggan. Gaya empat karakter tetap berbeda, santai, tanpa basa-basi bot atau pemanggilan nama pemilik berulang. **'Pak' boleh sesekali, maksimal satu panggilan dalam respons grup**, bukan sapaan wajib pada setiap pesan.

### Panggilan untuk seluruh pegawai yang bebas

- Pesan seperti **'Guys, lagi ngapain?'**, **'Halo semua, kabar?'**, **'Teman-teman, semangat ya'**, **'Oke, besok semua semangat ya'**, atau **'Tim, bisa dengar sebentar?'** diarahkan sebagai panggilan kolektif.
- Hanya **Alya, Bima, Citra, Dara** yang sudah diaktifkan sebagai bot Telegram yang bisa merespons. **Delapan pegawai lain tetap ditunda.**
- Pegawai dengan tugas yang **benar-benar sedang dieksekusi** di `state.running`, `state.tasks` berstatus `running`, atau `state.people[id].executing=true` **tidak mengirim balasan**. Tugas yang baru antre/berstatus blocked tidak disamakan dengan sedang menjalankan tugas.
- Satu pesan pemilik menggunakan **satu request Gemini** untuk menyusun JSON pendek per pegawai. Backend mengikat daftar penerima ke tiket sekali pakai dan mengirim dari token bot masing-masing, maksimum **empat balasan**. Gemini tidak boleh menambah bot atau mengubah penerima.
- Jawaban grup menggunakan data terbatas terkait tugas dan aktivitas avatar simulasi; tidak mengarang tindakan, publikasi, cek server, atau hadir secara fisik. Jika Gemini gagal atau respons JSON tidak valid, backend memakai respons pendek berbasis karakter.
- Jika semua pegawai sedang mengerjakan tugas atau tidak ada bot terkonfigurasi, **tidak ada bot yang menyela**. Workflow akan mencatat `sent:false`, `reason:all-workers-busy-or-offline`. Batas pesan pemilik 1.000/hari WIB, jeda 2 detik, dan pemeriksaan grup/pemilik tetap berlaku.
- Panggilan nama yang jelas di awal seperti **'Alya, coba tanya semua'** tetap ditujukan **hanya kepada Alya**. Frasa **'semua tugas'** bukan panggilan semua pegawai. Perintah slash yang ada tidak berubah.

### Pengujian lewat HP

Setelah PR ini di-merge dan Vercel Production Ready, kirim **'Guys, besok semua semangat ya!'** di grup Telegram internal Anshel. Bila empat bot bebas, masing-masing seharusnya membalas satu kali dengan gaya berbeda. Untuk menguji pengecualian sibuk secara nyata, jalankan satu tugas terverifikasi hingga statusnya `running`, lalu ulangi panggilan setelah jeda 2 detik. Bot yang sedang bekerja tidak seharusnya membalas.

Workflow Natural Gemini yang sudah Published tetap mempunyai **7 node** dan **1 Telegram Trigger**. Tidak perlu edit n8n, credential, atau database schema. Riwayat jawaban per pegawai tetap dipakai untuk obrolan berikutnya, tetapi panggilan kolektif tidak menerbitkan tugas.

## Pembaruan kapasitas obrolan privat Telegram (1000 pesan/hari)

Untuk percakapan aktif bersama Alya, Bima, Citra, dan Dara, backend kini menerima **maksimal 1.000 pesan pemilik per hari WIB** dengan **jeda minimal 2 detik antar pesan**. Kebijakan ini berlaku konsisten pada database produksi PostgreSQL dan mode lokal SQLite. Pesan baru tidak diblokir pada batas lama 20 pesan; penghitung lama dipertahankan dan dibandingkan dengan kuota baru. Kuota harian berganti pada pukul 00.00 WIB.

- Pesan duplikat dari Telegram tetap dideteksi dan tidak dihitung dua kali; riwayat ID disimpan untuk mencegah pengiriman ulang.
- Penolakan karena jeda memberi pesan jelas untuk menunggu 2 detik; penolakan karena kuota harian memberi keterangan 1.000 pesan dan reset tengah malam WIB.
- Kuota ini **hanya untuk pesan yang dikirim pemilik ke grup**. Notifikasi otomatis 4 bot tetap memiliki pembatas terpisah, maksimum 3 laporan tugas dan 1 obrolan avatar per hari kerja.
- Batas **3 draf Gemini terjadwal per hari** tidak berubah; setiap chat bebas masih dapat memakai satu request Gemini via n8n, sehingga batas/rate limit atau biaya Google AI Studio dan n8n Cloud tetap berlaku secara terpisah.
- Tidak ada workflow n8n, credential, token, atau database schema yang perlu diubah. Tunggu merge dan Vercel Production Ready, lalu tes balasan Telegram dengan jeda 2 detik.


## Perbaikan jam operasional kantor virtual di chat Telegram

Pertanyaan tentang jam masuk/kerja, jadwal kantor, briefing, libur, atau apakah pegawai sedang berada di kantor virtual kini memakai **data `state.schedule` dan `state.phase` asli** dari Anshel. Jangan lagi mengaku kantor tidak memiliki jam masuk atau semua pegawai selalu fleksibel.

- Jadwal bawaan jika belum disesuaikan: Senin–Jumat, kedatangan 08.45 WIB, buka dan briefing 09.00–09.15, istirahat 12.00–13.00, review 16.30, selesai 17.00.
- Jam dan hari yang **diubah lewat dashboard** serta hari libur tersimpan mengalahkan jadwal bawaan. Kata **besok** dihitung berdasarkan kalender Asia/Jakarta, sehingga libur akhir pekan/jadwal khusus disampaikan dengan benar.
- Jika pertanyaan juga memuat **sekarang/lagi di kantor**, bot menjelaskan **fase simulasi saat ini** dan aktivitas avatar bila tercatat, bukan mengaku benar-benar berada di bangunan atau selalu siap bekerja kapan saja.
- Balasan memakai bot karyawan yang dipanggil, tanpa request Gemini tambahan. Hak akses pemilik, pembatasan 1.000 pesan/hari WIB, jeda dua detik, dan penolakan duplikat tetap berlaku. Pesan biasa tetap melalui Gemini.
- Riwayat jawaban Gemini yang keliru seperti **tidak pakai jam masuk** dikeluarkan dari konteks percakapan berikutnya.

**Cara uji lewat HP** setelah PR di-merge dan Vercel Production Ready: ketik `Alya, besok masuk jam berapa di kantor virtual? Lagi di kantor virtual sekarang?` pada grup Telegram. Pada malam hari di luar jam operasional seharusnya dijelaskan status tutup. Tidak perlu impor atau mengubah workflow n8n mana pun.

## Phase 3D — Kontrol status kantor langsung dari Telegram (HP)

Ini perubahan backend saja. Workflow Natural Gemini dan Auto Office yang sudah Published **tidak perlu diimpor ulang**, dan tidak ada credential/Telegram Trigger baru. Hanya Alya, Bima, Citra, dan Dara yang merespons perintah khusus berikut:

- **/ringkasan** atau **/ringkas** → Alya mengirim ringkasan hitungan status tugas dari seluruh divisi berdasarkan `state.counts` (antre, dikerjakan, selesai, terhambat, gagal). Angka status ini adalah **akumulasi tugas tercatat saat ini**, **bukan** jumlah tugas yang selesai hari ini.
- **/kendala** → Bima mengirim jumlah tugas berstatus `blocked`/`failed` serta contoh maksimal tiga tugas yang terlihat di daftar terbaru, hanya menyertakan nama divisi, proyek singkat, dan status. Teks deskripsi pekerjaan, token, log error, dan artefak tidak dikirim. Nol tugas bermasalah **bukan bukti** server telah diperiksa atau sehat.
- **/cek Bima** → Bima mengabarkan salah satu tugas divisinya yang perlu diperhatikan. Bentuk yang sama berlaku untuk **/cek Alya**, **/cek Citra**, dan **/cek Dara**. Perintah `/cek` bagi delapan nama lain secara eksplisit dikembalikan ke Alya dengan keterangan belum aktif pada pilot Telegram.
- **/bantuan** → daftar singkat perintah yang bisa dipakai dari HP. Perintah `/status`, `/tim`, dan `/tugas Nama | instruksi` yang sudah ada tetap berjalan.

Keempat perintah baru diproses secara deterministik tanpa memanggil Gemini; hanya pemilik dan grup Telegram yang telah diizinkan bisa memicu balasan. Batas 1.000 pesan pemilik per hari WIB dan jeda minimal dua detik tetap berlaku. Chat bebas tetap menggunakan Gemini pada workflow Natural Gemini.

### Menguji dari HP setelah PR di-merge dan Production Ready

1. Buka grup Telegram internal Anshel, kirim **/ringkasan** lalu periksa apakah yang membalas Alya.
2. Setelah jeda minimal **2 detik**, kirim **/kendala**. Bima seharusnya membalas dengan status tugas yang tercatat, tanpa mengaku sudah mengecek server.
3. Setelah jeda minimal **2 detik**, kirim **/cek Citra**. Balasan harus datang dari bot Citra.
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
- `/status`, `/tim`, `/bantuan`, dan `/tugas Nama | instruksi` tetap diproses deterministik tanpa biaya Gemini. Pesan dari bot lain diabaikan. Batas 1.000 pesan pemilik/hari WIB dan minimal 2 detik berlaku di kedua alur.
- Tiket sementara 5 menit dan satu kali pakai mengikat hasil AI ke divisi asli. Pesan dikirim memakai token bot divisi; input tidak bebas mengganti pengirim. Jawaban Gemini kosong/error memakai fallback berbasis status, sehingga sebagian pesan dapat kembali berupa template ketika provider bermasalah.

### Penggantian workflow n8n (tanpa menghapus yang lama)

1. Setelah PR di-merge dan **Vercel Production Ready**, unduh `workflows/office_telegram_group_natural.json`, lalu **Import from File** di n8n sebagai workflow baru, simpan Unpublished.
2. Buka node **Pesan grup via Alya** dan pilih **Telegram credential Alya** yang sudah berhasil digunakan.
3. Buka node **Siapkan konteks AI** dan node **Kirim dari bot pegawai**; pilih **Header Auth `Anshel API` yang sudah ada** (nama header `Authorization`, Value `Bearer <N8N_TOKEN>`). Jangan menyalin token ke JSON workflow.
4. Buka node **Gemini obrolan**, pilih **Header Auth credential Gemini** yang sama seperti workflow Gemini Auto Worker sebelumnya (`x-goog-api-key` di Header Auth). Tidak perlu menambah credential lain.
5. Telegram mengizinkan satu webhook aktif per bot: **unpublish workflow lama `Anshel · Grup AI 12 pegawai — chat pemilik` sebelum menjalankan/Publish workflow baru**. Simpan workflow lama untuk rollback; jangan aktifkan dua Trigger Alya bersama.
6. **Test Workflow** baru dengan pesan `Alya, hari ini ada apa?`, lalu `Bima, kamu bisa bantu apa?`, `Citra, kita tadi bahas apa?`, dan `Dara, kabar?` (masing-masing beri jeda minimal 2 detik). Periksa node Gemini, status **ai:true** pada node pengiriman, dan variasi jawaban sesuai karakter bot. Bandingkan dengan data kantor nyata.
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
5. Di grup, kirim dari akun pemilik: /bantuan, Eka, progresnya gimana?, /tanya Kirana | ada tugas QA?, dan /tugas desain | Buat tiga konsep desain fiktif. Jeda minimal 2 detik antara pesan. Perintah /tugas benar-benar menambah draf ke antrean; pengerjaannya mengikuti jadwal dan kuota worker yang sudah ada.
6. Setelah tes privat berhasil, Publish kedua workflow. Unpublish untuk menghentikan aktivitas otomatis. Jangan Publish Telegram Trigger lama Alya bersamaan.

Keamanan: pesan dari akun bot diabaikan; ID grup/pemilik diperiksa ulang di backend; token N8N digunakan pada API; maksimum 1.000 pesan owner per hari WIB, minimum 2 detik antar pesan, update ID diproses sekali. Pesan status memuat divisi, proyek singkat, ID tugas; tidak pernah mengirim teks tugas, artefak, detail error, atau token. Pengiriman terjadwal hanya pada jam kantor, bukan setiap malam. Jika Telegram sudah menerima pesan tetapi ACK gagal, pengiriman ulang dapat terjadi setelah lease 10 menit. Panggilan satu event belum menjamin tepat satu kali secara mutlak.

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
