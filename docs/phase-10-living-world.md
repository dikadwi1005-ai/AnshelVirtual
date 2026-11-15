# Phase 10 · Penyempurnaan kawasan dan aktivitas

## Audit baseline

| Subsistem | Phase 9 | Penanganan Phase 10 |
| --- | --- | --- |
| Geometri kantor dan collision | Sebagian | Denah dan collision dipakai kembali. Lampu ruang mengikuti mode malam. |
| Eksterior dan perabot rumah | Sebagian | Empat GLB rumah serta perabot GLB dipasang dalam kelompok instancing. |
| Kurir tanpa pesanan | Rusak | Pesanan valid dari panel atau keputusan pegawai memulai pengantaran. Pengunjung biasa berjalan tanpa paket. |
| Aktivitas rumah dan kantor | Sebagian | Tambah aktivitas dengan kebutuhan, jadwal, pose, dan prop. |
| Lounge | Sebagian | Kursi penonton, genre balapan, sepak bola, dan puzzle. |
| Snapshot pegawai | Sudah benar | Perluasan opsional untuk pose kendaraan, tamu, dan kurir. |
| Lalu lintas umum | Belum ada | Dua lajur berlawanan, kendaraan bervariasi dan frekuensi mengikuti jam sibuk. |
| Studio, pekerjaan, integrasi dan backup | Sudah benar | Regresi memakai server lokal. |

## Hasil dan batasan

- Empat rumah Kenney memakai fondasi dan denah collision lama. Saat cutaway, sofa, meja, tempat tidur, kabinet, toilet, lampu dan bingkai pintu terlihat. Render menggunakan aset lokal. [Lisensi aset](asset-licenses.md)
- Aktivitas mencakup membuat kopi, makan, ponsel, catatan, peregangan, tidur meja dan tidur rumah. Dialog lokal memperoleh tambahan skenario. Pemilihan tetap mendahulukan tugas aktif.
- TV memutar tiga simulasi orisinal dengan preferensi genre per pegawai. Pemain memakai dua controller dan penonton dapat bereaksi di kursi sendiri. Kursi penonton berada di sisi yang menghadap layar.
- Kurir memiliki ID pesanan dan memakai rig berbeda dari Dika. Kondisi pesanan, cooldown, waypoint, status serah terima dan timer dibawa lewat snapshot yang sudah ada. Sesi baru melanjutkan ID yang sama. Pegawai membawa paket di tangan menuju pantri. Peluang memesan mengikuti jam makan, energi, status pekerjaan, menu favorit, cooldown 20 menit, dan hasil acak. Pengujian nol pesanan tetap mencakup satu hari penuh.
- Mobil pribadi, van dan skuter lewat dari dua arah. Mobil, van, kendaraan pengiriman dan kendaraan layanan bergiliran memakai rute parkir. Jalur diuji terhadap penghalang statis dan kendaraan memberi jalan kepada pejalan kaki. Kios dan pos layanan menempati kavling di selatan jalan utama.
- Pemeriksaan 12 interior memperlihatkan vegetasi dan bukit menembus hunian barat dan timur. Bukit dipindah ke luar kawasan hunian serta diperkecil. Lampu dinding cutaway diturunkan agar menempel pada dinding yang terlihat.

## Pengujian lokal

| Pemeriksaan | Hasil |
| --- | --- |
| `npm.cmd test` | 196 lulus, 0 gagal dengan koneksi loopback untuk tes HTTP dan worker lokal |
| `npm.cmd run build` | Lulus |
| Kurir | Satu hari simulasi tanpa pesanan menghasilkan nol kurir. Tes mencakup pesanan duplikat, pemesan sibuk, batas tunggu, satu kali serah terima dan keluar kawasan. Chrome merekam pengambilalihan pesanan Jihan oleh browser kedua, kelanjutan memakai UUID yang sama, serah terima, serta kurir keluar. |
| Navigasi | 21 ruang kantor, 12 workstation, titik aktivitas dan jejak furnitur utama. Rute parkir dan dua lajur umum lolos pengecekan terhadap penghalang statis. |
| Studio | Chrome mencakup rapat empat pegawai, penyimpanan notulen setelah refresh, replay, penyimpanan melalui API lokal serta ekspor WebM dan MP4. |
| Tampilan | Chrome 1440 × 900 dan emulasi sentuh 390 × 844. Tangkapan layar meliputi 21 ruang kantor, 12 rumah, kawasan, gedung siang/malam, lounge dan pengantaran. |
| Performa | Chrome lokal dengan 12 pegawai. Interval median frame 11,1 ms dan P95 11,2 ms pada overview desktop serta emulasi mobile. Overview 479 draw call desktop dan 470 mobile. Tidak ada error JavaScript atau penolakan snapshot pada pengujian Chrome penuh terakhir. |

