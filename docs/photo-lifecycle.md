# Foto staging, signed URL dan sinkronisasi

## Protokol produksi

Sumber kebenaran adalah Supabase Postgres melalui endpoint Next.js server-only. Mode demo adalah simulasi eksplisit dan terpisah; tidak pernah menjadi fallback database. Tidak ada localStorage untuk pendaftaran/token/foto. State lokal hanya pilihan yang belum dikirim, preview, token sementara dan key retry.

1. Browser membuat processId UUID acak dalam instance formulir. POST `/api/registration/session` dari Origin situs menerbitkan cookie acak 256 bit, HttpOnly, SameSite=Strict, Path=/api, umur 24 jam, Secure jika origin HTTPS. Session disiapkan sebelum upload agar kehilangan response upload tidak menghilangkan cookie awal. Tidak ada akun/login atau sesi pengguna Supabase.
2. Browser mengirim multipart ke POST `/api/uploads`: tepat `data` JSON `{processId, uploadKey}` dan satu `photo`. Upload key UUID acak disimpan dalam memori sebelum request, sehingga response hilang dapat dicoba lagi. Data tidak berisi roster, nomor kelompok, path atau URL foto.
3. Server membatasi body, MIME/signature, decode dan pixel/dimensi; foto direorientasi, diresize dan diencode JPEG tanpa EXIF/GPS. Original tidak disimpan. DB membuat path `eventUUID/uploadUUID.jpg`, bukan nama file pengguna.
4. Token 256 bit dibuat melalui PRF HMAC-SHA256 dengan secret server dan domain/event/session/upload key. Output tidak dapat ditebak dan deterministik untuk recovery response upload yang hilang. DB menyimpan **hanya SHA-256 token**, HMAC session yang terikat cookie+processId+event, TTL, hash original/hasil JPEG, ukuran dan status validasi. Token mentah hanya dikirim dalam response no-store dan disimpan dalam memori formulir; tidak di-log. Pemisahan secret upload dari key Supabase direkomendasikan dan sudah disiapkan lokal.
5. Upload Storage memakai upsert=false. Request identik berbagi lease; jika objek sudah ada, backend memeriksa byte hash dan ukuran, lalu memvalidasi keberadaan metadata Storage. Storage dan Postgres **bukan satu transaksi**; lease pending yang terbengkalai menjadi tanggung jawab cleanup.
6. POST `/api/registrations` memakai JSON kecil `{registration, idempotencyKey, processId, uploadToken}`. Server menghitung hash token/session; RPC service_role mengunci event, memeriksa event aktif/terbuka, UUID aktif/event benar, tepat 8/9 anggota unik, serta lease validated dan belum expired/consumed. Roster, grup dan consumption token disimpan atomik. Unique constraints dan trigger deferred tetap aktif.
7. Konflik 409 tidak mengubah lease validated. UI memuat snapshot baru, menandai nomor/nama yang konflik, mempertahankan pilihan lain dan foto. Pemilihan baru membuat key submit baru, **tetap memakai foto/token yang sama selama TTL**. Token expired memicu reupload yang aman pada retry berikutnya, memakai file yang masih dipilih.
8. Retry identik memakai key/token/session semula. Lookup hasil yang sudah committed dilakukan sebelum rate budget, TTL dan status tutup; retry sukses tidak membuat mutasi kedua atau menghabiskan kuota submit. Jika response hilang, foto consumed tidak dihapus dan hasil asli tetap dapat diperoleh. Idempotency hash v2 mengikat urutan UUID, nomor/jumlah, foto dan UUID lease. Sesi cookie berumur 24 jam; reload kehilangan key/form lokal, tetapi constraints tetap mencegah grup/peserta ganda dan panel menampilkan data server.

## Batas runtime

Route adalah **Next.js Node.js**, bukan Edge. Upload/submit memiliki maxDuration 60 detik dan panggilan upstream timeout 10 detik. Dokumen Vercel Functions yang diperiksa mencantumkan batas request/response **4,5 MB**. Aplikasi menerapkan batas lebih kecil secara streaming, termasuk tanpa Content-Length:

- File asli maksimal **3 MiB = 3.145.728 byte**.
- Multipart total maksimal **3 MiB + 64 KiB = 3.211.264 byte**, mencakup nama file/boundary/metadata.
- Field JSON dan submit JSON maksimal 16 KiB; session body maksimal 1 KiB.
- JPEG/PNG satu frame; sisi maksimal 12.000 px dan total maksimal 40.000.000 pixel. Sharp memakai limitInputPixels sebelum decode.
- Hasil JPEG maksimal 2400×2400 tanpa enlargement dan maksimal 3 MiB. Metadata dibuang. Ketentuan ditampilkan sebelum upload; pada mode Supabase preview didecode setelah validasi server.

