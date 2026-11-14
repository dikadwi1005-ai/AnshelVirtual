# Anshel — Cadangan database PostgreSQL terenkripsi

Workflow: `.github/workflows/anshel-database-backup.yml`.

- Jalankan `pg_dump` pada schema aplikasi `anshel` dari Supabase Session pooler (port 5432) setiap hari sekitar **09:17 WIB**. GitHub Actions dapat terlambat.
- Setiap dump diverifikasi melalui `pg_restore --list`, dienkripsi dengan `age`, kemudian hanya file `.age` terenkripsi diunggah sebagai artifact GitHub selama **14 hari**.
- Job **akan gagal** jika secret/recipient belum tersedia. Itu bukan bukti kehilangan data.
- Yang dicadangkan **tidak** mencakup Auth, objek Storage, pengaturan project, secrets n8n maupun roles global.
- Artifact 14 hari **bukan backup jangka panjang**. Simpan salinan ciphertext di penyimpanan terpisah, dan uji pemulihan ke database kosong/terisolasi.

## Konfigurasi pemilik

1. Di komputer milik sendiri, buat kunci enkripsi `age-keygen -o anshel-private-age-key.txt`. Simpan **private key** secara aman *di luar* GitHub dan chat. Catat public recipient `age1...`.
2. Buka GitHub repo **Settings → Secrets and variables → Actions**.
3. Buat **Secret** `ANSHEL_DATABASE_URL`: connection string PostgreSQL dari Supabase → anshel-virtual → Connect → **Session pooler port 5432**, menggunakan password database. Jangan memakai token API `backups_read`.
4. Buat **Variable** `ANSHEL_BACKUP_AGE_RECIPIENT`: public key `age1...`. Jangan masukkan private key.
5. Jalankan **Actions → Anshel - Backup PostgreSQL Terenkripsi → Run workflow** sekali. Konfirmasi status success **dan artifact terenkripsi**, bukan hanya status build.
6. Impor workflow n8n `Anshel · Backup GitHub Terenkripsi + Monitor Alya` setelah backup pertama sukses; gunakan credential Telegram Alya dan Chat ID grup. Biarkan backup monitor Supabase lama **Draft** agar tidak terjadi notifikasi ganda.

## Verifikasi pemulihan

Unduh artifact `.age` dan file checksum, lalu verifikasi checksum terhadap file terenkripsi. Dekripsi **secara lokal** dengan private key `age --decrypt -i anshel-private-age-key.txt -o anshel.dump FILE.dump.age`. Periksa `pg_restore --list anshel.dump` lalu lakukan `pg_restore --no-owner --no-acl --exit-on-error` **hanya ke database PostgreSQL terisolasi**, bukan Production. Verifikasi jumlah tabel dan baris. Jangan pernah melakukan restore Production otomatis.

**Jangan commit** connection string, private key, dump, atau token ke repository.

## Cloudflare R2 — lokasi backup kedua (di luar GitHub dan Supabase)

### Pengaturan di Cloudflare

Cloudflare R2 adalah storage S3-compatible yang independen dari GitHub dan Supabase. R2 memiliki kuota penggunaan gratis bulanan untuk **Standard storage**, tetapi akun R2 perlu diaktifkan di Cloudflare dan mungkin meminta metode pembayaran. Jangan aktifkan akses publik untuk bucket backup.

1. Masuk ke https://dash.cloudflare.com/ → **Storage & databases → R2 → Overview**.
2. Buat bucket **private**, misalnya `anshel-backups-secure`, dengan **Standard storage**; jangan buat Public Development URL atau custom public domain.
3. Di halaman R2, buka **Manage API tokens**, buat **R2 API token** dengan `Object Read & Write` dibatasi ke bucket tersebut **saja** (jangan All buckets jika tidak perlu).
4. Catat **Access Key ID** dan **Secret Access Key** (dua nilai berbeda) dan endpoint S3 R2. Jangan pernah mengunggah atau mem-paste kunci ke chat.

### Pengaturan GitHub (Settings → Secrets and variables → Actions)

**Repository Secrets (rahasia; jangan pernah pakai Variables untuk ini):**
- `ANSHEL_R2_ACCESS_KEY_ID` = R2 Access Key ID
- `ANSHEL_R2_SECRET_ACCESS_KEY` = R2 Secret Access Key

**Repository Variables (tidak rahasia):**
- `ANSHEL_BACKUP_R2_ENDPOINT` = endpoint S3 Cloudflare, bentuk `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- `ANSHEL_BACKUP_R2_BUCKET` = nama bucket private, misalnya `anshel-backups-secure`
- `ANSHEL_BACKUP_R2_ENABLED` = `true` **hanya setelah** seluruh nilai di atas lengkap.

Jika `ANSHEL_BACKUP_R2_ENABLED` belum diatur atau bukan `true`, backup primer di GitHub tetap berjalan seperti sebelumnya; ringkasan job akan menandai **offsite belum diaktifkan**.

### Verifikasi aktivasi

1. Setelah semua konfigurasi benar, jalankan GitHub Actions **Anshel - Backup PostgreSQL Terenkripsi → Run workflow**.
2. Pastikan langkah **Upload encrypted backup to Cloudflare R2 and verify it** sukses dan run GitHub status `success`.
3. Di Cloudflare R2 bucket, cek prefix `anshel/postgres/YYYY/MM/`, yang harus memuat:
   - `anshel-YYYYMMDDTHHMMSSZ.dump.age` (ciphertext; **jangan** file `.dump` biasa)
   - `anshel-YYYYMMDDTHHMMSSZ.dump.age.sha256`
   - `anshel-YYYYMMDDTHHMMSSZ.dump.age.info.json`
4. Job **mengunduh ulang ciphertext dari R2** dan membandingkan SHA-256 lokal vs hasil unduhan. Jika ada mismatch, autentikasi gagal, atau upload gagal, job ditandai **failure** agar n8n dapat memberi peringatan.
5. Artifact GitHub disimpan 14 hari; file R2 disimpan sampai dihapus sendiri atau oleh **Lifecycle Rule** yang kamu konfigurasi. Pertimbangkan retensi R2 180 hari atau lebih setelah kebutuhan pemulihan ditentukan.
6. Verifikasi restore ke PostgreSQL **terisolasi** tetap perlu. Bukti SHA-256 **bukan** bukti bahwa dump pasti bisa dipulihkan. Jangan mengimpor backup ke Production tanpa proses pemulihan resmi.

**Privasi:** jangan pernah menyimpan key enkripsi privat `age` di GitHub/R2 atau mengaktifkan akses publik bucket. R2 hanya menerima file yang sudah dienkripsi di runner.

Dokumentasi resmi:
- https://developers.cloudflare.com/r2/get-started/s3/
- https://developers.cloudflare.com/r2/api/tokens/
- https://developers.cloudflare.com/r2/pricing/
