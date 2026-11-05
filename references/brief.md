Bangun aplikasi pendaftaran kelompok acara “THE SAI BUMI ENIGMA” di workspace ini. Kerjakan implementasinya, jangan hanya memberikan contoh kode atau rencana.

Stack: Next.js App Router, TypeScript strict, Tailwind CSS, Zod, Supabase Postgres + Storage, deployment Vercel. Gunakan versi stabil yang kompatibel saat eksekusi, baca dokumentasi resmi bila perlu, simpan lockfile. Jangan gunakan layanan database atau hosting lain.

Periksa isi workspace dan instruksi proyek terlebih dahulu. Jika kosong, scaffold di folder saat ini. Jangan menimpa pekerjaan yang sudah ada. Buat README.md dan docs/implementation-plan.md sebagai catatan keputusan dan status. Jangan meminta secret melalui chat; cukup siapkan .env.example dan minta saya mengisi .env.local sendiri. Pastikan .env.local diabaikan Git.

Referensi alur: https://claude.ai/artifact/XAoi8oDciVbRPLmoS8vfuM
Jika tautan tidak dapat dibuka, gunakan spesifikasi di bawah sebagai sumber implementasi. Jangan mengklaim telah melihat bagian yang tidak dapat diakses.

Alur wajib:
1. Hero acara dan penjelasan satu perwakilan mengisi untuk seluruh kelompok.
2. Pilih nomor kelompok 1–4. Kelompok yang sudah terdaftar dinonaktifkan.
3. Pilih jumlah anggota 8 atau 9 orang.
4. Tampilkan persis sejumlah itu kolom pilihan nama yang dapat dicari. Jangan izinkan nama sama di dua kolom. Gunakan UUID peserta sebagai value, bukan nama; peserta berbeda boleh bernama sama dan perlu kode pembeda.
5. Upload satu foto lengkap tim, JPG/PNG, preview dan ganti foto sebelum submit.
6. Ringkasan dan tombol kirim. Tampilkan hasil berhasil dengan nomor kelompok dan anggota.
7. Bagian kelompok terdaftar, foto, nama anggota, waktu pendaftaran WIB.
8. Accordion “Peserta yang belum terdaftar (jumlah)” dengan pencarian.
9. Jumlah total peserta, terdaftar, dan belum terdaftar berasal dari database, tidak hardcode 35.

Asumsi akses: peserta menggunakan tautan tanpa login. Panitia mengelola master peserta melalui Supabase Dashboard; jangan tambahkan dashboard admin dulu. Jelaskan pada halaman bahwa daftar nama dan foto kelompok dapat dilihat pengunjung halaman ini. Jangan mengumpulkan NIK, telepon, atau email yang tidak diperlukan.

Desain berdasarkan file references/event-poster.png:
- Tema Lampung, petualangan/misteri, elegan. Gunakan warna perkiraan: latar #100F12, permukaan #1C1717, marun #700D16, emas #D7A442, krem #F5E7C6. Ini palet desain, bukan hasil sampling presisi.
- Hero menampilkan poster yang sama dengan rasio asli dan seluruh judul/tanggal tetap terlihat. Tidak perlu mengulang semua teks poster di atas gambar. Beri teks HTML terpisah untuk aksesibilitas dan informasi jadwal.
- Pra-Raker 24–25 November 2026; Raker 27 November 2026. Jadikan konfigurasi acara, bukan tersebar di komponen.
- Heading serif elegan; isi form sans-serif mudah dibaca. Font self-host/local bila memungkinkan, sertakan fallback.
- Ambil inspirasi siger emas dan kain tapis dari poster. Jangan mengganti siger dengan emoji mahkota. Jika tidak ada aset siger terpisah yang bersih, gunakan poster lengkap sebagai sumber visual dan ornamen CSS sederhana; jangan memotong judul atau mengarang logo resmi.
- Area formulir memakai permukaan gelap solid, garis emas tipis dan aksen marun. Tombol utama emas dengan teks gelap. Poster berteks tidak boleh diulang sebagai wallpaper di belakang isian.
- Desktop: form dan panel informasi/rekap; mobile: satu kolom, tanpa scroll horizontal, target sentuh minimal 44px. Ornamen tidak menghalangi interaksi.
- Sediakan loading, empty, error + retry, sukses, focus keyboard, label form, pesan validasi bahasa Indonesia, reduced-motion, kontras yang baik.

Tahap ini: implementasikan fondasi dan UI dengan repository interface yang siap dihubungkan ke Supabase pada tahap berikutnya. Data fixture sintetis hanya untuk mode demo eksplisit dan diberi label DEMO; jangan menyalin 35 nama referensi atau membuat fallback data palsu saat database gagal. Tanpa konfigurasi, mode produksi harus menampilkan petunjuk konfigurasi yang aman.

Jalankan lint, typecheck, dan build yang tersedia; perbaiki kegagalannya. Ringkas file yang dibuat, cara menjalankan, dan apa yang belum terhubung. Jangan deploy dulu.