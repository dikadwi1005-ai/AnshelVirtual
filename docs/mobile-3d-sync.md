# Sinkronisasi dan perbaikan 3D mobile

12 November 2026 WIB. GitHub `main` dan HEAD lokal setelah sinkronisasi sama-sama `e3240ff6871028f1c8e537f5bb46946ce0cae5a9`. Remote `Origin` dan `AnshelVirtual` menunjuk ke repo yang sama. Selisih `d5c554d…Origin/main` sebelum sinkronisasi adalah 0 commit lokal unik dan 5 commit GitHub, sehingga `main` lokal diselaraskan dengan fast-forward. Pekerjaan perbaikan ada di branch lokal `fix/mobile-3d-loading`.

Backup folder tersedia di `D:\Web Project\VirtualOffice\anshel-backup-before-mobile-sync-20261112-123136` dan referensi Git lama tersedia di `backup/before-mobile-sync`. Backup memuat `.git`, `.env`, `data/`, aset, dan `.asset-import/`. Hash `.env` serta seluruh file di `data/` dicocokkan dengan sumber saat pencadangan. Dependensi `node_modules/` dipasang ulang dari lockfile. Working tree awal bersih.

## File yang diterima dari GitHub

| Area | File |
| --- | --- |
| Konfigurasi dan dokumentasi | `.gitignore`, `README.md`, `package.json`, `package-lock.json`, `vercel.json` |
| Antarmuka | `public/app.js`, `public/index.html`, `public/office.css`, `public/scene-support.js`, `public/scene.js` |
| Build dan migrasi | `scripts/prepare-public.ts`, `scripts/migrate-sqlite.ts` |
| Server dan API | `api/route.ts`, `server/cloud-store.ts`, `server/http.ts`, `server/telegram.ts` |
| Supabase | `supabase/migrations/20261111131938_anshel_sqlite_compatible_core.sql`, `supabase/migrations/20261111132554_anshel_cloud_private_sessions.sql` |
| Tes | `test/cloud-api.test.ts`, `test/office.test.ts`, `test/scene-support.test.ts` |

## Bukti dan perbaikan

Pada deployment publik, `/scene.js` dan `/lib/three/build/three.module.js` memberikan HTTP 200 dengan MIME JavaScript. `three.module.js` mengimpor `./three.core.js`, tetapi file itu memberikan 404. Build pada commit GitHub hanya menyalin `three.module.js` dari direktori Three.js. Pada Chrome dengan profil Pixel 7, impor `/scene.js` mereproduksi pesan error pengguna dan Network memperlihatkan 404 yang sama. Impor `/scene.bundle.js` berhasil pada sesi Chrome yang sama. Tidak ada registrasi service worker pada profil uji. Cara tab Android pengguna memilih URL lama belum dapat diverifikasi.

`scripts/prepare-public.ts` menghasilkan HTML dan satu graph ESM di `.vercel-public/`. Nama entry aplikasi, entry 3D dan chunk berisi hash dari build yang sama. Alias lama `/app.js`, `/scene.js` dan `/scene.bundle.js` mengarah ke build baru. `three.core.js` ikut disalin untuk tab yang sudah memiliki modul Three.js lama. `vercel.json` menetapkan output build, meminta HTML dan alias lama tidak disimpan di cache, serta mengizinkan cache panjang untuk modul berhash. Rute API tetap sama. [Dokumentasi konfigurasi statis Vercel](https://vercel.com/docs/project-configuration/vercel-json).

`public/app.js` dan `public/scene-support.js` membedakan kegagalan impor dari masalah renderer. Untuk kegagalan impor, tombol pemulihan memuat ulang halaman agar aplikasi mengambil pasangan entry dan paket 3D yang sesuai. `server/http.ts` menyajikan build yang sama lewat HTTP lokal, dengan mode sumber tersedia sebelum build. Tes regresi di `test/scene-support.test.ts` dan `test/build-output.test.ts` memeriksa impor gagal, ekspor modul salah, URL lama, hash kedaluwarsa, MIME dan cache.

## Verifikasi

`npm.cmd ci`, `npm.cmd run build` dan `npm.cmd test` berhasil. 31 tes lulus dan 0 gagal. Chrome desktop 1920 × 1080 dan emulasi Android 360 × 800, 412 × 915, dan 915 × 412 masing-masing memuat tiga modul ESM berhash dan 36 model GLB tanpa error HTTP, request gagal atau error Console. Login, sesi, buka-tutup panel tugas, rotasi, zoom dan pan diuji. Saat respons JavaScript sengaja diganti HTML berstatus 200, Chrome menolak modul, panel tugas tetap dapat dibuka dan tombol muat ulang memulihkan 3D dengan sesi yang sama. Kedua URL scene lama juga berhasil diimpor dari hasil build lokal.

Uji animasi terpisah pada 412 × 915 memverifikasi Alya bersosialisasi, menerima tugas uji, berjalan, duduk, bekerja, bereaksi saat tugas selesai, dan kembali bersosialisasi. Hasil tugas uji berhasil diunduh.

Kontrak login, sesi, tugas dan logout rute Vercel lulus dengan penyimpanan uji. `/api/session` production membalas 200, dan `/api/state` tanpa sesi membalas 401. Kueri baca-saja pada proyek Supabase mengonfirmasi konektivitas serta keberadaan `anshel.sessions` dan `anshel.tasks`. Login production tidak diulang. Pengujian Android fisik serta validasi pada Vercel Preview masih terbuka. Branch siap ditinjau untuk PR dan diuji di Preview. GitHub dan production tidak diubah.