Sumber resmi: [batas Functions Vercel](https://vercel.com/docs/functions/limitations). Aplikasi belum dideploy ke Vercel; batas platform telah diverifikasi dari dokumentasi Node Functions dan pembatas aplikasi diuji lokal, bukan diklaim diuji pada deployment yang belum ada. Batas proxy lain di depan aplikasi tetap perlu disesuaikan saat hosting.

## Foto grup

Snapshot menyimpan link endpoint grup, bukan path internal atau signed URL. GET `/api/groups/{UUID}/photo` memeriksa UUID, event yang dikonfigurasi dengan `is_active=true`, grup terdaftar dan upload consumed. Event boleh menutup intake (`registration_open=false`) sambil tetap menampilkan foto; `is_active=false` menonaktifkan penerbitan URL baru. Endpoint tidak menerima path/token upload/event bebas.

Server menerbitkan signed URL Supabase Storage (default 120 detik) dalam JSON `{url,expiresAt}`, private/no-store. UI menggunakan URL secara langsung tanpa Next image optimizer, referrerPolicy=no-referrer, refresh 10 detik sebelum kedaluwarsa ketika tab terlihat, refresh saat tab kembali terlihat, dan retry ketika gambar gagal. Snapshot, token dan signed response tidak di-cache; URL/token tidak ditulis ke log. Capability yang telah diterbitkan dapat tetap dibaca sampai expiry meski event dinonaktifkan, sehingga TTL pendek penting.

## Rate limit serverless dan Origin

Penghitung ada di Supabase, UPSERT atomik per event, operation, actor hash dan fixed window; bukan Map proses. Upload dan submit mempunyai kuota terpisah yang dapat dikonfigurasi. Pemeriksaan budget adalah RPC tersendiri agar rollback submit yang konflik tidak membatalkan hitungan request. Retry hasil yang sudah committed dibaca sebelum budget dan tidak dimutasi ulang.

Di Vercel, IP hanya dibaca dari `X-Vercel-Forwarded-For` saat environment platform `VERCEL=1`. Di proxy sendiri, X-Forwarded-For baru dipercaya jika header server `X-Registration-Proxy-Secret` cocok secara constant-time dengan TRUSTED_PROXY_SECRET; proxy wajib menghapus nilai client dan menulis ulang kedua header itu. Flag lama TRUST_PROXY_HEADERS diabaikan. Tanpa sumber tepercaya, semua request memakai budget bersama (`shared`); tidak mempercayai header bebas.

IP divalidasi lalu di-HMAC dengan RATE_LIMIT_SECRET (fallback key backend). Raw IP tidak disimpan. NAT/kantor/proxy bersama bisa berbagi kuota; IP berubah juga bukan identitas pengguna yang tetap. Default upload 20/actor dan 100/event, submit 60/actor dan 300/event per 600 detik. Semua dapat dituning; request berlebihan HTTP 429 dengan Retry-After sepanjang window, tanpa membuang token/foto/key. Basic budget ini bukan autentikasi atau pengganti proteksi edge.

Row budget berumur logis satu window; retensi default 172800 detik (48 jam). Row lama dipangkas saat request baru dan saat maintenance manual/scheduled berjalan; tanpa request/maintenance, data dapat tetap tersimpan lebih lama sampai job dijalankan. Rotate salt hanya dengan mempertimbangkan reset identitas budget. Semua POST wajib Origin sama persis dengan APP_ORIGIN; APP_ORIGIN wajib untuk mutation dan tidak memakai fallback Host yang bisa dipilih client. Tidak ada CORS wildcard.

Sumber: [header tepercaya Vercel](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).

## Cleanup

`npm run uploads:cleanup` memanggil RPC baru dengan **grace period default 900 detik** setelah TTL 3600 detik. Kandidat hanya pending/validated/deleting, sudah melewati expiresAt+grace, dan tidak direferensikan grup. RPC mengunci row event yang sama dengan submit, kemudian mengklaim state deleting. Submit menolak deleting/expired. Backend menghapus objek melalui Storage API lalu menandai deleted; kegagalan delete/response dapat diulang tanpa overwrite.

Consumed atau foto yang direferensikan group tidak pernah diklaim, termasuk saat cleanup paralel dengan submit. Tidak menghapus file pada error submit atau timeout ambigu. Grace mengakomodasi request upload yang masih berjalan dan pemisahan Storage/DB. Lease tombstone dipertahankan agar key lama tidak dipakai untuk payload baru. RPC cleanup/pendaftaran lama direvoke dari service_role sehingga jalur tanpa grace/token tidak dapat digunakan backend.

Jalankan manual selama pengujian; saat operasional jadwalkan per jam di scheduler backend tepercaya yang menjalankan perintah sama dengan environment server, tanpa endpoint cleanup publik. Batch maksimal 50, ulangi bila penuh. Maintenance juga memangkas budget lama. Belum memasang scheduler otomatis atau deployment Vercel dalam tahap ini. Panitia yang membatalkan kelompok penuh mengelola foto consumed yang tak lagi dipakai melalui prosedur administratif terpisah.

## Sinkronisasi halaman

Snapshot selalu dibaca no-store dari satu RPC konsisten. Semua panel dibaca ulang setelah sukses; tidak membuat array pendaftaran optimistis. Poll 30 detik hanya ketika tab terlihat, timer dihentikan saat hidden/unmount, dan refresh segera saat visibility/focus kembali. Response lama tidak boleh menimpa response yang lebih baru. Error refresh memberi penanda data mungkin lama dan retry, tanpa fixture pengganti. Submit ganda dibatasi ref sinkron di UI dan shared in-flight Promise di HTTP repository, dengan idempotensi/unique constraints sebagai pengaman database.
