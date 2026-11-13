# Anshel Virtual Tech — audit dan roadmap

Audit 11 November 2026 WIB. Baseline lokal `ccb479f` pada `main`. Brief terbaru menjadi acuan. Kantor tetap satu lantai, fullscreen, privat, dengan 12 divisi. Jas formal dicadangkan untuk avatar Dika. Pilihan pasangan tetap kosong, dengan pilihan kelak terbatas pada karakter perempuan yang sudah ada dan dipilih Dika.

## Phase 0 · Baseline

- Working tree bersih sebelum perubahan. Repo lokal belum memiliki remote. GitHub API mengembalikan `private: false` dan daftar branch kosong untuk [AnshelVirtual](https://github.com/dikadwi1005-ai/AnshelVirtual). Persetujuan Dika diperlukan untuk mengatur visibilitas, push, perubahan Vercel, dan layanan berbayar.
- `.env`, `data/`, dan `.asset-import/` diabaikan Git. Snapshot dibuat di `data/backups/office-2026-11-11T11-19-16-891Z.sqlite`. Pemeriksaan ulang read-only memberi `integrity_check = ok`, tiga tabel, masing-masing 0 baris. SHA‑256 `fe37e04f88a35e8a30edf3f2fb6e3a5ea4c720047681fa4f2f58c9cc4f67308c`.
- 15 tes baseline lulus, termasuk proses worker nyata, lease, penyelesaian artefak, pembatalan, izin dan jadwal. Node menjalankan TypeScript langsung dan server menyajikan modul serta aset dari disk. Skrip build produksi dan target Linux/Vercel belum tersedia. Pengujian dilakukan pada Windows.
- Baseline Chrome 1440 × 900, Radeon terintegrasi D3D11, median 11,1 ms, p90 11,2 ms dari 60 interval frame di overview siang. Angka ini belum mewakili mode malam, close-up ramai atau mobile. Bukti visual berasal dari database uji terisolasi.
- Render ulang roster menunjukkan model awal Alya memakai penyangga tangan, Galih memakai jas, Indra memakai seragam polisi, serta Kirana dan Laras memakai aset laki-laki. Penamaan mesh hanya `body-mesh` dan `head-mesh`, sehingga inspeksi model penuh diperlukan untuk mendeteksi perlengkapan yang menyatu dengan mesh.

## Gap terhadap brief

| Bagian | Yang ada | Pekerjaan tersisa |
| --- | --- | --- |
| 1, 2, 13, 27 | Satu lantai, 12 divisi, ruang Dika, HUD overlay, orbit/pan/zoom, mode siang/malam WIB | Ganti pola grid empat baris dan koridor lurus dengan lingkungan tim, hub kolaborasi, fokus/pod kaca dan lanskap. Variasikan workstation tiap divisi dan buat ruang Dika terhubung ke data proyek dan persetujuan. |
| 3, 28 | Aset Kenney dan Innerscene dengan manifest CC0 serta checksum | Gunakan profil eksplisit, aset kompatibel, dan verifikasi visual. Tambah katalog skala, orientasi, pemakaian dan attachment. Perlu set duduk, alat kerja, konsol dan controller legal yang serasi. |
| 4, 5 | A*, jejak penghalang, reservasi anchor, gerak menuju meja, beberapa rutinitas dan animasi kerja yang mengikuti task | Kalibrasi kursi per rig, foot contact, pose dan transisi interaksi. Ukur clearance karakter saat bergerak bersama. Tambah attachment tangan, minum, makan, membaca, tidur, presentasi, serta state energi, fokus, sosial, hiburan dan mood. |
| 6, 7, 10, 11 | Anchor sosial sederhana serta audit penyelesaian tugas | Buat formasi dan giliran bicara, bubble dan riwayat, TTS opsional dengan subtitle/lip sync/audio spasial, serta event berjadwal dan rapat dengan kursi, layar, notulen dan tindakan lanjutan. |
| 8, 9 | Monitor dekoratif dengan bidang CanvasTexture statis, laptop tanpa konten layar aktif, lounge dengan arcade dan TV | Petakan UV pada permukaan perangkat. Tampilkan idle/menunggu/aktif dari backend, data kerja tersanitasi dan panel per tugas. Ganti arcade dengan satu PS5 legal, dua controller, animasi gameplay orisinal, dan pose bermain. |
| 12, 14, 15, 16, 17, 26 | Audit tugas, kamera observasi, jadwal dan status task persisten | Tambah handover dari event nyata, avatar Dika dan kontrol desktop/sentuh, cinematic/hide HUD, layout editor tervalidasi dengan undo/redo, audio kategori, persistensi state sosial/logis, replay dan video berdasarkan event. |
| 18, 19, 20, 21, 22, 23 | SQLite WAL, worker lokal diagnostik/Ollama, antrean dan artefak teks, Telegram allowlist, dua workflow n8n nonaktif, konfigurasi WIB | Worker cloud, adapter provider, progres terverifikasi dan jejak eksekusi, storage artefak, notifikasi dan approval Telegram, mode terjadwal dengan batas kuota, integrasi GitHub/SEO/video/Instagram, adaptor Nation City terisolasi. |
| 24, 25 | Sesi lokal dalam memori, token terpisah untuk worker dan n8n, origin check, CSP, pembatas login, backup SQLite | Sesi privat lintas instance HTTPS, rate limit persisten, allowlist tindakan, autentikasi callback, migrasi terverifikasi, rilis repo/deployment privat, backup dan pemulihan cloud. |
| 29, 30, 32, 33 | Batching statis, render browser dan tes lokal | Ukur profil frame ramai/dekat/jauh/siang/malam/mobile, validasi replay dan perangkat sentuh, dan selesaikan Visual Approval Gate dengan rekaman aktual. |

## Arah arsitektur visual

Tempatkan hub kolaborasi dan coffee corner sebagai pertemuan jalur. Letakkan pengembangan dan QA dalam studio terbuka, IT dalam area rak berpintu, produksi video di studio yang bisa diisolasi, serta riset dekat area baca dan pod fokus. Pasang meeting pod kaca pada simpul sirkulasi, dengan ruang Dika dan penerimaan memiliki jalur tamu yang jelas. Geometri render, collider dan anchor perlu memakai konfigurasi yang sama. Adaptasi ruang komunal di St. John’s Terminal, lingkungan tim dan akses cahaya Bay View, serta keragaman ruang bersama Singapura menjadi tata ruang asli Anshel. [St. John’s Terminal](https://blog.google/company-news/inside-google/life-at-google/google-nyc-st-johns-terminal-office/) · [Bay View](https://blog.google/company-news/inside-google/life-at-google/bay-view-campus-grand-opening/) · [Singapura](https://blog.google/company-news/inside-google/around-the-globe/google-asia/new-home-google-singapore/).

## Rencana migrasi cloud

**Kandidat awal.** Gunakan Vercel untuk aset frontend dan API HTTPS berdurasi pendek, Postgres terkelola (Neon sebagai kandidat awal) untuk status dan transaksi tugas, serta object storage privat (Vercel Blob sebagai kandidat awal) untuk artefak besar. Cloudflare D1 cocok bila routing database dipindah ke ekosistem Workers atau memakai API jarak jauh. Untuk rencana Vercel, Postgres pooled lebih langsung bagi transaksi antrean lintas koneksi dan kontrol konkurensi. Finalisasi provider setelah cek kuota, lokasi data dan tipe penggunaan. [Vercel Functions](https://vercel.com/docs/functions/limitations) · [Neon](https://neon.com/pricing) · [Cloudflare D1](https://developers.cloudflare.com/d1/platform/pricing/) · [Vercel Blob privat](https://vercel.com/docs/vercel-blob/private-storage).

**Cutover.** Definisikan antarmuka store, jalankan tes kontrak SQLite dan Postgres, lalu migrasikan snapshot ke staging. Pertahankan ID, waktu, relasi audit, status, checksum dan jadwal. Validasi jumlah per tabel dan hasil unduh. Tahan intake saat cutover final, ekspor perubahan terakhir, lalu alihkan endpoint n8n sekali. Simpan snapshot read-only dan prosedur rollback. Tugas yang masih leased harus direkonsiliasi sebelum dilepas agar eksekusi ganda tidak terjadi.

**Eksekusi.** Telegram owner → n8n Cloud → API tervalidasi → adapter Gemini atau GitHub Actions → callback autentik → database dan artefak privat → status di kantor dan laporan Telegram. Pakai kunci idempotensi per permintaan dan ID eksekusi unik, verifikasi hasil dan checksum, lalu catat status terminal. Retry terbatas untuk timeout/transient, jeda saat kuota habis. GitHub hanya workflow/parameter/repo allowlist. Pisahkan kredensial baca dari perubahan repo, pembelanjaan atau publikasi. Otorisasi UI dan API sebelum menyajikan data, gunakan cookie aman dan rate limit berbagi state. [GitHub Actions dan kuota](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions) · [Gemini API](https://ai.google.dev/gemini-api/docs/pricing).

**Konfigurasi dari Dika.** Persetujuan visibilitas repo, push dan deployment. Akses proyek Vercel serta tipe penggunaan karena Hobby terbatas pada penggunaan pribadi nonkomersial. Persetujuan provider database/storage, region, kuota dan retensi. Di tahap integrasi, simpan secret sesi, token callback, kredensial Telegram owner dan bot, Gemini API key, serta akses GitHub yang dibatasi, lewat secret store masing-masing. Free tier Gemini dapat memakai konten untuk peningkatan produk. Gunakan input nonrahasia yang disetujui atau provider dengan kebijakan data yang sesuai. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Harga dan penggunaan data Gemini](https://ai.google.dev/gemini-api/docs/pricing).

## Fase dan kriteria penerimaan

| Fase | Checkpoint penerimaan | Tes master |
| --- | --- | --- |
| 0 · Baseline | Audit repo/worker/data/aset, snapshot berintegritas, foto kantor dan roster, baseline tes dan frame time. | Baseline C, D, K, L |
| 1 · Pemulihan visual | Satu denah natural, 12 divisi, profil eksplisit, outfit benar, rute tanpa clipping yang teramati, duduk, formasi percakapan, layar menyatu, PS5 dan TV bergerak. Inspeksi siang/malam, close-up dan mobile. Rekam idle → tugas → berjalan → duduk → kerja → selesai → santai. | C, D, F, G, J |
| 2 · Migrasi cloud | Aplikasi privat aktif di URL Vercel yang diuji, migrasi rekonsiliasi data/artefak, otorisasi negatif dan backup/restore. Endpoint produksi hanya memakai layanan cloud saat worker lokal mati. | B, K, L |
| 3 · Worker cloud awal | Tugas nyata dan artefak untuk Manajemen, Pengembangan, Riset, SEO, dan Administrasi. Telegram hasil terverifikasi, timeout/kuota menghasilkan status akurat. | A, B, I |
| 4 · Living Office | Kebutuhan, relasi, mood, aktivitas, event, percakapan kontekstual, bubble, riwayat, TTS/lip sync/subtitle/audio spasial dengan fallback. Rekaman dua dan beberapa peserta berjarak. | E, K |
| 5 · Sistem interaktif | Director/Character Mode, avatar Dika, panggilan karyawan, monitor interaktif, editor layout undo/redo, rapat dengan presentasi/notulen dan handover berdasarkan event. | D, F, H, J |
| 6 · Produksi dan otomasi | Replay, video ringkasan sesuai event dengan opsi vertikal, pipeline sejarah/video/Instagram, scheduler berkebijakan, adapter Nation City baca dahulu dan review perubahan. | A, H, I, K |
| 7 · Stabilisasi | Regresi A–L, security review, mobile fisik, pemulihan cloud, pemantauan biaya dan batas kuota, serta penerimaan visual akhir. | A–L |

Pada tiap checkpoint catat perubahan dan file, fitur berfungsi serta sisa, hasil tes, bukti visual dan rekaman yang relevan, performa, masalah, commit, cara verifikasi, biaya dan konfigurasi eksternal. Gunakan status Implemented, Tested, Visually Verified, Cloud Verified, Pending Credentials, Pending Approval, Blocked atau Not Implemented sesuai bukti. Perbaikan satu komponen belum meloloskan Visual Approval Gate.

## Checkpoint Phase 1 · Roster

**Implemented dan Visually Verified.** Renderer memakai `public/employee-profiles.js` untuk memilih profil berdasarkan divisi, dengan ID pegawai stabil, konfigurasi tampilan, tinggi, outfit dan aset. `public/employee-look.js` memeriksa rig berjalan/duduk dan membuat varian warna atlas badan. `public/actors.js` memakai profil untuk model dunia, dan `public/app.js` menampilkan outfit serta tampilan di panel karyawan. Pemilihan tampilan Kirana dan Laras sebagai perempuan dicatat eksplisit dan bisa disunting. Dua belas varian memakai tujuh mesh dasar yang telah dirender.

Inspeksi roster di Chrome membandingkan pose berjalan 12 profil sebelum dan sesudah. Model berpenyangga tangan, seragam polisi dan jas keluar dari daftar model yang dapat dipilih renderer. Alat bantu dengar Bima tetap bagian dari model kasualnya. Median overview 1440 × 900 tetap 11,1 ms pada perangkat uji yang sama. Verifikasi lokal dengan `npm.cmd test`, lalu buka **Ruang → Manajemen → Alya** untuk melihat profil dan model di scene. Checkpoint ini memakai aset CC0 lokal dan tanpa konfigurasi eksternal.

**Tested.** 16 tes lulus. Rekaman Chrome 1280 × 720 memperlihatkan Alya meninggalkan area sosial, berjalan, duduk, bereaksi terhadap penyelesaian, lalu kembali bersosialisasi. Browser memeriksa status menunggu worker, status eksekusi, dan unduhan. Eksekusi pada rekaman dikendalikan oleh fixture SQLite melalui kontrak yang sama. Tes integrasi terpisah menjalankan proses worker diagnostik nyata.

**Sisa Phase 1.** Tata ruang organik, pencahayaan, koreksi seating/foot placement, formasi sosial, layar perangkat dan lounge PS5 masih memerlukan implementasi serta audit visual. Model avatar jas Dika dijadwalkan pada Character Mode.

## Checkpoint Phase 1 · Denah dan pencahayaan

**Implemented.** Tapak satu lantai kini memiliki 12 area divisi dan 9 area bersama. Resepsionis, pantri, lounge, dan sayap kerja dihubungkan oleh jalur berbelok yang bertemu di atrium. Pengembangan dan studio desain terbuka. Pod rapat, produksi video, ruang Dika dan IT memiliki partisi kaca, dengan bukaan pintu yang terhubung ke jalur. Material kayu, ubin netral, kain beraksen, dan pencahayaan malam hangat membedakan area. Furnitur dan partisi membentuk penghalang untuk A*. Tapak bersegi dan area yang dirender juga dipakai untuk batas navigasi dan pemilihan area. Kode utama berada di `public/layout.js`, `public/world.js`, `public/furnishings.js`, `public/navigation.js` dan `public/scene.js`.

**Verifikasi lokal.** Jalankan `npm.cmd test`, buka **Ruang → Atrium Kolaborasi**, lalu pakai ikon matahari/bulan. Tes geometri memeriksa keterjangkauan seluruh area, rute ke 12 workstation, batas tapak, pintu, anchor, dan jejak furnitur. Checkpoint memakai aset yang sudah ada di manifest. Kalibrasi duduk, formasi percakapan yang tersinkron, layar perangkat animasi, PS5, dan uji perangkat sentuh fisik masih terbuka.

**Tested dan Visually Verified untuk denah.** Seluruh 16 tes lulus. Chrome menampilkan 21 label pada overview 1440 × 900 dan membuka close-up atrium, pod rapat, Pengembangan, Kreatif & Desain, dan ruang Dika. Median interval frame 11,1 ms dan p90 11,3 ms dari 60 sampel overview siang pada Radeon terintegrasi D3D11. Screenshot malam memakai pengalih pencahayaan. Uji mobile dilakukan pada viewport Chrome 390 × 844.

Rekaman Chrome menunjukkan Alya meninggalkan atrium, berjalan ke meja Manajemen, duduk, bereaksi setelah tugas selesai, lalu kembali ke atrium. Siklus browser memakai fixture SQLite dan menguji status antrean offline, status kerja, unduhan, serta pergerakan. Tes worker diagnostik terpisah menjalankan proses aktual.

## Checkpoint Phase 1 · Layar workstation

**Implemented.** Monitor, laptop dan TV memakai tekstur langsung pada permukaan layar asli aset Kenney. `public/displays.js` memilih tampilan sesuai divisi dan memusatkan kamera pada perangkat yang dipilih. `public/display-state.js` membedakan layar siap, worker offline, antre, terhambat, dan aktif dari status backend. Editor, konsol, artboard, kalender dan timeline memakai visual generik. Tampilan video belum mendapat media pratinjau. Data tugas tersedia di panel privat dengan waktu WIB, progres yang dilaporkan worker, log, cuplikan hasil, checksum dan tautan unduhan. Perubahan snapshot di `server/store.ts` memakai data yang sudah tersimpan tanpa migrasi. Checkpoint ini tidak memerlukan konfigurasi atau biaya eksternal.

**Verifikasi lokal.** Buka **Ruang → Pengembangan → Periksa layar → Fokus monitor** atau klik permukaan monitor setelah mendekat. Buat tugas diagnostik dan jalankan worker lokal untuk melihat perubahan dari antrean ke eksekusi dan artefak. Layar memakai tekstur bersama per divisi dan pembaruan animasi hanya saat kamera cukup dekat.

**Tested dan Visually Verified.** Seluruh 19 tes lulus, termasuk proses worker diagnostik nyata dan pemeriksaan geometri tiga aset. Chrome menguji klik langsung pada monitor Pengembangan, laptop Kreatif & Desain dan TV Pod Rapat. Pengujian memakai fixture SQLite untuk status antrean offline, animasi saat eksekusi, dan cuplikan serta unduhan artefak. Rekaman timeline diputar ulang di Chrome. Panel laptop diperiksa pada viewport 390 × 844. Performa kantor ramai dan sentuhan pada perangkat fisik masih perlu diukur.

**Pose duduk.** Dika memilih pose duduk chibi bawaan, dengan kaki yang boleh menggantung. Pose ini dipertahankan untuk kursi kerja, pod rapat, dan sofa.

**Sisa Phase 1.** Formasi percakapan, lounge PS5 dengan animasi gameplay, serta pengujian visual akhir.

## Checkpoint Phase 1 · Formasi percakapan

**Implemented.** Atrium Kolaborasi, Resepsionis dan Teras Taman masing-masing memiliki empat posisi berdiri. Karakter memesan posisi, berjalan melalui navigasi yang sudah ada, dan mulai berbicara setelah minimal dua peserta tiba. Pasangan memakai posisi berseberangan. Dalam grup, pembicara menghadap lawan bicaranya dan pendengar mengikuti pembicara. Tugas aktif atau antre mengeluarkan pegawai dari percakapan. Dialog ditulis untuk konteks ruangan dan boleh merujuk antrean ketika backend mendeteksi tugas antre. Bubble muncul saat kamera cukup dekat. `public/furnishings.js` mendefinisikan posisi, `public/conversations.js` mengatur kelompok dan giliran, dan `public/actors.js` serta `public/scene.js` menerapkan gerak dan tampilan.

**Tested dan Visually Verified.** 21 tes lulus. Chrome 1440 × 900 memverifikasi pasangan berhadapan, peserta ketiga berjalan masuk dan mendapat giliran, jarak antarpeserta minimal 1,56 m selama pengukuran, serta perpindahan dari percakapan saat peserta mendapat tugas uji. Bubble diperiksa pada viewport 390 × 844. Percakapan berjalan lokal tanpa biaya tambahan. TTS, riwayat persisten, dan relasi antarkaryawan masih masuk Phase 4.

Rekaman 1152 × 720 berasal dari frame Chrome yang menyertakan bubble. Overview siang mencatat median interval frame 11,1 ms dan p90 11,2 ms dari 90 sampel pada Radeon terintegrasi D3D11.

**Sisa Phase 1.** Lounge PS5 dengan animasi gameplay dan pemeriksaan visual akhir.

## Checkpoint Phase 1 · Monolog, lounge PS5, dan pemeriksaan visual

**Implemented.** `public/conversations.js` menambahkan monolog pendek saat pegawai sendiri di meja, mengambil kopi, membaca, bersantai, menunggu teman atau berjalan di teras. Antarmuka memakai satu bubble dengan jeda antarmonolog. Dialog berasal dari variasi kalimat yang ditulis dalam proyek. OpenAI Responses API dapat ditambahkan dari server untuk variasi generatif jika Dika memilih mengaktifkannya. [Dokumentasi resmi OpenAI](https://developers.openai.com/api/docs/quickstart).

Lounge memakai satu konsol orisinal bergaya PS5, dua controller yang berpindah dari meja ke tangan pemain, sofa dua tempat, dan TV yang memutar Anshel Circuit. Balapan dibuat di `public/lounge-game.js` dan digambar langsung pada layar TV. Pemain berjalan ke sofa, memakai pose duduk chibi, dan bereaksi ketika lintasan mencapai checkpoint. TV memutar demo jika pemain belum duduk. `public/lounge.js` membuat konsol, controller, dekorasi dan pencahayaan. Tidak ada footage atau aset konsol pihak ketiga yang ditambahkan.

**Tested dan Visually Verified.** 23 tes lulus. Chrome memverifikasi monolog di meja, jeda bubble, perubahan frame TV, klik layar TV, dua pemain mencapai sofa dengan controller berbeda dan bereaksi pada checkpoint. Pemeriksaan visual mencakup seluruh kantor satu lantai pada siang dan malam, close-up Manajemen, Pengembangan, Kreatif & Desain, Produksi Video, SEO, IT & Operasional, ruang Dika dan lounge. Pemeriksaan memicu perubahan warna lantai lorong, dinding aksen dan keseimbangan cahaya siang agar furnitur serta karakter lebih mudah dibedakan. Bukti visual memakai database uji dan simulasi pemain di Chrome. Uji ponsel memakai viewport 390 × 844. Perangkat sentuh fisik dan penilaian Dika atas tampilan akhir masih terbuka.

Sofa santai diperlebar untuk mengatasi tangan yang menembus sandaran lengan dengan pose chibi yang sama. Chrome menguji Fullscreen API, denah penuh di viewport ponsel, fokus TV dengan dua pemain, dan alur Alya dari menerima tugas sampai kembali bersosialisasi. Rekaman lounge 1152 × 720 diputar ulang di Chrome. Overview siang pada Radeon terintegrasi D3D11 mencatat median interval frame sekitar 11,1 ms.

## Checkpoint Phase 2 · Rekonsiliasi dan pemulihan data

**Cloud Verified untuk layanan dan akses privat.** Perbaikan loading mobile masuk ke `main` melalui PR #2 dan modulnya diverifikasi pada URL production. Dika juga mengonfirmasi kantor tampil di HP. Audit baca-saja pada Supabase menemukan 2 pengaturan, 2 kejadian audit, dan 0 tugas maupun artefak. SQLite sumber lolos pemeriksaan integritas dan berisi 2 pengaturan, 4 kejadian audit, dan 0 tugas. Perbedaan riwayat dicatat dan importer tidak dijalankan terhadap production. Role `anon` dan `authenticated` tidak memiliki akses ke skema `anshel`. Tidak ada heartbeat worker tercatat saat audit cloud.

**Implemented dan Tested untuk pemulihan.** Importer SQLite memeriksa snapshot, checksum dan status tugas. Di PostgreSQL, ia mengunci tabel target dan membandingkan isi setiap baris sebelum commit. Pada PostgreSQL 17 lokal, fixture berisi 2 tugas dan 1 artefak dipindahkan dari SQLite, dicadangkan dengan `pg_dump`, lalu dipulihkan ke database terpisah dengan `pg_restore`. Isi baris, SHA-256 hasil unduh, aturan akses, logout, antrean dan nomor urut tugas berikutnya cocok. Percobaan dengan tugas berjalan, artefak rusak, isi baris berbeda dan target berisi data gagal tanpa menimpa target. [Prosedur backup dan restore](cloud-recovery.md).

**Cloud backup verified.** Snapshot baca-saja production pada 12 November 2026 disimpan sebagai SQL lokal dengan checksum. Pemulihan di PostgreSQL 17 terpisah menghasilkan checksum isi yang identik. Pekerjaan cloud nyata dari n8n dan Gemini beserta bukti hasil menjadi checkpoint berikutnya. Artefak yang diuji berupa teks tersimpan di PostgreSQL.

## Checkpoint Phase 3 · Pilot worker Gemini

**Implemented dan Tested.** Workflow manual `office_gemini_pilot.json` mengambil tepat satu draf melalui UUID dan menyimpan hasil lengkap lewat kontrak worker. Rute baru mengharuskan token worker dan mengikuti jadwal, izin tugas mendesak, serta sewa eksekusi yang sudah ada. Uji n8n 2.47.4 dengan PostgreSQL 17 dan respons Gemini tiruan membuktikan tugas terpilih selesai, tugas lain tetap antre, eksekusi ulang tidak memanggil provider, respons 429 membuat tugas terhambat, dan unduhan privat cocok dengan SHA-256. Build dan 33 tes lulus.

**Pending Credentials dan deployment.** Pilot belum diimpor ke n8n Cloud. Pengujian live memerlukan endpoint baru di deployment yang dipakai, kredensial worker yang cocok dengan deployment, serta kredensial Gemini di n8n. Telegram dan peluncuran otomatis masih terbuka. [Panduan pilot](../workflows/README.md#pilot-satu-tugas-gemini).

## Checkpoint Phase 3 · Workflow satu draf dari antrean

**Implemented in branch; pending live verification.** Ditambahkan workflow n8n `workflows/office_gemini_queue.json` untuk mengambil **satu** draf berikutnya melalui `POST /api/worker/claim` tanpa mencari UUID dari `/api/state`. Workflow secara sengaja tetap manual (`active:false`) dan tidak memiliki Schedule Trigger supaya tidak menghasilkan biaya/kuota AI tanpa persetujuan. Pemeriksaan kredensial, batas jam kerja, prioritas, pembatasan per divisi, penyimpanan dan SHA-256 tetap mengikuti backend yang sudah ada. Workflow pilot UUID lama dipertahankan, tidak diganti.

Tes regresi `test/gemini-queue.test.ts` menargetkan: autentikasi negatif, prioritas satu tugas, draf kedua tetap antre, konteks divisi, tidak membocorkan lease ke Gemini, heartbeat, penyelesaian dan checksum. **Tes CI, import n8n Cloud, dan eksekusi live belum diverifikasi** pada saat checkpoint ini disiapkan.

**Berikutnya:** jalankan `npm.cmd test` serta build, lalu impor workflow baru secara terpisah dan uji dua tugas nonrahasia. Sesudah lulus, rancang scheduler dengan kuota/biaya dan notifikasi Telegram. Kemampuan gambar, video, dan kode dengan aksi GitHub masih merupakan adapter yang memerlukan pekerjaan dan izin berbeda; alur ini tetap hanya menghasilkan draf teks.

## Checkpoint Phase 3 · Penjadwalan Gemini terbatas

**Implemented on branch; pending tests and deployment.** Endpoint baru `/api/worker/claim-scheduled` memerlukan token worker dan hanya mengizinkan klaim draf selama fase kerja yang sah. Kuota harian tiga klaim dihitung per tanggal WIB dan dicatat atomik dalam transaksi SQLite/PosgreSQL bersama perubahan status tugas, dengan advisory lock cloud yang sudah dipakai worker. Menggunakan tabel `anshel.setting` yang sudah ada; tidak membuat tabel/kolom baru. Hitungan bertambah hanya jika berhasil mengklaim satu tugas; tidak dihitung ulang saat provider gagal. Worker manual/UUID tetap berfungsi seperti sebelumnya.

File `workflows/office_gemini_scheduled.json` menggunakan Schedule Trigger tiap 20 menit pada hari kerja 09.00–16.40 WIB, **nonaktif sampai di-publish**. Tidak ada publikasi Telegram atau penggunaan AI tanpa persetujuan. Tes baru `test/gemini-scheduler.test.ts` memeriksa batas tiga, kuota reset, jadwal libur, mode manual, autentikasi, dan pencegahan pemborosan saat antrean kosong. **Belum ada pengujian langsung n8n Cloud / CI penuh**; lakukan pengecekan sebelum merge dan aktifkan setelah verifikasi produksi.

## Checkpoint Phase 3 · Notifikasi Telegram per tugas

**Disiapkan sebagai PR, belum aktif.** Endpoint integrasi token `/api/integrations/notifications/claim` dan `/ack` membaca audit status terminal `completed`, `failed`, dan `blocked`. Cursor dan sewa pengiriman persisten di `anshel.setting`; transaksi dan advisory lock memisahkan klaim notifikasi dari klaim worker. Pada polling pertama cursor diinisialisasi ke event terakhir agar tidak mengirim backlog historis. ACK memerlukan ID dan token sewa yang benar dan dilakukan **setelah** node Telegram sukses. Crash sebelum ACK dapat menyebabkan pengiriman ulang setelah lease 10 menit; tidak ada klaim exactly-once.

Workflow `workflows/office_telegram_notifications.json` terpisah, nonaktif sampai Publish, polling tiap 30 menit, tanpa kredensial hardcoded atau payload tugas/hasil sensitif. `N8N_TOKEN`, `TELEGRAM_CHAT_ID`, dan kredensial Telegram diatur terpisah. Butuh pengujian n8n Cloud langsung dan persetujuan aktivasi sebelum digunakan.

## Checkpoint Phase 3 · Telegram grup 12 pegawai AI

PR #7 dikembangkan ulang dari notifikasi satu bot menjadi grup Telegram 12 identitas bot. Alya menjadi satu Telegram Trigger untuk pesan pemilik; backend mengirim pesan melalui token privat masing-masing pegawai. Input dibatasi dengan ID grup dan pemilik, verifikasi N8N_TOKEN, deduplikasi update serta batas 20 pesan owner/hari dan jeda 8 detik. Worker mengikuti audit pekerjaan yang nyata dan satu event menghasilkan maksimal dua pesan antarkaryawan. Perintah /tugas pegawai | deskripsi menambahkan draf dengan idempotensi tanpa langsung menjalankan Gemini. Workflow terjadwal 09.00-17.30 WIB setiap 30 menit, workflow grup masuk terpisah, keduanya nonaktif sampai pemeriksaan. Bukan obrolan Gemini generatif bebas. Belum diuji terhadap Telegram Bot API sungguhan atau suite npm penuh.

## Checkpoint Phase 3B — Natural Telegram AI chat

PR berikutnya menambah dua endpoint `office-group/ai/prepare` dan `office-group/ai/finish`, tiket satu-kali-pakai, memori singkat per divisi di anshel.setting, 12 persona yang berbeda, prompt berbasis status tugas, serta alur n8n baru yang memakai kredensial Gemini lama. Workflow Telegram lama tidak diubah dan tetap sebagai rollback. Perintah kantor tetap deterministik. Batas pesan tetap 20 per hari WIB, jeda 8 detik; percakapan bebas dapat memakai kuota Gemini terpisah. Tidak mengaktifkan bot maupun workflow pada Vercel/n8n secara otomatis; perlu pemeriksaan CI dan uji n8n langsung.

## Checkpoint Phase 4 · Living Office

Implementasi, cara menguji, hasil pemeriksaan 12 pegawai, dan batas verifikasi dicatat di [checkpoint Living Office](phase-4-living-office.md).

## Checkpoint Phase 5 · Mode karakter

Mode pengamat dan **Main sebagai Dika** dapat ditukar dari kontrol kamera. Kamera mengikuti Dika saat memakai WASD, tombol panah, atau tombol sentuh. Avatar mulai dari Ruang Dika dan memakai model jas dari aset lokal. Geraknya menghormati penghalang denah dan jarak dari pegawai.

**Pengaturan → Pasangan Dika** menyimpan pilihan di browser. Pilihan awal kosong. Pegawai perempuan yang dipilih memakai jas dan dasi senada sambil mempertahankan wajah, rambut, dan rutinitasnya. Menghapus pilihan mengembalikan pakaian aslinya.

**Tested dan Visually Verified.** Build dan 165 tes lulus. Chrome lokal menguji keyboard, tekan dan tahan pada viewport sentuh 390 × 844, kembali ke pengamat, pilihan pasangan setelah reload, gerak diagonal, geser sepanjang penghalang, serta pemulihan pakaian. Gambar lokal mencakup mode Dika di desktop dan ponsel serta perbandingan jas. Perangkat sentuh fisik belum diuji. Panggilan pegawai, editor denah, dan rapat interaktif masuk checkpoint berikutnya.

**Kamera third-person.** Mode Dika memakai kamera perspektif di belakang bahu. Seret area 3D untuk memutar pandangan dan gunakan kontrol zoom untuk mengubah jarak. Tombol reset mengembalikan kamera ke belakang Dika. Arah berjalan mengikuti pandangan, sementara kamera mendekat saat dinding menghalangi jalurnya. Mode pengamat tetap memakai kamera denah.
