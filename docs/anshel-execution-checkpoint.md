# Checkpoint Studio, kota, dan integrasi

Baseline GitHub yang diaudit adalah `fe69de2`. Baseline sudah mencakup Phase 10.1 WIP serta delapan commit pemantauan worker/Telegram. Catatan Phase 8–10.1 dan manifest aset menjadi rujukan. Pengujian baru memakai Chrome lokal dan SQLite dalam memori.

| Bagian | Status pada baseline | Perubahan checkpoint | Acceptance terbuka |
| --- | --- | --- | --- |
| Replay dan storyboard | Implemented | Kamera bergerak per potongan, termasuk kantor, kampus, 12 rumah, dan zona kota | Arsip pose tidak merekam state trafik historis. Trafik latar memakai runtime kota saat preview/render. |
| Episode MP4 | Partially Implemented | 1080 × 1920, H.264/AAC bila tersedia, impor WebVTT mengikuti jam narasi, volume terpisah, draf IndexedDB | Render server, Safari fisik, subtitle otomatis untuk rekaman impor |
| Trotoar kota | Broken | Bidang trotoar diputus pada persilangan aspal. Marka lajur berhenti sebelum persimpangan. | Elevasi pada batas kampus lama dan inspeksi perempatan dari level jalan |
| 21 ruang dan 12 rumah | Partially Implemented | Geometri dan identitas lama dipakai untuk shot Studio | Audit visual ulang, perpindahan rumah ke kavling kota, migrasi rute, transportasi pegawai |
| Pegawai, kendaraan, dan kurir | Partially Implemented | Simulasi dan kontrak snapshot lama tetap dipakai | NPC dengan tujuan, parkir dinamis, rutinitas komuter, stress test panjang |
| Antrean dan tujuh bot | Not Externally Verified | Panel privat menunjukkan waktu sinyal terakhir dan tugas yang menunggu setidaknya dua jam. Status jeda serta alasan error tetap dari catatan tugas. | Verifikasi n8n Published, eksekusi Gemini, seluruh akun Telegram, serta korelasi execution dengan ID tugas |
| Auto Office dan Studio Scheduler | Not Externally Verified | Kontrak, flag, batas percobaan, dan lease yang sudah tersedia dipakai | Pemeriksaan tick nyata saat laptop mati dan flag runtime Production |
| Nation City | Partially Implemented | Status kesehatan baca memakai bukti respons, status sumber, dan cache. Field `connection` v1 tetap kompatibel. | Endpoint otentik dan identitas wilayah Production, alur outbound |
| Pegawai manusia dan kredit game | Missing | Kontrak modul dan batas akses dirancang di bawah. | Implementasi, uji akses, dan keputusan pemilik mengenai kebijakan operasional |

## Membuat episode berikutnya

1. Buka **Studio → Storyboard**. Ambil topik dari aktivitas, rapat, atau hasil kerja yang benar-benar tercatat. Susun teks untuk adegan yang dipilih.
2. Buka **Replay**, pilih rekaman, lalu **Muat rekaman**. Pilih kamera dan rentang untuk setiap potongan. Susun paling banyak delapan potongan sepanjang total 90 detik. **Preview urutan** memperlihatkan gerak kamera.
3. Pilih **9:16** dan **MP4**. Masukkan rekaman suara Indonesia, WebVTT dengan teks dari rekaman yang sama, dan musik berlisensi bila diinginkan. Atur volume masing-masing. Waktu WebVTT mulai dari detik ke-0 audio narasi dan mengikuti seluruh urutan potongan.
4. Tekan **Simpan draf episode** sebelum ekspor. Browser menyimpan satu draf beserta pose dan berkas media. Tekan **Buka draf episode** setelah memuat ulang. **Hapus draf** menghapus salinan file dari penyimpanan draf browser. Gunakan perangkat privat untuk naskah atau audio yang sensitif.
5. Ekspor dengan tab aktif. Jika ekspor gagal, baca pesan status, buka draf, perbaiki berkas atau ganti ke WebM jika browser tidak menyediakan encoder MP4. Ekspor berikutnya dapat diunduh dari panel.

