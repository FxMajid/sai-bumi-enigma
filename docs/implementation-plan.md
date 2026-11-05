# Implementasi dan status verifikasi

## Keadaan akhir

UI produksi membaca Supabase melalui repository HTTP/route Next.js server-only. Tiga migration sudah diterapkan pada proyek `pqasiznnfidbsasygmip` organisasi zjdev. Event asli tetap berisi 35 peserta aktif, pendaftaran terbuka, dan belum ada kelompok yang dibuat saat verifikasi ini. Tidak ada reset database, perubahan komposisi tim sembarang, atau deploy Vercel.

| Area | Implementasi |
| --- | --- |
| UI | Poster/desain dipertahankan; 8/9 combobox UUID/kode, rekap, preview, sukses, error/retry |
| Data | Snapshot konsisten Postgres; no-store; refresh pasca sukses/focus/visibility, polling 30 detik hanya ketika terlihat |
| Foto staging | Session cookie HttpOnly + process UUID + token PRF 256 bit; DB hanya hash; TTL tanpa ikatan roster |
| Submit | JSON, lookup retry sebelum budget/expiry, RPC atomik mengklaim token dan menyimpan grup+anggota |
| Konflik | Snapshot diperbarui, pilihan konflik ditandai, pilihan lain/file/token dipertahankan |
| Foto terdaftar | Private Storage, signed URL default 120 detik dari endpoint grup/event aktif, pembaruan URL di UI |
| Rate limit | Supabase atomic UPSERT, terpisah upload/submit, konfigurabel, HMAC IP tepercaya/shared actor, 429 + Retry-After |
| Cleanup | TTL + grace, event lock yang sama dengan submit, claim/delete/finish, consumed/group references dikecualikan |
| Keamanan | Server-only keys/query, Zod, body/pixel bounds, MIME/signature/decode, metadata dibuang, Origin ketat, RLS/revoke |
| Operasional | README/env/kontrak/foto lifecycle diperbarui; cleanup manual tersedia; scheduler/Vercel belum dipasang |

## Keputusan penting

- State form dan kredensial staging hanya dalam memori instance; cookie sesi HttpOnly. Tidak menggunakan localStorage atau array pendaftaran optimistis sebagai sumber kebenaran. Demo sintetis hanya tersedia secara eksplisit, terpisah, tanpa fallback dari error database.
- Upload tidak memuat daftar anggota/nomor grup. Token terikat event, cookie sesi dan processId, dan dibuat dengan HMAC secret server atas upload key UUID acak. Derivasi ini memberi token yang tidak dapat ditebak sekaligus recovery response upload yang hilang tanpa menyimpan token mentah di database.
- Storage dan Postgres tidak dianggap satu transaksi: lease dibuat sebelum Storage, duplicate upload diverifikasi hash, metadata Storage harus cocok sebelum validated; consumption/grup/anggota baru satu transaksi di RPC. Upload gagal/konflik/timeout tidak dihapus langsung.
- Hash payload v2 mengikat urutan anggota, nomor/jumlah, foto dan UUID lease. Retry identik yang sudah committed tetap mengembalikan grup asli setelah TTL atau intake ditutup, sebelum budget; key berbeda/payload berbeda tidak dapat mengklaim foto consumed kedua kali.
- Legacy RPC prepare/register/cleanup tanpa token/grace direvoke dari service_role. Helper tetap owner-only untuk kompatibilitas data/migration lama. Trigger deferred memvalidasi jumlah anggota dan binding foto untuk grup lama maupun baru.
- events.is_active berbeda dari registration_open: intake dapat ditutup sambil foto grup terdaftar tetap terlihat; event nonaktif tidak menerbitkan URL baru. Capability yang sudah diterbitkan tetap berlaku sampai TTL pendeknya habis.
- Target Node.js, route upload/submit maxDuration 60 detik; upstream timeout 10 detik. File asli 3 MiB, multipart 3 MiB + 64 KiB di bawah batas Vercel Functions terdokumentasi 4,5 MB. Maksimum 12.000 px/sisi, 40 MP, hasil 2400×2400 JPEG tanpa EXIF/GPS. Preview produksi didecode setelah server menilai file.
- Rate budget dipanggil dalam transaksi tersendiri supaya rollback konflik tidak menghapus hitungan. Submit sukses idempoten tidak menghabiskan kuota lagi. Vercel memakai header platform; proxy sendiri perlu secret header yang diverifikasi; tanpa sumber terpercaya memakai satu budget shared. IP mentah tidak disimpan. Retensi default 48 jam dipangkas oleh request/maintenance; NAT/shared IP dapat berbagi kuota.
- Cleanup menunggu expiry+grace (default 3600+900 detik), mengunci event yang juga dipakai submit dan menolak referensi grup/consumed. Penghapusan gagal dapat diulang; tombstone dipertahankan. Belum ada job otomatis, perintah manual perlu dijadwalkan operator saat operasional.
- Semua POST wajib APP_ORIGIN yang cocok persis; tanpa wildcard CORS/fallback Host. Secret backend melewati RLS, sehingga route dan RPC memeriksa seluruh aturan; service_role tidak mendapat tulis langsung tabel aplikasi. Pemilik DB tetap administrasi tepercaya.

