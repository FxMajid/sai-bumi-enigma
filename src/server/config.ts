import "server-only";
import { z } from "zod";
import type { DataConfiguration } from "@/config/runtime";
import { RepositoryError } from "@/repositories/registration-repository";

const serverUrl = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
});

function isBackendKey(value: string) {
  if (value.startsWith("sb_secret_") && value.length >= 32) return true;
  try {
    const payload: unknown = JSON.parse(Buffer.from(value.split(".")[1] ?? "", "base64url").toString("utf8"));
    return z.object({ role: z.literal("service_role") }).safeParse(payload).success;
  } catch { return false; }
}

const backendConfigSchema = z.object({
  url: serverUrl,
  key: z.string().min(32).refine(isBackendKey),
  eventSlug: z.string().max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  bucket: z.literal("sai-bumi-team-photos"),
  appOrigin: serverUrl.optional(),
  rateLimitSecret: z.string().min(32).optional(),
  uploadTokenSecret: z.string().min(32).optional(),
  trustedProxySecret: z.string().min(32).optional(),
  uploadTtlSeconds: z.coerce.number().int().min(300).max(7200).default(3600),
  cleanupGraceSeconds: z.coerce.number().int().min(60).max(86400).default(900),
  signedUrlSeconds: z.coerce.number().int().min(30).max(600).default(120),
  rateWindowSeconds: z.coerce.number().int().min(10).max(3600).default(600),
  rateRetentionSeconds: z.coerce.number().int().min(3600).max(604800).default(172800),
  uploadActorLimit: z.coerce.number().int().min(1).max(10000).default(20),
  uploadGlobalLimit: z.coerce.number().int().min(1).max(100000).default(100),
  submitActorLimit: z.coerce.number().int().min(1).max(10000).default(60),
  submitGlobalLimit: z.coerce.number().int().min(1).max(100000).default(300),
});
export type BackendConfig = z.infer<typeof backendConfigSchema>;

function parseBackendConfig() {
  return backendConfigSchema.safeParse({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    eventSlug: process.env.SUPABASE_EVENT_SLUG,
    bucket: process.env.SUPABASE_STORAGE_BUCKET || "sai-bumi-team-photos",
    appOrigin: process.env.APP_ORIGIN || undefined,
    rateLimitSecret: process.env.RATE_LIMIT_SECRET || undefined,
    uploadTokenSecret: process.env.UPLOAD_TOKEN_SECRET || undefined,
    trustedProxySecret: process.env.TRUSTED_PROXY_SECRET || undefined,
    uploadTtlSeconds: process.env.UPLOAD_TTL_SECONDS || undefined,
    cleanupGraceSeconds: process.env.UPLOAD_CLEANUP_GRACE_SECONDS || undefined,
    signedUrlSeconds: process.env.PHOTO_SIGNED_URL_SECONDS || undefined,
    rateWindowSeconds: process.env.RATE_LIMIT_WINDOW_SECONDS || undefined,
    rateRetentionSeconds: process.env.RATE_LIMIT_RETENTION_SECONDS || undefined,
    uploadActorLimit: process.env.RATE_LIMIT_UPLOAD_ACTOR || undefined,
    uploadGlobalLimit: process.env.RATE_LIMIT_UPLOAD_GLOBAL || undefined,
    submitActorLimit: process.env.RATE_LIMIT_SUBMIT_ACTOR || undefined,
    submitGlobalLimit: process.env.RATE_LIMIT_SUBMIT_GLOBAL || undefined,
  });
}

export function getDataConfiguration(): DataConfiguration {
  const mode = process.env.APP_DATA_MODE ?? "supabase";
  if (mode === "demo") return { mode: "demo" };
  if (mode !== "supabase") return { mode: "unavailable", reason: "invalid-mode" };
  return parseBackendConfig().success ? { mode: "supabase" } : { mode: "unavailable", reason: "missing-config" };
}

export function getBackendConfig(): BackendConfig {
  const config = parseBackendConfig();
  if ((process.env.APP_DATA_MODE ?? "supabase") !== "supabase" || !config.success) {
    throw new RepositoryError("UNAVAILABLE", "Layanan pendaftaran belum dikonfigurasi oleh pengelola.");
  }
  return config.data;
}
