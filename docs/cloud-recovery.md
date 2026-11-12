# Backup dan pemulihan data Anshel

Artefak teks tersimpan bersama tugas di `anshel.tasks`. Cadangan skema `anshel` mencakup isi artefak, SHA-256, antrean, pengaturan, dan riwayat audit. Isi sesi login dan penghitung percobaan login dikecualikan. Setelah pemulihan, Dika masuk lagi dengan kata sandi pemilik.

Gunakan `pg_dump` dan `pg_restore` dari versi PostgreSQL yang setara dengan server atau lebih baru. Ambil koneksi **Direct** dari Supabase Connect atau pakai **Session pooler** jika jaringan hanya mendukung IPv4. Masukkan koneksi sumber dan tujuan sebagai variabel privat pada terminal yang sama. [Dokumentasi koneksi Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) · [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).

## Ambil cadangan

Isi `ANSHEL_BACKUP_DB_URL` dengan koneksi sumber. Simpan arsip dan checksum di lokasi privat.

```powershell
if (-not $env:ANSHEL_BACKUP_DB_URL) { throw 'Isi koneksi sumber backup.' }
$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force data/backups | Out-Null
$archive = "data/backups/anshel-cloud-$stamp.dump"
pg_dump --dbname=$env:ANSHEL_BACKUP_DB_URL --format=custom --schema=anshel `
  --exclude-table-data=anshel.sessions --exclude-table-data=anshel.login_limits --file=$archive
if ($LASTEXITCODE -ne 0) { throw 'Backup gagal.' }
(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash | Set-Content "$archive.sha256"
```

## Latihan pemulihan

Isi `ANSHEL_RESTORE_DB_URL` dengan koneksi database uji yang belum mempunyai skema `anshel`. Pastikan tujuan memiliki role `anon` dan `authenticated` agar aturan akses ikut dipulihkan. Gunakan arsip dan checksum dari proses backup di atas. [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html).

```powershell
if (-not $env:ANSHEL_RESTORE_DB_URL) { throw 'Isi koneksi database uji.' }
$expected = (Get-Content -LiteralPath "$archive.sha256" -Raw).Trim()
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) { throw 'Checksum arsip berbeda.' }
pg_restore --dbname=$env:ANSHEL_RESTORE_DB_URL --single-transaction --no-owner $archive
if ($LASTEXITCODE -ne 0) { throw 'Restore gagal.' }
```

Bandingkan jumlah baris `setting`, `tasks`, dan `audit` dengan sumber. Uji login baru, pastikan artefak tertutup sebelum login, lalu unduh satu artefak dan cocokkan SHA-256. Pastikan tugas baru mendapat nomor urut lebih tinggi. Jika cadangan memuat tugas berstatus `running`, rekonsiliasi statusnya sebelum menghubungkan kembali worker.
