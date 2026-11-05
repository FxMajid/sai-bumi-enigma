# Endpoint pendaftaran

Semua data dari event SUPABASE_EVENT_SLUG. Modul server-only memegang SDK/key; tidak ada API tabel atau event/path arbitrary. Semua response berikut memakai no-store. Error aman `{error:{code,message}}`; kode umum 400 VALIDATION, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT/IDEMPOTENCY_CONFLICT/REGISTRATION_CLOSED/UPLOAD_EXPIRED, 413 PAYLOAD_TOO_LARGE, 429 RATE_LIMITED (+Retry-After), 503 UNAVAILABLE. Tidak mem-forward SQL, key, signed URL, atau payload ke log.

| Endpoint | Request | Response |
| --- | --- | --- |
| GET /api/registration | Tanpa parameter event | Snapshot aktif: registrationOpen, participants, availableParticipants, groups, statistics |
| POST /api/registration/session | JSON kosong `{}`, Origin situs | `{ready:true}`, Set-Cookie sesi HttpOnly/SameSite Strict |
| POST /api/uploads | Multipart: `data` JSON `{processId:UUID,uploadKey:UUID}` + satu `photo` | `{token,expiresAt}`, private/no-store |
| POST /api/registrations | JSON `{registration:{groupNumber,memberCount,participantIds,consent:true},idempotencyKey:UUID,processId:UUID,uploadToken}` | Grup yang sudah committed; retry identik mengembalikan grup asli |
| GET /api/groups/{UUID}/photo | UUID grup terdaftar pada event aktif | `{url,expiresAt}` signed URL berumur pendek, private/no-store |

participants berisi UUID/nama/kode peserta aktif; availableParticipants hanya aktif dan belum ada di group_members. Grup memuat UUID, nomor, members, link endpoint foto dan registeredAt. Statistik/roster berasal dari satu snapshot database. Tidak ada event_id, path internal, hash, staging credential, atau key idempotensi dalam snapshot.

Sesi cookie disiapkan dahulu. Staging tidak terikat pilihan roster/nomor sehingga konflik tidak membuang foto. Token/session/event diverifikasi server dan RPC; client tidak dapat menentukan photo_path/URL/upload UUID. Batas foto, body, pixel, hash token, grace cleanup, signed URL, source IP dan retensi didokumentasikan rinci di [photo-lifecycle.md](photo-lifecycle.md).

Jika response submit tidak pasti, retry payload/token/key yang sama. UI mempertahankan data/foto; jangan menghapus file atau membuat key baru semata-mata karena timeout. Jika 409 akibat roster, refresh snapshot dan ganti hanya pilihan yang konflik; token tetap berlaku sampai TTL. UPLOAD_EXPIRED yang belum committed membolehkan reupload dan key baru. Hasil sukses yang sudah committed tetap dapat dibaca setelah TTL/tutup dan melewati budget submit; hash berbeda dengan key sama ditolak.
