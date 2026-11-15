# Lisensi aset 3D Anshel

[ASSETS.json](../ASSETS.json) mencatat file model, pembuat, lisensi dan SHA-256. Semua model yang dipakai browser disajikan dari proyek.

| Aset | Penggunaan | Lisensi dan sumber |
| --- | --- | --- |
| `tree-default.glb`, `tree-small.glb`, `tree-tall.glb` | Pohon di halaman dan di sekitar rumah, serta pohon Teras Taman | CC0 · [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) |
| Furnitur GLB yang sudah ada | Furnitur ruang kerja dan area bersama | CC0 · [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) |
| Karakter GLB dan animasi | Pegawai, Dika, kurir, dan pengunjung | CC0 · [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) |

Phase 9 memakai ulang tiga model Nature Kit yang sudah ada di repo. Skala dan lokasi diatur oleh scene. Pohon kawasan memiliki model geometris lokal sebagai fallback. Fasad, modul rumah, jalan, skuter dan tas pengantaran dibuat dari geometri proyek. Saji Kampung adalah identitas fiktif.

## Phase 10

| Paket | File yang dipakai | Lisensi |
| --- | --- | --- |
| [Kenney City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban) | `building-type-a/d/f/i.glb` | CC0 1.0 |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | `bedsingle.glb`, `kitchencabinet.glb`, `bathroomcabinet.glb`, `doorwayopen.glb`, `cardboardboxclosed.glb` | CC0 1.0 |
| [Kenney Car Kit](https://kenney.nl/assets/car-kit) | `sedan.glb`, `van.glb`, `delivery.glb`, `garbage-truck.glb` | CC0 1.0 |

Salinan GLB mandiri berasal dari [repositori distribusi tge-assets](https://github.com/Hidencod/tge-assets). Tiga belas berkas disimpan di `public/models/district`, dengan SHA-256 di manifest. Render tidak mengunduh dari sumber luar. Kurir memakai varian rig `character-male-e` dengan helm dan warna jaket simulasi.

Lanjutan Phase 10 memakai `building-type-b.glb` dan `building-type-c.glb` untuk kios serta pos layanan. `lampsquareceiling.glb`, `lampwall.glb`, `books.glb`, dan `pillowblue.glb` dipasang pada kantor dan rumah. Keenam berkas memakai CC0 dan dicatat di manifest yang sama. Bagian lampu yang memancarkan cahaya tetap memakai geometri sederhana agar intensitas dapat diatur per mode pencahayaan. Cangkir, ponsel, makanan, helm dan skuter memakai geometri lokal yang mengikuti ukuran dan rig chibi saat berinteraksi.

## Phase 10.1

Pusat bisnis memakai `building-skyscraper-a.glb`, `building-skyscraper-c.glb`, dan `building-skyscraper-d.glb`. Lalu lintas menambah `taxi.glb` dan `ambulance.glb`. Kelimanya disajikan lokal dan memiliki SHA-256 di manifest. [Kenney City Kit Commercial](https://kenney.nl/assets/city-kit-commercial) · [Kenney Car Kit](https://kenney.nl/assets/car-kit)

Empat model rumah Phase 10 masih memakai UV dan material Kenney. Geometri fasad di sekitar pintu dipotong saat aplikasi memuat rumah agar bukaan mengikuti denah dan collision. Dinding interior, ambang, kanopi, perkerasan, pejalan kaki latar, motor dan pengendaranya, serta model jarak jauh kota dibentuk dari geometri lokal.