Impor WebVTT memvalidasi urutan dan rentang waktu. Ketepatan transkripsi untuk audio yang diunggah perlu diperiksa editor. Dukungan audio dalam file ekspor diverifikasi pada Chrome. Demo dibuat lokal dari empat potongan replay dengan empat baris narasi offline Piper dan musik sintetis asli. Model Indonesia `id_ID/news_tts/medium` berasal dari [Piper Voices](https://huggingface.co/rhasspy/piper-voices/blob/main/id/id_ID/news_tts/medium/MODEL_CARD). Kartu model mengarahkan ke sumber dataset untuk ketentuan dataset. Demo disimpan sebagai bukti privat, dengan peninjauan hak penggunaan ulang sebelum publikasi.

## Saat tab dan laptop ditutup

Render Studio saat ini memakai WebGL, MediaRecorder dan AudioContext dari tab pemilik. Tombol simpan draf menyediakan pemulihan lokal. Auto Office dan antrean draf memiliki sisi server sendiri. Worker perlu mencapai server dari pemicu yang diterbitkan. Pulse terbaru membuktikan kontak terakhir ke API. Penyebab tugas yang tertunda perlu ditelusuri dari ID tugas, stempel waktu, hasil claim atau lease, dan execution n8n pada jendela WIB yang sama. Tugas yang dijeda menunggu tindakan pemilik.

Pemeriksaan dashboard baca-saja, 15 November 2026:

- n8n menampilkan **Published** untuk Grup AI Natural Gemini, Gemini terjadwal, dan Auto Office. Riwayat grup memperlihatkan eksekusi #8809 sukses pada 17.22 WIB dan #8795 error pada 15.30 WIB. Daftar eksekusi belum memverifikasi kualitas respons atau hasil dari setiap identitas bot.
- Eksekusi terjadwal terakhir yang terlihat, #8654 pada Jumat, 13 November 16.40 WIB, menjalankan trigger, klaim, dan penyiapan draf. Node Gemini dan penyimpanan hasil tidak dijalankan pada eksekusi tersebut. Daftar terbaru memperlihatkan interval 20 menit. Pemeriksaan tersebut belum mengaitkan eksekusi dengan UUID tugas tertentu.
- Studio Scheduler ada di folder n8n sebagai draf tanpa status Published. Vercel menampilkan nama flag `STUDIO_SCHEDULER_ENABLED` pada cakupan Production. Nilainya tidak dibuka dan tidak ada tick scheduler yang dijalankan untuk audit ini.
- Vercel menampilkan Production Ready untuk baseline `fe69de2`. Status itu mengonfirmasi hosting commit baseline. Artefak demo, patch lokal dan verifikasi perangkat fisik belum termasuk dalam rilis tersebut.

Untuk render cloud, simpan manifest episode versi tetap berisi ID replay, waktu potongan, kamera, versi aset, dan checksum untuk audio dan subtitle pada penyimpanan privat. Runner terisolasi mengambil satu manifest dengan lease, merender Chromium/WebGL frame-by-frame, kemudian FFmpeg memadukan video dan audio dari satu timeline. Kunci idempotensi berasal dari hash manifest dan profil render. Simpan log per tahap serta checksum artefak. Terapkan batas 90 detik, satu job per pengguna, timeout, pembatalan, dan retry dari tahap aman. Sebelum aktivasi, ukur biaya serta kebutuhan GPU dari satu fixture dan uji kegagalan runner. Pengunduhan memerlukan sesi pemilik. Publikasi tetap berupa aksi terpisah.

## Batas kontrak Nation City berikutnya

Snapshot baca memakai GET HTTPS, token opsional server, ukuran maksimal 64 KB, timeout empat detik, dan penolakan redirect. `health` bernilai `connected` jika respons sah melaporkan layanan online, `degraded` jika sumber melaporkan gangguan atau cache sah dipakai, `offline` saat cache habis dan permintaan gagal, atau `not_configured`. `lastGoodAt` menyatakan waktu pemeriksaan terakhir yang menghasilkan respons sah.

Usulan fase berikutnya memakai namespace `anshel:office:hq`, `anshel:agent:<division-id>` dan `anshel:place:<layout-id>`. Pemetaan ke wilayah Nation City memakai konfigurasi terverifikasi. Amplop outbound berversi memuat `eventId`, `type`, `entityId`, `regionId` dan `occurredAt`. Hanya milestone yang disetujui dan transisi pekerjaan tanpa isi tugas yang masuk allowlist. Simpan pengiriman dengan kunci idempotensi per event di outbox dan gunakan scope token terpisah dari pembaca. Uji retry, penolakan payload, dan respons duplikat dengan fixture sebelum kontrak outbound digunakan.

## Persiapan identitas manusia dan kredit game

- **Identitas dan akses.** Akun manusia memakai `human:<uuid>` yang berasal dari identitas terotentikasi. Agen memakai `agent:<division-id>` dari daftar server dan punya scope eksekusi terpisah. Server menetapkan tipe subjek dan role `owner`, `reviewer` atau `member` dari keanggotaan, lalu memeriksa kepemilikan setiap objek.
- **Penugasan dan bukti.** Pisahkan maksud tugas, assignee, status penerimaan, dan peninjauan. Persetujuan mencatat pengulas serta versi hasil. Lampiran privat diberi checksum dan masa retensi. Rekam perubahan aktor, waktu, ID objek, aksi dan alasan di audit append-only.
- **Kredit game.** Catat jumlah integer pada ledger dengan ID approval unik dan transaksi atomik. Saldo berasal dari total entri. Pembatalan memakai entri kompensasi dengan alasan serta referensi. Kredit game berlaku untuk penghargaan dalam permainan. Perekrutan, gaji, pencairan, dan transaksi uang nyata memerlukan keputusan terpisah.
- **Dashboard dan moderasi.** Anggota melihat tugas, bukti, serta kredit sendiri. Pengulas hanya melihat tugas yang ditetapkan. Pemilik mengatur akses, retensi, ekspor, penangguhan, dan penghapusan sesuai kebijakan yang disepakati. Uji IDOR, replay, persetujuan ganda, dan pencabutan akses pada fixture sebelum data manusia disimpan.

## Bukti pengujian lokal

| Pemeriksaan | Hasil |
| --- | --- |
| `npm.cmd run build` dan `npm.cmd test` | Build lulus. 221/221 tes lulus, termasuk batas subtitle, geometri persimpangan, otentikasi adapter, lease, kuota WIB, akses privat, dan fixture worker serta Telegram. |
| Episode Pagi di Anshel Virtual Tech | Chrome membuka draf setelah reload, membatalkan ekspor, mengekspor ulang, dan memutar MP4 1080 × 1920 selama 19,93 detik. Empat potongan bergerak. FFprobe membaca H.264 YUV 4:2:0 sekitar 24 fps dan AAC stereo 48 kHz. Dari pencocokan envelope audio dan deteksi bidang subtitle per frame, awal cue berbeda sekitar −5 hingga +37 ms dari narasi yang terenkode. Empat frame juga diperiksa untuk kesesuaian teks. |
| Browser Studio | Desktop dan viewport sentuh 390 × 844. Rapat, replay, editor, dashboard, WebM dan MP4 berhasil. Tidak ada error JavaScript yang ditangkap runner. Median frame kondisi live 11,2 ms desktop dan 11,1 ms pada viewport sentuh. P95 masing-masing 22,2 ms. Pengukuran menggunakan Chrome lokal dan tidak mewakili iPhone fisik. |
| Dunia | Chrome menghasilkan 90 tampilan dari 21 ruangan dan 12 rumah, termasuk orientasi kamera dan mode gedung. Uji kota merekam trafik dari aplikasi asli, memeriksa zona bisnis, perumahan, pasar, taman dan terminal, lalu membandingkan kepadatan pagi dan malam. |
| Simulasi tiga hari | 12 pegawai, 36 kedatangan untuk tidur di rumah dan dua pengantaran makan selesai. Skenario memantau tidur di meja, ponsel, baca, seduh kopi, makanan dan game. Runner mencatat nol collision, duplikasi pengantaran, masalah prioritas, atau pergeseran prop pada fixture. Pengujian ini masih memakai rumah dan rute kompleks lama. |
| Soak dua sesi, sekitar enam menit | Kedua viewport melaporkan 12 pegawai dan runner tidak menangkap error JavaScript. GPU uji terdeteksi sebagai AMD Radeon Graphics. Pada sampel terberat, median desktop 44,3 ms dan p95 desktop 111,1 ms. Median viewport sentuh mencapai 33,3 ms. Heap JS tercatat 40–64 MiB desktop dan 51–57 MiB sentuh. Hasil ini menunjukkan penurunan performa dengan dua viewport dan rekaman aktif. Sampel singkat belum memastikan kestabilan memori atau 60 fps berkelanjutan. |

Jalankan `node scripts/check-office-studio.mjs` untuk regresi Studio. Mode `ANSHEL_PHASE10_FOCUS=1` dan `ANSHEL_PHASE10_FINAL=city`, `visual`, `days` atau `soak` menjalankan audit terkait. Untuk uji episode, set `ANSHEL_EPISODE_MEDIA` ke folder dengan `episode-narration.wav`, `episode-music.wav` dan `episode.vtt`. Siapkan media untuk urutan empat potongan berdurasi lima detik dan gunakan `ANSHEL_SCREENSHOTS` untuk file keluaran. Runner menguji reload IndexedDB, pembatalan, retry, dimensi, playback Chrome, perubahan piksel pada setiap potongan, jejak audio, dan struktur MP4.

Checkpoint ini ditahan sebelum rilis karena perjalanan pegawai di kawasan baru dan stabilitas frame dengan beberapa sesi masih terbuka. Bukti browser dan data fixture disimpan terpisah dari Git.
