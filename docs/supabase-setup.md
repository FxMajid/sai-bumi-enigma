# Menghubungkan Supabase tanpa mengekspos akses database

Kode server dan migration tersedia. **Proyek baru di organisasi zjdev sudah dibuat, terhubung, menerima tiga migration dan 35 peserta asli. Pendaftaran sudah dibuka.** Lihat [status setup live](live-setup-status.md) untuk project ref, event UUID dan hasil pemeriksaan. Langkah di bawah adalah panduan setup/operasional; jangan mengulang create-event, migration atau import CSV yang sudah diterapkan. Jangan mengirim URL dengan password, database password, secret key, atau file `.env.local` melalui chat.

## 1. Konfigurasi backend

Jika `.env.local` sudah ada, pertahankan isinya dan tambahkan/perbarui variabel dari `.env.example` secara manual. Jika belum ada, salin example. Isi secara lokal:

```dotenv
APP_DATA_MODE=supabase
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=ISI_SENDIRI_DI_KOMPUTER_ANDA
SUPABASE_EVENT_SLUG=the-sai-bumi-enigma-2026
SUPABASE_STORAGE_BUCKET=sai-bumi-team-photos
APP_ORIGIN=http://localhost:3000
TRUSTED_PROXY_SECRET=
```

Key di atas adalah placeholder. Gunakan secret backend `sb_secret_...` dari Dashboard Supabase. Jika proyek masih memakai legacy, kosongkan `SUPABASE_SECRET_KEY` dan isi `SUPABASE_SERVICE_ROLE_KEY` dengan JWT **service_role**, bukan anon. Jangan memakai key publishable/anon dan jangan menambahkan prefix `NEXT_PUBLIC_`. Variabel lama `NEXT_PUBLIC_SUPABASE_*` tidak dipakai aplikasi lagi. `APP_ORIGIN` harus sesuai origin halaman; kelak di Vercel isi URL HTTPS yang benar untuk masing-masing environment. Restart server setelah perubahan environment.

`RATE_LIMIT_SECRET` opsional, berisi nilai acak minimal 32 karakter yang dibuat/disimpan sendiri; jika kosong, backend menggunakan key backend sebagai HMAC secret. DB hanya menyimpan hash aktor, bukan alamat IP. Di Vercel dipakai header IP platform. Di proxy sendiri, IP baru dipercaya bila proxy menimpa X-Forwarded-For dan menyisipkan header X-Registration-Proxy-Secret yang cocok dengan TRUSTED_PROXY_SECRET. Flag lama TRUST_PROXY_HEADERS diabaikan. Default memakai satu budget bersama agar client tidak bebas memilih identitas rate limit.

**Key backend melewati RLS.** RLS sendiri tidak membatasi secret ini. Oleh karena itu route handler memvalidasi input/origin/batas ukuran, dan RPC memeriksa ulang seluruh aturan bisnis. Akses langsung service_role ke tabel aplikasi juga direvoke; backend hanya mendapat EXECUTE untuk RPC tertentu. Pemilik database/role administratif tetap berwenang mengubah schema dan wajib diperlakukan sebagai akses panitia tepercaya.

## 2. Review dan jalankan migration

Review berurutan:

1. `supabase/migrations/20261104000001_registration_schema.sql`
2. `supabase/migrations/20261104000002_registration_functions.sql`
3. `supabase/migrations/20261104000003_staged_registration.sql`

Ketiganya memakai transaksi, tanpa reset, drop tabel, atau seed nama peserta. Jika sudah ada tabel dengan nama yang sama, migration sengaja gagal agar benturan ditinjau; jangan menghapus tabel lama untuk memaksanya. Bucket khusus harus privat dan memiliki pengaturan yang tepat; migration akan gagal bila bucket bernama sama ternyata berbeda konfigurasi. Policy restrictive hanya menyangkal akses anon/authenticated ke bucket khusus, tanpa membuka akses ke bucket lain.

Dengan CLI Supabase yang sudah terpasang, dari root repository:

```sh
supabase login
supabase link --project-ref PROJECT_REF_ANDA
supabase db push --linked --dry-run --skip-vault
```

Periksa project ref, target environment, riwayat migration, dan daftar file pending yang akan diterapkan. Setelah review, jalankan sendiri:

```sh
supabase db push --linked --skip-vault
```

Jangan gunakan `db reset`, `--include-all`, atau `--include-seed` untuk database yang sudah ada. `--skip-vault` mencegah sinkronisasi Vault yang tidak diperlukan (flag tersedia pada CLI yang diperiksa saat implementasi). Bila CLI Anda berbeda, baca `supabase db push --help` sebelum menjalankan. `supabase/config.toml` menonaktifkan seed.

