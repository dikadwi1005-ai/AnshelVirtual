# Phase 10.1 — Work in Progress

Checkpoint interior kantor dan kota. Implementasi dan audit visual masih berjalan.

## Implementasi lokal

- Dinding penuh dan kaca pada ruang tertutup mengikuti tinggi partisi yang dipakai kamera karakter. Mode pengamat memotong bagian atas dinding padat di sisi dekat. Kaca tetap terlihat, dan lampu dipindah ke posisi yang menempel pada dinding. Ruang terbuka mempertahankan akses yang diperlukan pegawai.
- Empat GLB rumah diperiksa dari +X, −X, +Z, dan −Z. Fasad utama menghadap −Z pada aset sumber. Sudut render dinormalisasi, teras dan akses mengikuti pintu, dan geometri yang menutup bukaan dipotong. Bukaan denah dan collision memakai dimensi yang sama. Rute jalan kaki kompleks lama dipertahankan untuk 12 pegawai.
- Kota 2.176 × 2.176 meter dibagi menjadi chunk 128 meter. Kavling dan zona bisnis, permukiman, pasar, taman serta terminal deterministik. Kamera memuat chunk sekitar target, dan instancing serta LOD mengurangi detail saat menjauh. Panel Kawasan membuka titik fokus kota serta zona. Navigasi Dika menerima posisi di luar kompleks lama dan memeriksa collision kavling kota.
- Mobil pribadi, motor, van, taksi, ambulans, serta kendaraan layanan dan pengiriman memakai rute dari graph persimpangan. Jumlah kendaraan berubah mengikuti WIB. Pejalan kaki latar memakai trotoar dan penyeberangan. Kurir dan kendaraan dalam kompleks tetap memakai simulasi lama.
- Indikator worker membaca marker `worker_at` yang dipakai SQLite dan cloud. Setelah 40 detik tanpa catatan baru indikator kembali offline. Fixture Chrome Phase 10.1 memakai SQLite tanpa worker. Ringkasan log Production untuk 45 menit tidak memuat entri. Status pada tangkapan pemilik belum dapat ditentukan tanpa sesi privat. Tidak ada perubahan pada kredensial, scheduler, dan database.

## Acceptance yang masih terbuka

- Checkpoint berikutnya memutus trotoar pada persilangan aspal di chunk kota. Elevasi, tepi perkerasan, dan sambungan kampus lama masih perlu diperiksa dari dekat. Lihat [matriks eksekusi](anshel-execution-checkpoint.md).
- Pindah 12 rumah pegawai ke lingkungan yang tersebar dan buat perjalanan pegawai dengan transportasi. Rute pegawai masih memakai kompleks sebelumnya untuk menjaga snapshot dan jadwal.
- Tata kota masih memakai denah awal. Variasi blok, koneksi jalan lingkungan, transisi antarzona, serta penempatan fasilitas publik masih perlu dipoles dan diuji.
- Perlu bukti berjalan dari pintu ke interior bagi 12 pegawai, pemeriksaan 21 ruang lewat kamera Dika, dan audit aset dari ketinggian berbeda. Tiga tangkapan layar pemilik hanya disebut dalam brief yang tersedia.
- Model pejalan kaki kota saat ini mengikuti gerak sederhana. Belanja dan tujuan aktivitas penduduk, parkir dinamis, dan sesi stress trafik panjang masih terbuka.
- Lengkapi pembandingan semua visual dan uji Production dengan sesi setelah acceptance lokal lulus. Perangkat ponsel fisik belum diuji.

## Hasil checkpoint lokal

- Build lulus dan 204 tes regresi lulus. Tambahan uji denah memeriksa ukuran kota, ID kavling, arah akses, footprint, batas chunk, dan koneksi graph. Uji jalur rumah memeriksa bukaan pintu dan segmen dinding di sebelahnya.
- Chrome menyimpan 90 tampilan dari 21 ruangan dan 12 rumah, arah empat aset sumber, lima zona kota, mode Dika, dan viewport sentuh. Pemeriksaan sinar pada mesh memastikan bukaan rumah bebas pada tiga ketinggian untuk 12 instans. Rekaman terkontrol menunjukkan Alya keluar dan masuk kembali di rumah Manajemen.
- Benchmark sampel 60 frame untuk zona kota dengan 12 pegawai aktif mencatat median 22,1 ms desktop dan 11,2 ms pada viewport sentuh 390 × 844. Hasil Chrome ini bergantung pada kondisi mesin uji.
