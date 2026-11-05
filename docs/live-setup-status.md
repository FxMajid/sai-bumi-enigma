# Status setup Supabase live

Setup pada 4 November 2026 atas pilihan pengguna: proyek baru di organisasi **zjdev**, paket **Free**, region **Singapore (ap-southeast-1)**. Tidak mengubah proyek lama atau mengaktifkan add-on/upgrade berbayar. Belum deploy aplikasi ke Vercel.

- Proyek: **THE SAI BUMI ENIGMA**
- Project ref: `pqasiznnfidbsasygmip`
- [Dashboard proyek](https://supabase.com/dashboard/project/pqasiznnfidbsasygmip)
- Event slug: `the-sai-bumi-enigma-2026`
- Event UUID: `047f80e2-c9f0-4005-aae4-63e53e0d679e`
- Status pendaftaran: **dibuka**, sesuai pilihan pengguna setelah import/verifikasi roster.
- Master peserta: **35 peserta aktif** dari CSV pengguna; **0 terdaftar**, **35 belum terdaftar** saat setup selesai.

## Sudah dijalankan

1. Membuat proyek baru dan memeriksa status `ACTIVE_HEALTHY`.
2. Menyiapkan konfigurasi backend lokal dan link CLI. Password database acak dan key backend disimpan langsung di `.env.local` dengan permission 0600; tidak dicetak melalui chat/log. Token akun CLI tetap di Keychain, bukan disalin ke repository. Jangan membagikan atau commit `.env.local`.
3. Dry-run, lalu menerapkan dua migration melalui CLI. History remote cocok dengan file lokal:
   - `20261104000001_registration_schema.sql`
   - `20261104000002_registration_functions.sql`
4. Membuat event awal dalam keadaan `registration_open=false`, tanggal 24–27 November 2026.
5. Memeriksa database live: enam tabel memiliki RLS; anon/authenticated tidak mendapat EXECUTE RPC pendaftaran; backend mendapat EXECUTE RPC tetapi tidak mendapat INSERT langsung ke tabel groups. Bucket `sai-bumi-team-photos` privat, batas 3145728 byte dan MIME JPEG.
6. Menguji route Next.js lokal ke Supabase live: GET snapshot HTTP 200, statistik awal 0 peserta/0 terdaftar/0 tersisa, tanpa field internal. POST valid secara bentuk saat event tertutup mengembalikan HTTP 409 `REGISTRATION_CLOSED`; tidak membuat kelompok atau peserta uji.
7. Menguji Storage live memakai satu JPEG sintetis sementara: upload, download dan kecocokan hash berhasil; hanya objek uji tersebut kemudian dihapus. Tidak menyimpan foto atau peserta demo pada data acara.
8. Memvalidasi dan mengimpor 35 peserta asli dari CSV pengguna dalam satu transaksi: tanpa kode duplikat atau baris invalid. UUID/event_id berasal dari database dan event yang dituju diperiksa sebelum import. Statistik 35/0/35 terbaca kembali melalui database dan route Next.js.
9. Membuka `registration_open=true` atas pilihan pengguna. Chrome lokal memuat form aktif dengan tepat 8 kolom anggota default dan 35 pilihan peserta, tanpa label DEMO atau error browser. Layout viewport mobile tidak mengalami scroll horizontal. Tidak mengirim pendaftaran kelompok sembarang.
10. Menguji akses langsung menggunakan key publik ke RPC snapshot dan tabel participants: keduanya HTTP 401 dengan PostgreSQL `42501` (permission denied), bukan error key invalid. Route aplikasi dengan key backend tetap HTTP 200; response tidak mengandung field internal.

Pemeriksaan administratif yang memanggil RPC terlindungi harus dilakukan sebagai pemilik DB atau service_role. Role read-only milik Management API sengaja tidak diberi EXECUTE RPC tersebut; penolakan pada role itu bukan alasan membuka grant PUBLIC.

## Peserta sudah diimpor

CSV lokal sudah disiapkan di `supabase/import/participants.csv` dengan header:

```csv
participant_code,full_name
```

File aktual diabaikan Git dan memakai permission 0600. Pengguna telah mengisi serta mengonfirmasi CSV; 35 baris lolos validasi dan sudah diimpor memakai skrip staging ke event UUID di atas. Jangan mengulang import file yang sama karena kode yang sudah ada sengaja akan ditolak; koreksi master berikutnya melalui Dashboard. Tidak ada nama peserta yang dicetak di laporan/log pengujian.

Tidak ada batas total 35; angka tersebut berasal dari CSV dan database aktual. Untuk menjalankan aplikasi lokal dengan konfigurasi baru, restart `npm run dev` dan gunakan `http://localhost:3000` sesuai APP_ORIGIN. Server pada port 3104 hanya dipakai untuk pemeriksaan setup dan dihentikan setelahnya.

## Batas bukti

Koneksi live, migration, grant/RLS, snapshot, penolakan event tertutup, import roster asli, aktivasi form serta operasi Storage standalone telah diuji. Pendaftaran kelompok lengkap 8/9 anggota, retry/race lewat gateway live, dan persistensi foto kelompok melalui form belum diuji menggunakan roster acara asli; komposisi tim tidak dibuat sembarang. Pengujian transaksional/race lokal dari tahap backend tetap terpisah dari bukti ini. Belum membuat scheduler cleanup atau deployment Vercel.

Panduan lengkap: [supabase-setup.md](supabase-setup.md). Jangan menjalankan ulang create-event atau mengulang migration yang sudah tercatat; gunakan history CLI untuk migration berikutnya.


## Pembaruan protokol foto staging

Migration `20261104000003_staged_registration.sql` sudah diterapkan setelah pengujian lokal. Roster 35 peserta dan 0 kelompok dipertahankan. Foto memakai token sesi/event, submit JSON dan signed URL; RPC legacy backend direvoke. Secret token/rate limit dipisahkan lokal. Uji live: sesi/upload 200, retry token sama, konflik 409 tanpa klaim foto, Origin 403, ukuran 413, metadata validated dengan hash token/session, signed URL SDK/byte match dan endpoint foto yang menolak staging (404). Cleanup normal dengan grace membersihkan artefak uji sendiri setelah hanya lease uji itu dipercepat expiry; file tidak ada lagi, tombstone deleted tersimpan. Tidak menambah nama sintetis atau kelompok ke acara.

Rincian terkini, batas bukti serta perbedaan fixture browser/local SQL/live API ada di [implementation-plan.md](implementation-plan.md) dan [photo-lifecycle.md](photo-lifecycle.md). Riwayat tahap awal di atas tetap dicatat untuk membedakan pemeriksaan saat setup awal dengan protokol terbaru.