Alternatif jika tidak memakai CLI: jalankan isi file SQL secara berurutan di SQL Editor Supabase sebagai pemilik database, lalu simpan catatan penerapannya. Jangan kemudian menjalankan file yang sama lagi lewat CLI tanpa merekonsiliasi history; pilih satu workflow migration yang konsisten. SQL Editor mendukung SQL, sedangkan perintah `\copy` di langkah import memerlukan psql.

## 3. Buat event awal dalam keadaan tertutup

Jalankan `supabase/scripts/create-event.sql` sekali di SQL Editor atau psql. Slug harus sama persis dengan `SUPABASE_EVENT_SLUG`. Skrip menyimpan rentang tanggal 24–27 November 2026 dan `registration_open=false`. Jadwal detail Pra-Raker/Raker tetap di konfigurasi UI `src/config/event.ts`.

Catat `id` hasil query untuk memeriksa import. Bila slug sudah ada, periksa row itu; jangan menghapus atau mengganti event yang sudah memiliki peserta/kelompok. Koreksi judul/tanggal melalui Dashboard bila diperlukan. Pendaftaran tetap tertutup selama master peserta disiapkan.

## 4. Import CSV ke event yang benar

Template produksi: `supabase/templates/participants.template.csv`, tepat dua kolom:

```csv
participant_code,full_name
```

Salin ke `supabase/import/participants.csv`, lalu isi nama sebenarnya **di komputer sendiri**. Folder import CSV diabaikan Git. Kode peserta harus stabil/unik di event, 1–40 karakter huruf/angka/underscore/tanda minus. Nama boleh sama; kode dan UUID yang membedakannya. Tidak ada kolom status pendaftaran pada master. Tidak ada batas total 35; peserta aktif dan relasi `group_members` menentukan daftar/statistik.

Skrip `supabase/scripts/import-participants.psql` mengimpor dua kolom ke tabel temporary, mencari tepat satu event berdasarkan slug, mengunci event, lalu menyisipkan dengan `event_id` row tersebut. UUID dan `is_active=true` memakai default database. Header/urutan kolom CSV harus tetap sesuai template. File kosong, format buruk, nama kosong, kode duplikat di CSV/database, atau event yang tidak ditemukan membatalkan seluruh transaksi. Skrip bersifat insert-only; tidak menimpa identitas yang sudah ada.

Gunakan psql dengan koneksi pemilik DB Supabase dari Dashboard **Connect**. Simpan konfigurasi koneksi sebagai service libpq lokal `sai_bumi` (`~/.pg_service.conf`) dan password di `~/.pgpass` dengan permission 0600, atau masukkan password lewat prompt psql. Jangan menulis password ke argument shell/history, repo, atau chat. Dari root repository:

```sh
psql 'service=sai_bumi' -v ON_ERROR_STOP=1 -v event_slug=the-sai-bumi-enigma-2026 -f supabase/scripts/import-participants.psql
```

Verifikasi row `participants` di Dashboard: semua `event_id` sama dengan id event yang dicatat; kode benar; `is_active=true`. Untuk import lewat UI Dashboard, CSV perlu kolom tambahan `event_id` berisi UUID event pada setiap baris; template dua kolom sebaiknya dipakai dengan skrip staging di atas agar salah event dapat dicegah. Jangan memasang default event global pada tabel.

Contoh delapan peserta sintetis ada di `supabase/examples/participants.synthetic.csv`, terpisah dari migration, dan hanya untuk proyek uji yang dipilih sengaja. Tidak pernah diimpor otomatis. Contoh dua nama identik sengaja memakai kode berbeda. Pembagian 35 peserta menjadi 9+9+9+8 diuji di test database, bukan dipaksakan ke data produksi.

## 5. Verifikasi dan buka pendaftaran

Jalankan `supabase/scripts/verify.sql` sebagai pemilik database. Sesuaikan slug jika berbeda. Pastikan:

- Enam tabel aplikasi memiliki `relrowsecurity=true`.
- `anon_execute=false`, `authenticated_execute=false` untuk seluruh RPC internal; `backend_execute=true` hanya pada RPC backend yang didaftarkan.
- Bucket `sai-bumi-team-photos` memiliki `public=false`, batas 3 MB, dan MIME `image/jpeg`. File PNG/JPG masuk melalui server dan dinormalisasi menjadi JPEG tanpa EXIF/GPS.
- Statistik total sesuai jumlah peserta aktif; registered 0 sebelum ada kelompok; unregistered sama dengan total. Tidak ada nama fixture otomatis.

Setelah master benar, jalankan secara sengaja:

```sql
update public.events set registration_open = true
where slug = 'the-sai-bumi-enigma-2026';
```

Kemudian:

```sh
npm run dev
```

