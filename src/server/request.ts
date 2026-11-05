import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isIP } from "node:net";
import { event } from "@/config/event";
import { registrationSchema } from "@/domain/registration";
import type { BackendConfig } from "./config";
import { fail } from "./errors";

export const uploadRequestSchema = z.object({ processId: z.uuid(), uploadKey: z.uuid() }).strict();
export const registrationRequestSchema = z.object({ registration: registrationSchema, idempotencyKey: z.uuid(), processId: z.uuid(), uploadToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export function enforceOrigin(request: Request, config: BackendConfig) {
  if (!config.appOrigin) fail("FORBIDDEN");
  const expected = new URL(config.appOrigin).origin;
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") fail("FORBIDDEN");
}

export function actorHash(request: Request, config: BackendConfig) {
  let header: string | null = null;
  if (process.env.VERCEL === "1") header = request.headers.get("x-vercel-forwarded-for");
  else if (config.trustedProxySecret) {
    const supplied = Buffer.from(request.headers.get("x-registration-proxy-secret") ?? "");
    const expected = Buffer.from(config.trustedProxySecret);
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) header = request.headers.get("x-forwarded-for");
  }
  const candidate = header?.split(",")[0]?.trim() ?? "";
  const actor = isIP(candidate) ? candidate : "shared";
  return createHmac("sha256", config.rateLimitSecret ?? config.key).update("rate-actor:v1:" + actor).digest("hex");
}

export async function readBoundedBody(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) fail("PAYLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) fail("VALIDATION");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); fail("PAYLOAD_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function readSubmission(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) fail("VALIDATION");
  let json: unknown;
  try { json = JSON.parse((await readBoundedBody(request, 16_384)).toString("utf8")); }
  catch (error) { if (error instanceof Error && "code" in error) throw error; fail("VALIDATION"); }
  const parsed = registrationRequestSchema.safeParse(json);
  if (!parsed.success) fail("VALIDATION");
  return parsed.data;
}

export async function readRegistrationRequest(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) fail("VALIDATION");
  const maxBytes = event.photo.maxBytes + 64 * 1024;
  const bytes = await readBoundedBody(request, maxBytes);
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { fail("VALIDATION"); }
  if ([...form.keys()].some((key) => !["data", "photo"].includes(key)) || form.getAll("data").length !== 1 || form.getAll("photo").length !== 1) fail("VALIDATION");
  const rawData = form.get("data");
  const photo = form.get("photo");
  if (typeof rawData !== "string" || rawData.length > 16_384 || !(photo instanceof File)) fail("VALIDATION");
  let json: unknown;
  try { json = JSON.parse(rawData); } catch { fail("VALIDATION"); }
  const parsed = uploadRequestSchema.safeParse(json);
  if (!parsed.success) fail("VALIDATION");
  return { ...parsed.data, photo };
}