Rincian: [photo-lifecycle.md](photo-lifecycle.md), [api-contract.md](api-contract.md), [supabase-setup.md](supabase-setup.md).

## Bukti pengujian

| Pemeriksaan | Hasil |
| --- | --- |
| npm run lint | Lulus tanpa warning lint |
| npm run typecheck | Lulus TypeScript strict + noUncheckedIndexedAccess |
| npm test | 10 pengujian domain/server lulus |
| npm run test:db | 15 pengujian pada cluster PostgreSQL 14.19 terisolasi lulus |
| npm run build | Lulus; 5 API route dinamis dan halaman terbangun |
| Playwright Chrome desktop/mobile | 10 pengujian lulus; dua skenario baru memakai HTTP fixture eksplisit untuk konflik, retensi foto/pilihan, submit ganda, signed URL renewal dan visibility polling |
| Migration live | Migration 03 lolos dry-run dan diterapkan; roster/grup dipertahankan |
| Protokol staging live | Session 200, upload 200, retry upload token sama, snapshot no-store; dua submit roster invalid 409, file tetap validated/sesi terikat/tidak claimed |
| Proteksi HTTP live | Origin asing 403, file 3 MiB + 1 byte 413, upload sementara tidak bisa diakses lewat endpoint foto grup (404) |
| Storage signed URL live | SDK menerbitkan URL untuk objek uji privat milik proses ini; byte hash hasil fetch cocok; URL tidak dicetak |
| Cleanup live | Hanya lease uji tanpa grup dipercepat expiry untuk pengujian, normal cleanup dengan grace menghapus 1 objek; object absence + tombstone deleted terverifikasi |

Aplikasi benar-benar dijalankan lokal terhadap Supabase live. Tidak menambah peserta sintetis atau menyimpan kelompok yang disusun sembarang pada event asli. Uji happy path/concurrent claim/idempotent success/expiry/cleanup race dijalankan dengan service_role pada PostgreSQL terisolasi; old API regression dibatasi owner untuk membuktikan kompatibilitas dan pencabutan akses backend. Bootstrap katalog Storage lokal bukan layanan Supabase; bukti API/Storage live dicatat terpisah di atas.

Belum diklaim: upload protokol baru lewat browser ke Supabase live, submit satu kelompok nyata end-to-end dengan komposisi tim dari panitia, race dan response sukses hilang lewat gateway live, signed URL sukses untuk grup produksi yang benar-benar terdaftar (belum ada grup), Safari/perangkat fisik, audit screen reader penuh, Vercel platform deployment dan scheduler otomatis. UI signed URL success/renewal memakai fixture HTTP pada pengujian browser; SQL guard grup/event dan SDK signing diuji terpisah. Uji API live memakai objek staging sendiri dan semua artefak fotonya sudah dibersihkan.

## Tindak lanjut operasional

1. Jalankan npm run dev pada origin yang sesuai APP_ORIGIN dan uji komposisi tim nyata melalui form.
2. Jadwalkan npm run uploads:cleanup per jam dengan secret backend, termasuk prune retensi rate counter; periksa output batch dan retry bila gagal.
3. Siapkan deployment Vercel hanya jika diminta pengguna, isi environment production/preview terpisah dan verifikasi batas runtime di deployment aktual.

## Deployment production — 5 November 2026

Atas permintaan pengguna, aplikasi sudah dideploy ke https://sai-bumi-enigma.vercel.app pada proyek Vercel bedboys-projects/sai-bumi-enigma. Node runtime dipatok 22.x. Environment backend production dipasang sebagai secret melalui stdin CLI; password database, CSV peserta asli, dan .env.local tidak diunggah. Halaman publik dan snapshot HTTP 200, Cache-Control no-store; 35 peserta, 0 terdaftar, pendaftaran terbuka. Batas bukti pada bagian sebelumnya mencatat kondisi sebelum deployment; scheduler cleanup dan submit kelompok nyata masih belum diuji/dipasang.

Pembaruan tampilan setelah deployment: header navigasi tetap tersedia; gambar poster besar di hero dihapus sesuai koreksi pengguna. Versi tersebut sudah dideploy ulang dan HTML production terverifikasi.