Buka origin yang sesuai `APP_ORIGIN`. Mode tanpa konfigurasi menampilkan petunjuk aman. Koneksi/backend gagal menampilkan error + retry tanpa fallback demo. Mode Supabase tidak berlabel DEMO. `GET /api/registration` seharusnya berisi hanya DTO direktori/statistik/kelompok yang diperlukan, tanpa key, event_id, payload_hash, idempotency_key, photo_path, status upload, atau pesan SQL.

Uji pada proyek Supabase uji terlebih dahulu: kirim satu kelompok, lihat 8/9 anggota tersimpan, reload halaman, dan periksa foto melalui `/api/groups/{UUID}/photo`. Endpoint ini mengembalikan signed URL pendek dan expiresAt; UI memperbaruinya sebelum expiry. Tidak ada public bucket atau input path bebas. Uji retry dengan payload dan key yang sama, key sama dengan data berbeda, dua request bersamaan untuk nomor/peserta sama, event ditutup saat form masih terbuka, foto tidak valid, dan koneksi gagal setelah commit. Uji key anon/authenticated terhadap tabel/RPC/Storage: harus ditolak. Test lokal tidak menggantikan pemeriksaan gateway Storage/PostgREST live ini.

## 6. Foto sementara dan maintenance

Upload belum terkonsumsi kedaluwarsa setelah default 1 jam; cleanup menunggu grace period tambahan 15 menit. TTL/grace dapat dikonfigurasi. Jangan langsung menghapus upload ketika hasil commit tidak pasti: request lain dengan key sama bisa sudah berhasil. `submit_staged_registration` terlebih dahulu mencari hasil idempoten sebelum memeriksa tutup/kedaluwarsa, sehingga retry tetap menemukan pendaftaran sukses.

Jalankan perintah maintenance terkontrol di environment backend yang sama (mode Supabase):

```sh
npm run uploads:cleanup
```

Setiap batch maksimal 50: RPC mengklaim upload pending/validated yang telah melewati expiresAt + grace menjadi `deleting` di bawah lock event; server menghapus objek Storage; RPC menandai `deleted`. Upload terhubung ke grup/consumed tidak dapat diklaim. Jika delete jaringan gagal, state deleting dapat dicoba lagi. Row lease tetap disimpan untuk menjaga ikatan key/payload. Jalankan per jam melalui scheduler operasional yang Anda kelola atau manual selama acara; sesi ini tidak membuat deployment/scheduler. Rate-limit row lama dibersihkan saat request atau maintenance berikutnya. Detail token/sesi, retensi, konfigurasi dan batas runtime terbaru ada di [photo-lifecycle.md](photo-lifecycle.md). Belum ada background worker otomatis di aplikasi.

## 7. Koreksi master dan pembatalan oleh panitia

Nama/kode dapat dikoreksi melalui Dashboard, dengan kode tetap unik per event. Peserta yang telah berada di `group_members` **tidak dapat dinonaktifkan, dipindah event, dihapus, atau diubah UUID-nya**. Tidak ada status terdaftar duplikat di participants.

Untuk mengeluarkan peserta yang sudah tergabung, lakukan review panitia dan pembatalan **satu kelompok penuh**, bukan menghapus satu anggota sehingga jumlahnya 7. Prosedur pemilik DB:

1. Catat alasan/persetujuan panitia dan arsipkan daftar kelompok yang akan dibatalkan di tempat administrasi tepercaya.
2. Tutup `registration_open` event. Dalam satu transaksi pemilik DB, kunci row event `FOR UPDATE`, hapus seluruh `group_members` kelompok target berdasarkan **event_id dan group_id**, lalu hapus row `groups` target. Baru setelah tidak tergabung, nonaktifkan peserta bila diperlukan; commit. Constraint deferred menolak kelompok parsial pada akhir transaksi. Jangan menonaktifkan trigger atau constraint.
3. Periksa snapshot/statistik dan buka kembali pendaftaran setelah roster dibetulkan. Key/hasil dari kelompok yang sengaja dibatalkan tidak dijanjikan dapat dipakai lagi; key baru diperlukan.
4. Foto consumed dari kelompok dibatalkan tidak dihapus otomatis. Setelah memastikan tidak ada grup yang mereferensikan path itu, panitia menghapus file yang sesuai melalui Dashboard Storage. Tidak ada endpoint publik untuk pembatalan/deaktivasi.

Pemilik database tetap bisa melakukan DDL dan menonaktifkan guard secara administratif; aplikasi tidak mengklaim dapat membatasi superuser. Akses administratif hanya untuk panitia tepercaya. Jangan mengubah grup/members/upload secara langsung untuk menghindari RPC pada operasi pendaftaran normal.

## Referensi resmi

[Supabase API keys](https://supabase.com/docs/guides/api/api-keys), [fungsi database dan hak EXECUTE](https://supabase.com/docs/guides/database/functions), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers).
