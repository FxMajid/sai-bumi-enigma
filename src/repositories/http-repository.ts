import { z } from "zod";
import { registeredGroupSchema, registrationSnapshotSchema, type RegistrationInput } from "@/domain/registration";
import { RepositoryError, type RegistrationRepository } from "./registration-repository";

const errorSchema = z.object({ error: z.object({
  code: z.enum(["CONFLICT", "VALIDATION", "UNAVAILABLE", "IDEMPOTENCY_CONFLICT", "REGISTRATION_CLOSED", "UPLOAD_EXPIRED", "RATE_LIMITED", "NOT_FOUND", "FORBIDDEN", "PAYLOAD_TOO_LARGE"]),
  message: z.string(),
}) });

async function readResponse(response: Response): Promise<unknown> {
  let data: unknown;
  try { data = await response.json(); } catch { throw new RepositoryError("UNAVAILABLE", "Respons layanan belum dapat dibaca. Coba kirim kembali dengan data yang sama."); }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(data);
    if (parsed.success) throw new RepositoryError(parsed.data.error.code, parsed.data.error.message);
    throw new RepositoryError("UNAVAILABLE", "Layanan pendaftaran belum dapat dihubungi. Coba lagi.");
  }
  return data;
}

/** Only same-origin HTTP here. No Supabase SDK, keys, table names or storage paths. */
export class HttpRegistrationRepository implements RegistrationRepository {
  private readonly processId = crypto.randomUUID();
  private sessionReady = false;
  private staged: { fingerprint: string; uploadKey: string; token?: string; expiresAt?: string } | null = null;
  private stagingFlight: { file: File; promise: Promise<{ expiresAt: string }> } | null = null;
  private pending: { fingerprint: string; key: string } | null = null;
  private registrationFlight: Promise<import("@/domain/registration").RegisteredGroup> | null = null;

  async getSnapshot() {
    try {
      return registrationSnapshotSchema.parse(await readResponse(await fetch("/api/registration", { cache: "no-store", signal: AbortSignal.timeout(20_000) })));
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      throw new RepositoryError("UNAVAILABLE", "Daftar peserta belum dapat dimuat. Silakan coba lagi.");
    }
  }

  stagePhoto(photo: File): Promise<{ expiresAt: string }> {
    if (this.stagingFlight?.file === photo) return this.stagingFlight.promise;
    const promise = this.upload(photo).finally(() => { if (this.stagingFlight?.promise === promise) this.stagingFlight = null; });
    this.stagingFlight = { file: photo, promise };
    return promise;
  }

  private async photoFingerprint(photo: File) {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await photo.arrayBuffer())), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  private async upload(photo: File) {
    const fingerprint = await this.photoFingerprint(photo);
    if (this.staged?.fingerprint === fingerprint && this.staged.token && this.staged.expiresAt) return { expiresAt: this.staged.expiresAt };
    if (this.staged?.fingerprint !== fingerprint) this.staged = { fingerprint, uploadKey: crypto.randomUUID() };
    const stage = this.staged!;
    if (!this.sessionReady) {
      await readResponse(await fetch("/api/registration/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal: AbortSignal.timeout(20_000) }));
      this.sessionReady = true;
    }
    const form = new FormData();
    form.set("data", JSON.stringify({ processId: this.processId, uploadKey: stage.uploadKey }));
    form.set("photo", photo);
    const data = await readResponse(await fetch("/api/uploads", { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(65_000) }));
    const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), expiresAt: z.iso.datetime({ offset: true }) }).parse(data);
    // Store credentials only in this in-memory form instance, never localStorage.
    stage.token = parsed.token; stage.expiresAt = parsed.expiresAt;
    return { expiresAt: parsed.expiresAt };
  }

  register(input: RegistrationInput, photo: File) {
    // Synchronous promise guard also covers double clicks before React rerenders.
    if (this.registrationFlight) return this.registrationFlight;
    const promise = this.submit(input, photo).finally(() => { if (this.registrationFlight === promise) this.registrationFlight = null; });
    this.registrationFlight = promise;
    return promise;
  }

  private async submit(input: RegistrationInput, photo: File) {
    try {
      await this.stagePhoto(photo);
      const token = this.staged?.token;
      if (!token) throw new RepositoryError("UPLOAD_EXPIRED", "Unggah foto tim kembali.");
      const fingerprint = JSON.stringify(input) + token;
      if (this.pending?.fingerprint !== fingerprint) this.pending = { fingerprint, key: crypto.randomUUID() };
      const data = await readResponse(await fetch("/api/registrations", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(65_000),
        body: JSON.stringify({ registration: input, idempotencyKey: this.pending.key, processId: this.processId, uploadToken: token }),
      }));
      return registeredGroupSchema.parse(data);
    } catch (error) {
      // Never discard staging/key for ambiguous failures or roster conflicts.
      if (error instanceof RepositoryError && error.code === "UPLOAD_EXPIRED") { this.staged = null; this.pending = null; this.sessionReady = false; }
      if (error instanceof RepositoryError) throw error;
      throw new RepositoryError("UNAVAILABLE", "Hasil pengiriman belum dapat dipastikan. Coba lagi dengan data yang sama untuk memeriksa hasilnya.");
    }
  }

  dispose() { this.pending = null; this.staged = null; this.sessionReady = false; }
}
