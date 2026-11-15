# Checkpoint perjalanan kota dan produksi Studio

Baseline Production yang diverifikasi sebelumnya adalah `fe69de2`. Pekerjaan ini melanjutkan branch `feat/studio-city-checkpoint` dari `5f2556d`. Penyiapan data uji menggunakan SQLite terisolasi.

## Perjalanan dan kompatibilitas

- Dua belas pegawai memakai rumah dengan ID yang sama pada 12 kavling tetap di empat blok kota. Bangunan placeholder pada kavling itu diganti rumah yang mempunyai interior. Kavling tetangga langsung memakai bangunan rendah agar akses dan sudut kamera lebih terbuka.
- Pegawai jalan kaki dari rumah, melalui akses kavling, trotoar, penyeberangan, gerbang dan pintu kantor. Jadwal tetap memakai simulasi Living Office. Perjalanan pulang menggunakan arah trotoar berbeda untuk memberi ruang berpapasan. Kendaraan kota memberi jalan saat pegawai mendekati penyeberangan.
- Snapshot presence lama tetap terbaca. Pose dari interior rumah lama dipetakan ke koordinat lokal yang sama di rumah baru. Jalur lama yang mengarah ke rumah dihitung ulang. Batas pose replay diperluas, batas pose kendaraan kampus tetap memakai kontrak lama.
- Bukti browser tiga hari mengamati **36 keberangkatan dan 36 kepulangan** pada 12 pegawai. Rekaman Alya dan Laras menampilkan perjalanan keluar rumah, menyeberang, menuju dan memasuki kantor, lalu kembali. Rekaman bukti memakai langkah simulasi dipercepat dan mesh serta navigasi aplikasi. Audit final menyimpan 90 tampilan untuk 21 ruang dan 12 rumah.
- Smoke check desktop dan viewport sentuh menyisakan waktu polling dan interpolasi. Uji ulang mencatat selisih posisi maksimum 0,48 m saat di rumah dan 0,38 m saat keberangkatan. Satu percobaan sebelumnya gagal pada batas sinkronisasi yang sama dengan selisih 4,18 m. Stabilitas antarsesi masih perlu diuji lebih lama pada kondisi jaringan nyata.

## Profil kinerja

Chrome headless melaporkan GPU AMD Radeon melalui ANGLE. Profil CPU menunjukkan pembaruan matriks dunia sebagai salah satu biaya utama. Matriks objek statis sekarang dibangun sekali. Editor tetap memperbarui matriks perabot saat pengguna memindahkannya. Resolusi dapat turun bertahap saat frame melambat dan pulih setelah sejumlah frame cepat. Resolusi ekspor tetap 1080 × 1920.

| Metrik skenario dua viewport dengan rekaman | Checkpoint sebelumnya | Soak baru, tujuh sampel |
| --- | --- | --- |
| Median desktop terburuk | 44,3 ms | 11,1 ms |
| P95 desktop terburuk | 111,1 ms | 33,4 ms |
| Median viewport sentuh terburuk | 33,3 ms | 11,1 ms |
| P95 viewport sentuh terburuk | 55,5 ms | 33,4 ms |
| Draw call desktop | 552–572 | 516–571 |
| Draw call viewport sentuh | 546–575 | 523–574 |
| Heap JS desktop | 40–64 MiB | 50–68 MiB |
| Heap JS viewport sentuh | 51–57 MiB | 39–62 MiB |

Dalam profil Chrome singkat sebelum optimasi, `updateMatrixWorld` mengambil 13,5% sampel aktif. Profil baru enam menit menunjukkan 8,8%. Durasi kedua profil berbeda. Angka itu mengukur porsi CPU JavaScript yang disampel dan belum mengukur GPU secara terpisah. Soak masih menunjukkan sampel P95 33,4 ms, sedikit melewati 30 FPS. Perangkat iPhone fisik, penggunaan GPU memory dan stabilitas jangka panjang belum diuji.

## Studio, runner, dan integrasi

