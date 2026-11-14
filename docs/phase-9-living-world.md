# Phase 9 · Arsitektur dan perumahan Anshel

## Arsitektur

Kantor sebelumnya tampil sebagai denah terbuka. Gedung Utuh kini memasang dinding keliling, fasad berjendela dengan bingkai dan pilar, kanopi pintu utama, atap datar dengan parapet, skylight dan ruang utilitas. Lihat Interior melepas penutup eksterior. Pada jarak dekat, dinding bagian atas yang menghadap kamera dipotong dan bagian penting tetap terlihat. Collision dan rute memakai geometri tetap pada kedua mode.

Tombol lapisan di kanan atas menukar tampilan. Dari **Kawasan**, pilih mode otomatis untuk mengikuti fokus kamera, atau pilih titik kamera untuk kantor, taman, gerbang, perumahan dan rumah masing-masing pegawai. Fokus layar workstation dan replay membuka bagian dalam sementara.

## Denah perumahan dan perjalanan

Empat rumah berada di kiri, empat di kanan dan empat di belakang. Variasi meliputi teras datar, dua profil atap miring dan volume atap bertingkat. Rumah mempunyai akses pintu, sofa, tempat tidur, kamar mandi sederhana, kitchenette dan lampu. Jalan lingkungan dan trotoar mengikat ketiga deret.

| Kiri | Kanan | Belakang |
| --- | --- | --- |
| Alya · Manajemen | Eka · Pengembangan | Indra · Riset |
| Bima · Operasional | Fara · Kreatif | Jihan · Pemasaran |
| Citra · Administrasi | Galih · Video | Kirana · Jaminan Mutu |
| Dara · SDM | Hana · Media Sosial | Laras · Keuangan |

Rute berangkat dan pulang menghubungkan pintu rumah, trotoar lingkungan, jalur depan, gerbang pedestrian dan pintu utama kantor. Tiga lajur pedestrian pada gerbang dan pintu serta waktu keberangkatan bergiliran membantu membagi arus. Di rumah pegawai duduk beristirahat dan memulihkan kebutuhan. Pekerjaan aktif tetap didahulukan. Snapshot menerima koordinat kawasan, memakai ID lama, dan tetap menerima replay yang direkam sebelum perubahan.

## Pengantaran dan aset

Saat jam makan, kurir **Saji Kampung** dapat datang dengan skuter dari jalan depan, parkir, berjalan membawa paket, bertemu pegawai yang dipanggil ke teras, lalu kembali ke skuter. Panel **Kawasan → Pesan makan · Simulasi** menerima pilihan pegawai dan makanan saat jam istirahat. Panel menampilkan status berdasarkan perjalanan dan kedatangan aktual. Pesanan otomatis mengikuti jadwal simulator. Seluruh aktivitas bersifat lokal.

Vegetasi mengaktifkan model GLB Kenney yang disajikan dari proyek. Fasad, skuter dan modul rumah adalah geometri proyek. [Manifest dan lisensi aset](asset-licenses.md)

## Pengujian dan rilis

Verifikasi rute dilakukan terhadap 12 rumah dalam dua arah. Pengujian mencakup pintu, dinding, collision perabot, mobil, staging jadwal, bentuk snapshot presence, dan siklus kebutuhan yang dipercepat. Chrome lokal memverifikasi gedung dan rumah di kedua mode, simulasi makan siang hingga serah terima, pemutaran ekspor, dan kontrol pada viewport sentuh. Bukti ditulis oleh skrip Studio dengan awalan `phase9-`, termasuk `building-front.png`, `building-rear.png`, `district.png`, `home-interior.png`, `food-handoff.png`, dan `replay.webm`.

Pengantaran memakai satu skuter per sesi. Verifikasi lintas perangkat fisik masih terbuka. Uji panjang yang dijalankan adalah simulasi kebutuhan, sehingga belum mengukur pemakaian GPU browser selama beberapa jam. Gunakan `git log -1 --format=%H -- docs/phase-9-living-world.md` untuk mendapatkan SHA checkpoint. Status deployment dicatat pada laporan rilis.

- Build dan 189 tes regresi lulus. Dua sesi Chrome lokal menerima snapshot yang sama untuk 12 pegawai. Perpindahan sesi pemimpin dan reload mempertahankan aktivitas yang berjalan.
- Uji ulang menemukan satu pegawai tertahan menuju Pod Rapat. Pencarian rute kini mencoba langkah menepi yang lolos collision jika rute langsung terhalang, sambil mempertahankan titik lintasan utama untuk komuter.
- Pengukuran Chrome lokal pada desktop dan viewport sentuh 390 × 844 dengan 12 pegawai mencatat median 11,1–11,3 ms, p95 11,2–22,3 ms, 136–438 draw calls, dan heap JavaScript 36–42 MiB. Angka ini adalah sampel pendek browser uji, dengan DOM siap 59–65 ms, tanpa pengukuran memori GPU.
