# Phase 10 · Penyempurnaan kawasan dan aktivitas

## Audit baseline

| Subsistem | Phase 9 | Penanganan Phase 10 |
| --- | --- | --- |
| Geometri kantor dan collision | Sebagian | Denah dan collision dipakai kembali. Lampu ruang mengikuti mode malam. |
| Eksterior dan perabot rumah | Sebagian | Empat GLB rumah serta perabot GLB dipasang dalam kelompok instancing. |
| Kurir tanpa pesanan | Rusak | Hanya pesanan manual valid yang dapat memulai pengantaran. Pengunjung biasa berjalan tanpa paket. |
| Aktivitas rumah dan kantor | Sebagian | Tambah aktivitas dengan kebutuhan, jadwal, pose, dan prop. |
| Lounge | Sebagian | Kursi penonton, genre balapan, sepak bola, dan puzzle. |
| Snapshot pegawai | Sudah benar | Perluasan opsional untuk pose kendaraan, tamu, dan kurir. |
| Lalu lintas umum | Belum ada | Satu lajur utama aktif per giliran dengan tipe kendaraan dan jam sibuk. |
| Studio, pekerjaan, integrasi dan backup | Sudah benar | Regresi memakai server lokal. |

## Hasil dan batasan

- Empat rumah Kenney memakai fondasi dan denah collision lama. Saat cutaway, sofa, meja, tempat tidur, kabinet, toilet, lampu dan bingkai pintu terlihat. Render menggunakan aset lokal. [Lisensi aset](asset-licenses.md)
- Aktivitas mencakup membuat kopi, makan, ponsel, catatan, peregangan, tidur meja dan tidur rumah. Dialog lokal memperoleh tambahan skenario. Pemilihan tetap mendahulukan tugas aktif.
- TV memutar tiga simulasi orisinal dengan preferensi genre yang beragam menggunakan indeks tetap tiap pegawai. Pemain memakai dua slot controller. Kursi penonton dipindah ke sisi layar yang bisa dilihat setelah pemeriksaan Chrome menemukan posisi awal berada di belakang TV.
- Kurir memiliki ID pesanan, memakai rig berbeda dari Dika dan membawa paket. Saat pemesan tiba, paket bergerak ke tangan dan ikut dibawa ke pantri. Pesanan kosong tidak memunculkan kurir. Jika pemegang sesi berganti saat perjalanan, simulasi menutup perjalanan yang tidak dapat dilanjutkan.
- Mobil pribadi, van dan skuter lewat di jalan utama. Mobil, van, kendaraan pengiriman dan kendaraan layanan bergiliran memakai rute parkir. Jalur diuji dengan clearance kendaraan terhadap penghalang statis.

## Pengujian lokal

| Pemeriksaan | Hasil |
| --- | --- |
| `npm.cmd test` | 193 lulus, 0 gagal dengan koneksi loopback untuk tes HTTP dan worker lokal |
| `npm.cmd run build` | Lulus |
| Kurir | Satu hari simulasi tanpa pesanan menghasilkan nol kurir. Tes mencakup pesanan duplikat, pemesan sibuk, batas tunggu, satu kali serah terima dan keluar kawasan. Chrome merekam perjalanan pesanan Jihan hingga kurir keluar dan memverifikasi status aktif yang sama pada sesi browser kedua. |
| Navigasi | 21 ruang kantor, 12 workstation, titik aktivitas dan jejak furnitur utama. Rute parkir dan dua lajur umum lolos pengecekan terhadap penghalang statis. |
| Studio | Chrome mencakup rapat empat pegawai, penyimpanan notulen setelah refresh, replay, penyimpanan melalui API lokal serta ekspor WebM dan MP4. |
| Tampilan | Chrome 1440 × 900 dan emulasi sentuh 390 × 844. Tangkapan layar meliputi 21 ruang kantor, kawasan, gedung, variasi rumah terpilih, siang/malam, lounge dan pengantaran. |
| Performa | Chrome lokal dengan 12 pegawai. Interval median frame 11,1 ms. P95 overview desktop 22,2 ms dan emulasi mobile 11,2 ms. Overview 466 draw call desktop dan 460 mobile. Tidak ada error JavaScript browser pada skenario itu. |

## Verifikasi yang masih terbuka

- Gambar 21 ruang menunjukkan orientasi furnitur dan sumber cahaya. Pemeriksaan clipping dari semua sudut dan detail semua interior rumah masih perlu dilakukan. Pintu cutaway memakai bingkai GLB dan collision yang ada. Panel plafon kantor masih dibuat dari geometri lokal.
- Pose tidur rumah, tidur meja, ponsel, membaca, dan transisi bangun sudah terpasang. Bukti visual urutan lengkap untuk masing-masing aktivitas masih terbuka. Genre permainan diuji sebagai simulasi, dengan pemain dan controller terlihat di Chrome.
- Lalu lintas umum menempati satu lajur aktif per giliran. Persimpangan multi-kendaraan serta bangunan pendukung di luar rumah dan kantor masih terbuka. Pemeriksaan collision bergerak jangka panjang masih diperlukan.
- Sinkronisasi pose melalui endpoint presence yang sudah ada dan tetap menerima snapshot lama. Saat pengendali sesi berpindah, pengantaran aktif dibatalkan. Pesanan dibuat dari panel pemilik.
- Browser ponsel fisik dan verifikasi integrasi production masih terbuka. Pengujian lokal menggunakan SQLite sementara dan Studio Scheduler dalam kondisi nonaktif.
- Checkpoint disimpan lokal. Rilis menunggu pengujian visual aktivitas bergerak, lalu lintas dan perumahan yang diwajibkan dalam brief.