- **Siapkan episode 3D** di tab Storyboard membuat tiga potongan dari rekaman aktual. Kamera dapat mengikuti pegawai. Teks memakai aksi yang direkam, dengan naskah WebVTT yang dapat diunduh. Pengguna bisa membuka preview, simpan draf, atau impor WAV, musik dan WebVTT. Pembuatan suara produksi dari naskah masih memerlukan TTS dengan hak penggunaan yang telah diverifikasi atau rekaman pemilik.
- Runner opsional menggunakan manifest ber-hash, media privat beralamat checksum, SQLite terisolasi, satu lease aktif, heartbeat, batal, retry, dan komposisi Chromium/WebGL serta FFmpeg. Jalankan `node scripts/run-studio-render.mjs <queue.sqlite> <private-media-directory>` setelah build dan pengisian antrean melalui modul `server/studio-render-jobs.ts`. Runner mengakses aset dari loopback dan membatasi durasi 90 detik. Tidak ada endpoint publik, pemicu terjadwal, atau pengaktifan layanan berbayar. Untuk operasi ketika laptop mati, masih dibutuhkan host runner, penyimpanan privat yang tahan lama, kebijakan retensi dan autentikasi untuk pengunduhan.
- Runner terisolasi menghasilkan 96 frame, MP4 1080 × 1920 H.264 dan AAC berdurasi empat detik, sekitar 1,02 MB. Eksekusi lokal selesai dalam 10,64 detik termasuk startup. Uji kapasitas 90 detik, perhitungan biaya host dan beban render paralel masih terbuka.
- Outbox Nation City memakai identitas kantor dan agen tetap, wilayah eksplisit, allowlist tiga jenis event, SQLite, token, idempotensi, dan retry dengan jeda. Fixture menguji putus jaringan dan deduplikasi. Adapter baca v1 tetap terpisah. Endpoint outbound Production dan pemetaan wilayah dunia nyata belum tersedia untuk uji.
- Pengujian worker lokal mengikuti antre, klaim, respons Gemini fixture, simpan hasil dengan checksum dan persetujuan hasil. Tugas berstatus jeda tetap dijeda. Scheduler lokal diuji dengan efek sandbox dan tetap nonaktif secara default. Eksekusi Gemini Production baru tidak dipicu. Bukti Published dan riwayat n8n terakhir tetap dirujuk dari [checkpoint sebelumnya](anshel-execution-checkpoint.md).

## Gate rilis

Build dan 224 tes lokal lulus. Tes Chrome menguji pemulihan draf lintas refresh, batal dan render ulang, empat shot MP4 dengan audio, dan pembuatan otomatis tiga shot dari topik.

Episode uji baru **Perjalanan Kota Anshel** berdurasi 18,60 detik, dari empat potongan rekaman 3D perjalanan Alya dan Laras. FFmpeg menggabungkan narasi lokal, musik sintetis asli dan subtitle yang waktunya dihitung dari audio. FFprobe serta pemutaran Chrome memverifikasi MP4 1080 × 1920 H.264/AAC. Video perkenalan sebelumnya tetap tersimpan. Episode baru bersifat bukti privat dan memakai model lokal yang hak penggunaan ulang dataset-nya masih perlu diperiksa sebelum publikasi.

Pemeriksaan visual menemukan menara tetangga menutupi sudut rumah pada beberapa arah. Kamera fokus rumah dan tinggi bangunan tetangga diperbaiki. Pengujian visual menyimpan bukti tampilan aplikasi untuk ditinjau. Pembuktian bebas clipping pada seluruh momen, manuver parkir kota penuh, mobil pegawai dan perjalanan melalui transportasi umum masih terbuka. Perjalanan kaki adalah moda yang tersedia dalam checkpoint ini.

Tahan merge dan Production sampai acceptance yang tersisa dan verifikasi eksternal selesai. MP4, audio, SQLite, rekaman mentah, profil Chrome dan screenshot uji tetap di direktori artefak privat, di luar Git.
