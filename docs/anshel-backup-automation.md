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
