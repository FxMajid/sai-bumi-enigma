import "server-only";
import { RepositoryError, type RepositoryErrorCode } from "@/repositories/registration-repository";

const descriptions: Record<RepositoryErrorCode, { status: number; message: string }> = {
  VALIDATION: { status: 400, message: "Data belum valid. Periksa nomor kelompok, anggota, persetujuan, dan foto tim." },
  CONFLICT: { status: 409, message: "Nomor kelompok atau peserta sudah terdaftar. Muat ulang daftar dan periksa pilihan Anda." },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "Kunci pengiriman sudah digunakan untuk data berbeda. Muat ulang daftar sebelum mengirim kembali." },
  REGISTRATION_CLOSED: { status: 409, message: "Pendaftaran acara sedang ditutup oleh panitia." },
  UPLOAD_EXPIRED: { status: 409, message: "Masa berlaku foto sementara telah habis. Silakan kirim ulang foto dan data tim." },
  RATE_LIMITED: { status: 429, message: "Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi." },
  NOT_FOUND: { status: 404, message: "Data acara atau foto kelompok tidak ditemukan." },
  FORBIDDEN: { status: 403, message: "Permintaan harus dikirim dari halaman pendaftaran acara ini." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "Ukuran unggahan terlalu besar. Gunakan satu foto maksimal 3 MiB." },
  UNAVAILABLE: { status: 503, message: "Layanan pendaftaran belum dapat dihubungi. Coba lagi dengan data yang sama; jangan anggap pengiriman gagal sebelum memeriksa daftar kelompok." },
};

const rpcCodes: Record<string, RepositoryErrorCode> = {
  P1001: "VALIDATION", P1002: "CONFLICT", P1003: "REGISTRATION_CLOSED", P1004: "CONFLICT",
  P1005: "IDEMPOTENCY_CONFLICT", P1006: "VALIDATION", P1007: "UPLOAD_EXPIRED", P1009: "NOT_FOUND", P1029: "RATE_LIMITED",
  "23505": "CONFLICT",
};

export function fail(code: RepositoryErrorCode): never {
  throw new RepositoryError(code, descriptions[code].message);
}

export function throwDatabaseError(error: { code?: string } | null): void {
  if (error) fail(rpcCodes[error.code ?? ""] ?? "UNAVAILABLE");
}

export function errorResponse(error: unknown): Response {
  const code = error instanceof RepositoryError ? error.code : "UNAVAILABLE";
  const { status, message } = descriptions[code];
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store", ...(code === "RATE_LIMITED" ? { "Retry-After": String(Math.min(3600, Math.max(10, Number(process.env.RATE_LIMIT_WINDOW_SECONDS) || 600))) } : {}) },
  });
}
