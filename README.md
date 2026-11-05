# THE SAI BUMI ENIGMA

Aplikasi pendaftaran kelompok Pra-Raker/Raker 2026. Next.js App Router, TypeScript strict, Tailwind CSS, Zod, Supabase Postgres + Storage; target hosting Vercel. **Supabase live sudah disiapkan, 35 peserta asli sudah diimpor, dan pendaftaran sudah dibuka. Koneksi/schema/Storage serta form aktif telah diperiksa. **Production:** https://sai-bumi-enigma.vercel.app (deployment 5 November 2026).** Lihat [status setup live](docs/live-setup-status.md).

## Menjalankan

Gunakan Node.js 22 LTS mutakhir dan npm. Dependency dikunci dalam `package-lock.json`.

```sh
npm ci
cp -n .env.example .env.local
npm run dev
```

Buka `http://localhost:3000`. Jika `.env.local` sudah ada, pertahankan dan tambahkan variabel example secara manual. Isi secret sendiri di komputer, jangan kirim melalui chat atau commit. File tersebut diabaikan Git.

- **Supabase:** `APP_DATA_MODE=supabase`, isi `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (atau `SUPABASE_SERVICE_ROLE_KEY` legacy), `SUPABASE_EVENT_SLUG`, bucket privat dan `APP_ORIGIN`. Ikuti [panduan setup](docs/supabase-setup.md) untuk migration, membuat event tertutup, import peserta, verifikasi lalu membuka pendaftaran. Semua query/key berada di modul `server-only`, tanpa prefix `NEXT_PUBLIC_`.
- **Tanpa konfigurasi:** petunjuk aman tanpa fixture/statistik palsu. Backend gagal menampilkan error + retry, tidak pernah beralih otomatis ke demo.
- **Demo eksplisit:** `APP_DATA_MODE=demo`, restart server. Semua data berlabel DEMO, dengan 36 UUID sintetis termasuk dua nama sama, satu grup contoh dan ilustrasi tim. Foto/pendaftaran hanya dalam memori tab, hilang saat reload; tidak memanggil Supabase.

## Yang tersedia

Header navigasi, jadwal HTML terpusat dan font lokal; form kelompok 1–4, tepat 8/9 pilihan nama searchable berbasis UUID/kode; larangan duplikat; satu foto JPG/PNG maksimal 3 MiB dengan preview/ganti; persetujuan publikasi; ringkasan/sukses; daftar kelompok dan waktu WIB; accordion peserta tersisa serta statistik dari snapshot repository. Tidak mengasumsikan total peserta 35.

Jalur Supabase memakai endpoint khusus untuk snapshot, sesi formulir, upload staging, submit JSON idempoten, dan signed URL foto grup terdaftar. Foto distaging sebelum submit, terikat event/cookie HttpOnly/proses formulir; database hanya menyimpan hash token. Konflik pilihan tidak membuang foto. RPC atomik mengklaim lease dan menyimpan seluruh anggota; hasil sukses yang response-nya hilang tetap dapat diambil lewat retry identik. Jalur RPC lama direvoke dari service_role. **Secret backend melewati RLS**, sehingga route dan RPC menegakkan seluruh aturan; service_role tidak mendapat akses tulis langsung ke tabel aplikasi.

Foto asli JPG/PNG maksimal **3 MiB**; multipart dibatasi **3 MiB + 64 KiB**, di bawah batas Vercel Node Functions yang terdokumentasi **4,5 MB**. MIME/signature, decode, dimensi maksimal 12.000 px per sisi dan total 40 MP diperiksa server; JPEG hasil re-encode maksimal 2400×2400, tanpa EXIF/GPS. Objek memakai UUID server pada bucket privat. Group photo endpoint hanya menerbitkan signed URL pendek (default 120 detik) untuk grup terdaftar pada event aktif; UI memperbaruinya sebelum expiry dan saat tab kembali terlihat, tanpa mencetak URL ke log. Lihat [alur foto](docs/photo-lifecycle.md) dan [batas resmi Vercel](https://vercel.com/docs/functions/limitations). Deployment production sudah aktif; halaman, snapshot Supabase dan endpoint sesi telah diperiksa.

Semua panel memakai snapshot server no-store, di-refresh sesudah sukses, saat focus/visibility kembali, dan setiap 30 detik ketika tab terlihat. Poll berhenti saat hidden/unmount. Konflik 409 menandai pilihan yang dipakai orang lain sambil menjaga pilihan lain/foto. Tidak membuat array pendaftaran optimistis atau fallback fixture. Submit ganda dilindungi ref UI, in-flight Promise dan idempotensi database.

Nama/foto kelompok dapat dilihat seluruh pengunjung halaman, dengan penjelasan dan persetujuan sebelum submit. Tidak mengumpulkan NIK, telepon, email atau login. Panitia mengelola master melalui Supabase Dashboard; tidak ada dashboard admin aplikasi.

## File dan dokumentasi

| Lokasi | Isi |
| --- | --- |
| `supabase/migrations/` | Tiga migration SQL produksi yang dapat direview; tanpa nama fixture |
| `supabase/scripts/` | Create-event, import staging berparameter event slug, verifikasi read-only |
| `supabase/templates/participants.template.csv` | Template `participant_code,full_name` |
| `supabase/examples/` | CSV sintetis terpisah, tidak diimpor otomatis |
| `src/server/` | Konfigurasi/key, SDK backend, validasi body/foto, layanan RPC/Storage, error mapping |
| `src/app/api/` | Lima route handler terbatas: snapshot, sesi, upload, submit, foto grup |
| `src/repositories/` | Interface, HTTP repository dengan key retry, demo terisolasi |
| `src/domain/`, `src/config/` | Zod/DTO/invarian dan konfigurasi acara |
| `src/components/`, `src/app/`, `public/` | UI responsif, poster, states dan font lokal/lisensi |
| `tests/` | Domain/server, PostgreSQL terisolasi, browser desktop/mobile |

Operasional: [supabase-setup.md](docs/supabase-setup.md). Foto/token/cleanup/runtime: [photo-lifecycle.md](docs/photo-lifecycle.md). Kontrak HTTP: [api-contract.md](docs/api-contract.md). Keputusan dan batas bukti: [implementation-plan.md](docs/implementation-plan.md).

## Environment backend

Seluruh environment di `.env.example` tanpa secret asli; `.env.local` tidak di-commit. Restart server setelah mengubahnya. `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (atau legacy `SUPABASE_SERVICE_ROLE_KEY`), `SUPABASE_EVENT_SLUG`, `SUPABASE_STORAGE_BUCKET=sai-bumi-team-photos` dan `APP_ORIGIN` dipakai backend. Origin harus persis cocok dengan URL halaman untuk POST, misalnya `http://localhost:3000`; tidak memakai CORS wildcard. `SUPABASE_DB_PASSWORD` hanya untuk operasi CLI/import lokal, bukan runtime aplikasi.