## Verifikasi yang masih terbuka

- Gambar 21 ruang dan 12 rumah menunjukkan orientasi furnitur dan sumber cahaya dari kamera pengamat. Pemeriksaan kontak prop, pintu dan furnitur pada setiap sudut kamera atau setiap ukuran rig masih terbuka. Lampu plafon memakai housing Kenney dan strip emisi lokal.
- Rekaman skenario terkendali mencakup tidur di meja dan di rumah, ponsel, kopi, membaca, makan, peregangan, game, dan percakapan. Alur terkendali juga membuktikan tugas aktif mengakhiri tidur meja dan pegawai meninggalkan tempat tidur. Pemeriksaan semua transisi aktivitas otonom dari awal hingga akhir masih terbuka.
- Jalur dua arah diuji bersama penghalang pejalan kaki. Arus yang berbelok di persimpangan dengan banyak kendaraan dan stabilitas sesi panjang di browser masih terbuka.
- Snapshot lama tetap diterima. Untuk crash di antara dua sinkronisasi, tampilan dapat mundur ke checkpoint terakhir. Pesanan simulasi dapat diteruskan tanpa kembali ke awal rute.
- Browser ponsel fisik dan verifikasi integrasi production masih terbuka. Pengujian lokal menggunakan SQLite sementara dan Studio Scheduler dalam kondisi nonaktif.
- Checkpoint disimpan lokal. Rilis menunggu pengujian visual aktivitas bergerak, lalu lintas dan perumahan yang diwajibkan dalam brief.

## QA akhir

- Audit Chrome mencakup 90 tampilan. Setiap ruang kantor diperiksa dari dua sudut, dan masing-masing dari 12 rumah diperiksa dari dua sudut untuk interior dan eksterior. Hasil render memperlihatkan model rumah, fondasi, pintu cutaway dan perabot modular. Dinding sisi kamera direndahkan sesuai mode cutaway.
- Tiga hari virtual memakai mesin aktivitas, rig GLB, navigasi dan traffic aplikasi di Chrome dengan langkah simulasi 50 ms. Waktu WIB dipercepat per fase. Pegawai memilih sendiri aktivitas dan pesanan, sedangkan tugas aktif menjadi masukan pengujian. Karena panjang fase dipercepat, hasil frekuensi tidak mewakili jumlah kegiatan per hari pada layanan produksi.
- Titik pivot lengan berada pada bahu. Pemeriksaan mesh tangan menemukan offset lama tidak mencapai bagian distal rig. Ponsel, cangkir, kudapan dan paket sekarang memakai titik pegangan pada bagian distal. Hadirnya prop di posisi tersebut diperiksa dalam tiga hari virtual. Rekaman Chrome dari jarak dekat tetap digunakan untuk pemeriksaan visual.
- Nilai pemilihan membaca dan ponsel disesuaikan karena keduanya hampir tidak pernah terpilih pada pengujian awal. Urutan gerak dijalankan oleh mesin yang sama seperti kantor biasa.
- Pejalan kaki memakai pintu pejalan kaki saat mencari rute ulang. Kendaraan yang terhalang dapat menjauh dari titik konflik dan kembali melalui jalur masuk. Pengujian mendeteksi kendaraan yang diam lebih dari 60 detik simulasi.
- Uji dua sesi Chrome selama sekitar enam menit mempertahankan 12 pegawai tanpa error JavaScript. Dengan perekaman aktif, sampel akhir kedua viewport mencatat median 22,2 ms. Heap JS bervariasi antara 39–62 MiB di desktop dan 39–60 MiB di viewport sentuh. Pengukuran singkat ini tidak mencakup penggunaan sepanjang hari maupun perangkat fisik.
- Pengujian menggunakan server lokal, tanpa transaksi nyata. Perubahan produksi tidak mencakup skema database, kontrak presence, workflow, atau scheduler. Lisensi dan SHA-256 aset yang dipakai tetap tercatat di `ASSETS.json`.
