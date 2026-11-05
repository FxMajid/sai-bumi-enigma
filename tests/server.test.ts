import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { normalizePhoto } from "../src/server/photo";
import { actorHash, enforceOrigin, readRegistrationRequest, readSubmission } from "../src/server/request";
import { errorResponse, throwDatabaseError } from "../src/server/errors";
import { HttpRegistrationRepository } from "../src/repositories/http-repository";
import { DemoRegistrationRepository } from "../src/repositories/demo-repository";
import type { BackendConfig } from "../src/server/config";
import { isDuplicateStorageError } from "../src/server/storage-error";

test("Storage duplicate detection supports named and numeric SDK errors without treating denied writes as duplicates", () => {
  assert.equal(isDuplicateStorageError({ status: 409, statusCode: "ResourceAlreadyExists", code: "ResourceAlreadyExists" }), true);
  assert.equal(isDuplicateStorageError({ statusCode: "409" }), true);
  assert.equal(isDuplicateStorageError({ statusCode: "KeyAlreadyExists" }), true);
  assert.equal(isDuplicateStorageError({ status: 403, statusCode: "AccessDenied", code: "AccessDenied" }), false);
  assert.equal(isDuplicateStorageError(new Error("The resource already exists")), false);
});

test("server decodes and normalizes photos, removing EXIF and rejecting forged files", async () => {
  const source = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#700d16" } }).jpeg().withMetadata({ exif: { IFD0: { Artist: "Synthetic test metadata" } } }).toBuffer();
  const normalized = await normalizePhoto(new File([new Uint8Array(source)], "team.jpg", { type: "image/jpeg" }));
  const metadata = await sharp(normalized.bytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined);
  assert.match(normalized.originalSha256, /^[a-f0-9]{64}$/);
  assert.match(normalized.storageSha256, /^[a-f0-9]{64}$/);
  await assert.rejects(normalizePhoto(new File(["not a photo"], "forged.png", { type: "image/png" })), { code: "VALIDATION" });
  await assert.rejects(normalizePhoto(new File([new Uint8Array(source)], "wrong.png", { type: "image/png" })), { code: "VALIDATION" });
});

test("server multipart validation rejects extra fields, duplicate UUIDs and oversized bodies", async () => {
  const repo = new DemoRegistrationRepository();
  const snapshot = await repo.getSnapshot();
  const registration = { groupNumber: 1, memberCount: 8, participantIds: snapshot.participants.slice(0, 8).map((p) => p.id), consent: true };
  const processId = crypto.randomUUID();
  const uploadKey = crypto.randomUUID();
  const makeForm = (data: object = { processId, uploadKey }) => {
    const form = new FormData();
    form.set("data", JSON.stringify(data));
    form.set("photo", new File(["test metadata only"], "team.jpg", { type: "image/jpeg" }));
    return form;
  };
  const parsed = await readRegistrationRequest(new Request("https://event.test/api/registrations", { method: "POST", body: makeForm() }));
  assert.equal(parsed.processId, processId);
  assert.equal(parsed.uploadKey, uploadKey);
  const extra = makeForm(); extra.set("table", "events");
  await assert.rejects(readRegistrationRequest(new Request("https://event.test/api/registrations", { method: "POST", body: extra })), { code: "VALIDATION" });
  await assert.rejects(readRegistrationRequest(new Request("https://event.test/api/registrations", { method: "POST", body: makeForm({ ...registration, participantIds: Array(8).fill(registration.participantIds[0]) }) })), { code: "VALIDATION" });
  await assert.rejects(readRegistrationRequest(new Request("https://event.test/api/registrations", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "5000000" }, body: "tiny actual body" })), { code: "PAYLOAD_TOO_LARGE" });
  const submission = { registration, processId, uploadToken: "a".repeat(43), idempotencyKey: crypto.randomUUID() };
  const post = (body: object) => new Request("https://event.test/api/registrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await readSubmission(post(submission))).registration.participantIds.length, 8);
  await assert.rejects(readSubmission(post({ ...submission, photo_path: "arbitrary" })), { code: "VALIDATION" });
  await assert.rejects(readSubmission(post({ ...submission, registration: { ...registration, participantIds: Array(8).fill(registration.participantIds[0]) } })), { code: "VALIDATION" });
  repo.dispose();
});