| Variabel | Default dan pemakaian |
| --- | --- |
| `APP_DATA_MODE` | supabase; demo harus dipilih eksplisit |
| `RATE_LIMIT_SECRET` | HMAC salt actor; fallback key backend; secret terpisah sudah disiapkan lokal |
| `UPLOAD_TOKEN_SECRET` | Secret HMAC sesi/token; fallback key backend; secret terpisah sudah disiapkan lokal |
| `TRUSTED_PROXY_SECRET` | Opsional; proxy sendiri wajib menimpa IP/header secret, jangan diberikan ke browser |
| `UPLOAD_TTL_SECONDS` | 3600, rentang 300–7200 |
| `UPLOAD_CLEANUP_GRACE_SECONDS` | 900, rentang 60–86400 |
| `PHOTO_SIGNED_URL_SECONDS` | 120, rentang 30–600 |
| `RATE_LIMIT_WINDOW_SECONDS` | 600, rentang 10–3600 |
| `RATE_LIMIT_RETENTION_SECONDS` | 172800 (48 jam), dipangkas oleh request/maintenance |
| `RATE_LIMIT_UPLOAD_ACTOR` / `RATE_LIMIT_UPLOAD_GLOBAL` | 20 / 100 per window |
| `RATE_LIMIT_SUBMIT_ACTOR` / `RATE_LIMIT_SUBMIT_GLOBAL` | 60 / 300 per window; retry hasil yang sudah committed tidak memakan budget |

