import "server-only";
import { z } from "zod";
import { registeredGroupSchema, registrationSnapshotSchema, type RegistrationInput } from "@/domain/registration";
import { createBackendClient } from "./supabase";
import { normalizePhoto, sha256 } from "./photo";
import { fail, throwDatabaseError } from "./errors";
import { isDuplicateStorageError } from "./storage-error";

const objectPathSchema = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
const stagedResultSchema = z.object({ id: z.uuid(), path: objectPathSchema, storageSha256: z.string().regex(/^[0-9a-f]{64}$/), byteSize: z.number().int().min(1).max(3145728), expiresAt: z.iso.datetime({ offset: true }), state: z.enum(["pending", "validated", "consumed"]) });

/** This module is the only application boundary that queries database/Storage. */
export async function getRegistrationSnapshot() {
  const { client, config } = createBackendClient();
  const { data, error } = await client.rpc("registration_snapshot", { p_event_slug: config.eventSlug });
  throwDatabaseError(error);
  if (data === null) fail("NOT_FOUND");
  const snapshot = registrationSnapshotSchema.safeParse(data);
  if (!snapshot.success) fail("UNAVAILABLE");
  return snapshot.data;
}

export async function consumeRegistrationBudget(actor: string, operation: "upload" | "submit") {
  const { client, config } = createBackendClient();
  const { error } = await client.rpc("consume_registration_request_budget", {
    p_event_slug: config.eventSlug, p_actor_hash: actor, p_operation: operation,
    p_actor_limit: operation === "upload" ? config.uploadActorLimit : config.submitActorLimit,
    p_global_limit: operation === "upload" ? config.uploadGlobalLimit : config.submitGlobalLimit,
    p_window_seconds: config.rateWindowSeconds, p_retention_seconds: config.rateRetentionSeconds,
  });
  throwDatabaseError(error);
}

export async function stagePhoto(photo: File, sessionHash: string, key: string, tokenHash: string) {
  const normalized = await normalizePhoto(photo);
  const { client, config } = createBackendClient();
  const prepared = await client.rpc("stage_registration_photo", {
    p_event_slug: config.eventSlug, p_session_hash: sessionHash, p_key: key, p_token_hash: tokenHash,
    p_original_sha256: normalized.originalSha256, p_storage_sha256: normalized.storageSha256,
    p_byte_size: normalized.bytes.length, p_ttl_seconds: config.uploadTtlSeconds,
  });
  throwDatabaseError(prepared.error);
  const result = stagedResultSchema.safeParse(prepared.data);
  if (!result.success) fail("UNAVAILABLE");
  const upload = result.data;
  if (upload.state === "consumed") return { expiresAt: upload.expiresAt };
  let verifyExisting = upload.storageSha256 !== normalized.storageSha256;
  if (!verifyExisting) {
    const stored = await client.storage.from(config.bucket).upload(upload.path, normalized.bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
    if (stored.error) {
      if (!isDuplicateStorageError(stored.error)) fail("UNAVAILABLE");
      verifyExisting = true;
    }
  }
  if (verifyExisting) {
    const downloaded = await client.storage.from(config.bucket).download(upload.path);
    if (downloaded.error || !downloaded.data || downloaded.data.size !== upload.byteSize) fail("UNAVAILABLE");
    if (sha256(new Uint8Array(await downloaded.data.arrayBuffer())) !== upload.storageSha256) fail("UNAVAILABLE");
  }
  const validated = await client.rpc("validate_registration_upload", { p_event_slug: config.eventSlug, p_upload_id: upload.id, p_storage_sha256: upload.storageSha256 });
  throwDatabaseError(validated.error);
  return { expiresAt: upload.expiresAt };
}

export async function submitGroup(input: RegistrationInput, key: string, tokenHash: string, sessionHash: string, actor: string) {
  const { client, config } = createBackendClient();
  const args = { p_event_slug: config.eventSlug, p_number: input.groupNumber, p_count: input.memberCount, p_ids: input.participantIds,
    p_key: key, p_token_hash: tokenHash, p_session_hash: sessionHash, p_consent: input.consent };
  // Confirmed retries return before budget/expiry checks; no second mutation.
  const existing = await client.rpc("find_staged_registration", args);
  throwDatabaseError(existing.error);
  if (existing.data !== null) {
    const group = registeredGroupSchema.safeParse(existing.data);
    if (!group.success) fail("UNAVAILABLE");
    return group.data;
  }
  await consumeRegistrationBudget(actor, "submit");
  const committed = await client.rpc("submit_staged_registration", args);
  throwDatabaseError(committed.error);
  const group = registeredGroupSchema.safeParse(committed.data);
  if (!group.success) fail("UNAVAILABLE");
  return group.data;
}

export async function getRegisteredPhoto(groupId: string) {
  const { client, config } = createBackendClient();
  const { data, error } = await client.rpc("registration_photo_path", { p_event_slug: config.eventSlug, p_group_id: groupId });
  throwDatabaseError(error);
  if (data === null) fail("NOT_FOUND");
  const path = objectPathSchema.safeParse(data);
  if (!path.success) fail("UNAVAILABLE");
  const signed = await client.storage.from(config.bucket).createSignedUrl(path.data, config.signedUrlSeconds);
  if (signed.error || !signed.data) fail("UNAVAILABLE");
  // Never log this capability URL, or persist it in a snapshot/database row.
  return { url: signed.data.signedUrl, expiresAt: new Date(Date.now() + config.signedUrlSeconds * 1000).toISOString() };
}

/** Explicit maintenance command; consumed photos are never claimed/deleted. */
export async function cleanupExpiredUploads() {
  const { client, config } = createBackendClient();
  const claimed = await client.rpc("claim_staged_upload_cleanup", { p_event_slug: config.eventSlug, p_limit: 50, p_grace_seconds: config.cleanupGraceSeconds });
  throwDatabaseError(claimed.error);
  const uploads = z.array(z.object({ id: z.uuid(), path: objectPathSchema })).safeParse(claimed.data);
  if (!uploads.success) fail("UNAVAILABLE");
  const pruned = await client.rpc("prune_registration_budgets", { p_event_slug: config.eventSlug, p_retention_seconds: config.rateRetentionSeconds });
  throwDatabaseError(pruned.error);
  if (!uploads.data.length) return 0;
  const removed = await client.storage.from(config.bucket).remove(uploads.data.map((upload) => upload.path));
  if (removed.error) fail("UNAVAILABLE");
  const finished = await client.rpc("finish_registration_upload_cleanup", { p_event_slug: config.eventSlug, p_ids: uploads.data.map((upload) => upload.id) });
  throwDatabaseError(finished.error);
  return uploads.data.length;
}