test("origin checking and safe errors expose neither SQL nor backend keys", async () => {
  const config: BackendConfig = { url: "https://project.supabase.co", key: "sb_secret_" + "a".repeat(40), eventSlug: "test", bucket: "sai-bumi-team-photos", appOrigin: "https://event.test", uploadTtlSeconds: 3600, cleanupGraceSeconds: 900, signedUrlSeconds: 120, rateWindowSeconds: 600, rateRetentionSeconds: 172800, uploadActorLimit: 20, uploadGlobalLimit: 100, submitActorLimit: 60, submitGlobalLimit: 300 };
  assert.throws(() => enforceOrigin(new Request("https://event.test/api/registrations", { headers: { origin: "https://evil.test" } }), config), { code: "FORBIDDEN" });
  enforceOrigin(new Request("https://event.test/api/registrations", { headers: { origin: "https://event.test" } }), config);
  const hash = actorHash(new Request("https://event.test"), config);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(actorHash(new Request("https://event.test", { headers: { "x-forwarded-for": "1.2.3.4" } }), config), hash);
  const trusted = { ...config, trustedProxySecret: "s".repeat(32) };
  assert.equal(actorHash(new Request("https://event.test", { headers: { "x-forwarded-for": "1.2.3.4", "x-registration-proxy-secret": "wrong" } }), trusted), hash);
  assert.notEqual(actorHash(new Request("https://event.test", { headers: { "x-forwarded-for": "1.2.3.4", "x-registration-proxy-secret": "s".repeat(32) } }), trusted), hash);
  try { throwDatabaseError({ code: "P1002" }); } catch (error) {
    const response = errorResponse(error);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "CONFLICT");
  }
  const unexpected = errorResponse(new Error("select * from internal_table with secret_key"));
  assert.equal(unexpected.status, 503);
  assert.doesNotMatch(await unexpected.text(), /select|internal_table|secret_key/);
});

test("HTTP repository retains idempotency key after an ambiguous failure and strips internal response fields", async () => {
  const demo = new DemoRegistrationRepository();
  const snapshot = await demo.getSnapshot();
  const input = { groupNumber: 1, memberCount: 8 as const, participantIds: snapshot.participants.slice(0, 8).map((p) => p.id), consent: true };
  const response = { id: crypto.randomUUID(), groupNumber: 1, members: snapshot.participants.slice(0, 8), photoUrl: "/api/groups/test/photo", registeredAt: new Date().toISOString(), payload_hash: "internal-should-be-stripped" };
  const originalFetch = globalThis.fetch;
  const keys: string[] = [];
  let uploads = 0;
  globalThis.fetch = async (url, init) => {
    if (url === "/api/registration/session") return Response.json({ ready: true });
    if (url === "/api/uploads") { uploads++; return Response.json({ token: "t".repeat(43), expiresAt: new Date(Date.now() + 3600000).toISOString() }); }
    keys.push(JSON.parse(String(init?.body)).idempotencyKey);
    if (keys.length === 1) throw new Error("synthetic network failure after possible commit");
    return Response.json(response);
  };
  try {
    const repo = new HttpRegistrationRepository();
    const photo = new File(["identical input"], "team.jpg", { type: "image/jpeg" });
    await assert.rejects(repo.register(input, photo), { code: "UNAVAILABLE" });
    const result = await repo.register(input, photo);
    assert.equal(keys[0], keys[1]);
    assert.equal("payload_hash" in result, false);
    await repo.register({ ...input, groupNumber: 3 }, photo);
    assert.notEqual(keys[2], keys[1]);
    assert.equal(uploads, 1, "changed selections reuse the staged photo");
    repo.dispose();
  } finally { globalThis.fetch = originalFetch; demo.dispose(); }
});