Counter atomik tersimpan di Supabase dan terpisah antara upload/submit, bukan Map dalam proses serverless. Vercel memakai IP dari header platform X-Vercel-Forwarded-For. Di luar Vercel, IP header diabaikan kecuali proxy menambahkan X-Registration-Proxy-Secret yang cocok secara constant-time; tanpa proxy tepercaya request berbagi budget lokal. Flag lama TRUST_PROXY_HEADERS tidak lagi dipakai. IP bersama/NAT dapat berbagi kuota; raw IP tidak disimpan. 429 menyertakan Retry-After dan tidak membuang token/foto. Row expired dapat tetap ada sampai request/maintenance berikutnya; jadwalkan job untuk retensi operasional yang konsisten. Jangan rotate secret sesi selama proses upload/retry aktif tanpa memperhitungkan invalidasi sesi.

## Pemeriksaan

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

`test:db` memerlukan `initdb`, `pg_ctl`, `psql` di PATH. Selalu membuat cluster PostgreSQL baru di OS temp, memakai socket terisolasi lalu menghentikannya. Tidak menerima DATABASE_URL atau memakai/mereset DB yang sudah ada. Bootstrap Storage hanya meniru katalog SQL, bukan layanan Storage/PostgREST Supabase nyata.

Browser memakai build produksi dengan server demo, tanpa konfigurasi, dan backend loopback tak tersedia. Pasang Chromium melalui `npx playwright install chromium`, lalu `npm run test:e2e`. Jika Chrome sudah terpasang:

```sh
PLAYWRIGHT_CHROME_CHANNEL=chrome npm run test:e2e
```

Mobile adalah emulasi Chromium, bukan perangkat fisik/Safari. Lihat hasil aktual di dokumen implementasi; pengujian lokal tidak membuktikan Supabase live atau Vercel.

## Upload sementara

Lease default berlaku 1 jam, ditambah grace cleanup 15 menit. Untuk membersihkan foto gagal/terbengkalai, jalankan pada environment backend yang benar:

```sh
npm run uploads:cleanup
```

Maksimal 50 per batch; ulangi bila penuh. RPC mengunci event seperti submit, hanya mengklaim expired+grace yang tidak terpakai menjadi deleting; tidak mengklaim foto consumed/yang direferensikan grup. Backend menghapus Storage lalu menandai deleted, sehingga kegagalan delete/response dapat dicoba lagi. Maintenance juga memangkas row budget lama. Tidak menganggap Storage dan Postgres satu transaksi. Jangan menghapus foto setelah konflik/timeout commit. Saat operasional jadwalkan perintah ini per jam di scheduler backend tepercaya; belum memasang scheduler otomatis atau endpoint cleanup publik. Tombstone lease dipertahankan agar key/token tidak dipakai ulang.

## Batas verifikasi dan sumber

Pembaruan staging: lint/typecheck/build, 10 test domain/server, 15 test PostgreSQL dan 10 test browser lulus. Migration ketiga diterapkan live. Session/upload/retry token, konflik roster, Origin 403, ukuran 413, SDK signing dan cleanup objek uji telah diuji ke Supabase live tanpa membuat grup/roster sintetis. Skenario UI signed URL/konflik memakai fixture HTTP eksplisit. Submit grup nyata dan race lewat gateway live belum diklaim; lihat implementation-plan untuk batas buktinya.

Saat tahap implementasi backend, migration dan race condition diuji di PostgreSQL lokal terisolasi. Pada setup berikutnya, proyek baru Supabase telah dibuat: migration, RLS/grant, snapshot melalui route Next.js, penolakan event tertutup, import 35 peserta asli, aktivasi form, serta upload/download/delete file uji Storage berhasil diperiksa live. Uji pendaftaran kelompok lengkap/retry/race lewat gateway masih perlu dilanjutkan menggunakan komposisi tim yang benar. Scheduler cleanup belum disiapkan; Vercel production sudah aktif; lihat status live untuk batas bukti aktual.

Brief/poster di `references/` dipertahankan. Artifact Claude tidak dapat diakses saat tahap UI; alur mengikuti brief lokal. Palet adalah perkiraan desain, poster tidak dipotong atau dijadikan wallpaper form. Font DM Sans dan Cormorant Garamond di-host lokal via Fontsource, dengan salinan OFL di `public/licenses/`.
