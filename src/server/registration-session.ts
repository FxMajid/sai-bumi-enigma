import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { BackendConfig } from "./config";
import { fail } from "./errors";

const cookieName = "sai_bumi_registration";
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
export function readSession(request: Request): string | null {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return value && secretPattern.test(value) ? value : null;
}
export function sessionCookie(request: Request, config: BackendConfig): string {
  const session = readSession(request) ?? randomBytes(32).toString("base64url");
  const secure = new URL(config.appOrigin ?? request.url).protocol === "https:";
  return `${cookieName}=${session}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? "; Secure" : ""}`;
}
export function registrationContext(request: Request, processId: string, config: BackendConfig) {
  const session = readSession(request);
  if (!session) fail("UPLOAD_EXPIRED");
  return createHmac("sha256", config.uploadTokenSecret ?? config.key).update(`registration-session:v1:${config.eventSlug}:${session}:${processId}`).digest("hex");
}
/** A cryptographic PRF makes a recoverable, unpredictable 256-bit token per random staging key.
 * Only its SHA-256 digest goes to Postgres. Lost upload responses can retry safely. */
export function uploadToken(sessionHash: string, key: string, config: BackendConfig) {
  return createHmac("sha256", config.uploadTokenSecret ?? config.key).update(`upload-token:v1:${config.eventSlug}:${sessionHash}:${key}`).digest("base64url");
}
