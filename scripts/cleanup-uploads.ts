import { loadEnvConfig } from "@next/env";
import { cleanupExpiredUploads } from "../src/server/registration-service";

loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
async function main() {
  try {
    const count = await cleanupExpiredUploads();
    process.stdout.write(`Foto sementara kedaluwarsa dibersihkan: ${count}. Jalankan lagi jika batch berisi 50 foto.\n`);
  } catch {
    process.stderr.write("Pembersihan belum berhasil. Periksa konfigurasi dan koneksi Supabase; jalankan kembali. Foto kelompok terdaftar tidak dihapus.\n");
    process.exitCode = 1;
  }
}
void main();
