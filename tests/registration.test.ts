import assert from "node:assert/strict";
import { test } from "node:test";
import { getMemberCountQuota, registrationSchema, validatePhoto } from "../src/domain/registration";
import { DemoRegistrationRepository } from "../src/repositories/demo-repository";
import { getDataConfiguration } from "../src/server/config";

test("demo statistics come from participants and group membership", async () => {
  const repo = new DemoRegistrationRepository();
  const data = await repo.getSnapshot();
  assert.equal(data.statistics.total, data.participants.length);
  assert.equal(data.statistics.registered, data.groups.flatMap((g) => g.members).length);
  assert.equal(data.statistics.unregistered, data.statistics.total - data.statistics.registered);
  repo.dispose();
});

test("registration uses UUID identities and allows distinct participants with identical names", async () => {
  const repo = new DemoRegistrationRepository();
  const { participants } = await repo.getSnapshot();
  assert.equal(participants[0]?.name, participants[1]?.name);
  assert.notEqual(participants[0]?.code, participants[1]?.code);
  const input = { groupNumber: 1, memberCount: 8, participantIds: participants.slice(0, 8).map((p) => p.id), consent: true };
  assert.equal(registrationSchema.safeParse(input).success, true);
  assert.equal(registrationSchema.safeParse({ ...input, participantIds: Array(8).fill(participants[0]?.id) }).success, false);
  assert.equal(registrationSchema.safeParse({ ...input, participantIds: participants.slice(0, 7).map((p) => p.id) }).success, false);
  assert.equal(registrationSchema.safeParse({ ...input, participantIds: participants.slice(0, 8).map((p) => p.name) }).success, false);
  assert.equal(registrationSchema.safeParse({ ...input, consent: false }).success, false);
  assert.equal(registrationSchema.safeParse({ ...input, groupNumber: 5 }).success, false);
  repo.dispose();
});

test("demo rejects occupied groups and participants even if called outside the UI", async () => {
  const repo = new DemoRegistrationRepository();
  const data = await repo.getSnapshot();
  const input = { groupNumber: 1, memberCount: 8 as const, participantIds: data.participants.slice(0, 8).map((p) => p.id), consent: true };
  const photo = new File(["demo"], "demo.png", { type: "image/png" });
  await assert.rejects(repo.register({ ...input, groupNumber: 2 }, photo), { code: "CONFLICT" });
  const result = await repo.register(input, photo);
  assert.equal(result.members.length, 8);
  assert.equal(result.groupNumber, 1);
  await assert.rejects(repo.register({ ...input, groupNumber: 3 }, photo), { code: "CONFLICT" });
  const updated = await repo.getSnapshot();
  assert.equal(updated.statistics.registered, data.statistics.registered + 8);
  // Consumers cannot mutate the repository through a returned snapshot.
  updated.participants.length = 0;
  assert.equal((await repo.getSnapshot()).statistics.total, data.statistics.total);
  repo.dispose();
});

test("enforces team quota: 9 members max 3 groups, 8 members max 1 group", async () => {
  const repo = new DemoRegistrationRepository();
  const data = await repo.getSnapshot();
  const quotas = getMemberCountQuota(data.groups);
  assert.equal(quotas[8].max, 1);
  assert.equal(quotas[9].max, 3);
  assert.equal(quotas[8].available, true); // initial demo has 0 of 8-person groups
  assert.equal(quotas[9].available, true); // initial demo has 1 of 9-person groups (1/3)

  // Register the single allowed 8-member group (group 1)
  const photo = new File(["demo"], "demo.png", { type: "image/png" });
  await repo.register({
    groupNumber: 1,
    memberCount: 8,
    participantIds: data.availableParticipants.slice(0, 8).map((p) => p.id),
    consent: true,
  }, photo);

  // Now 8-member quota is exhausted (1/1)
  const afterFirst = await repo.getSnapshot();
  const quotasAfter = getMemberCountQuota(afterFirst.groups);
  assert.equal(quotasAfter[8].available, false);
  assert.equal(quotasAfter[8].registered, 1);

  // Attempting another 8-member group must be rejected with CONFLICT
  await assert.rejects(repo.register({
    groupNumber: 3,
    memberCount: 8,
    participantIds: afterFirst.availableParticipants.slice(0, 8).map((p) => p.id),
    consent: true,
  }, photo), { code: "CONFLICT" });

  repo.dispose();
});

test("photo metadata validation rejects missing, oversized, empty and unsupported files", () => {
  assert.ok(validatePhoto(null));
  assert.ok(validatePhoto({ size: 0, type: "image/png" }));
  assert.ok(validatePhoto({ size: 3 * 1024 * 1024 + 1, type: "image/png" }));
  assert.ok(validatePhoto({ size: 100, type: "image/gif" }));
  assert.equal(validatePhoto({ size: 100, type: "image/jpeg" }), null);
});

test("no configuration and invalid modes never activate demo fixtures", () => {
  const keys = ["APP_DATA_MODE", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_EVENT_SLUG", "SUPABASE_STORAGE_BUCKET", "APP_ORIGIN", "RATE_LIMIT_SECRET"] as const;
  const before = keys.map((key) => process.env[key]);
  try {
    keys.forEach((key) => delete process.env[key]);
    assert.deepEqual(getDataConfiguration(), { mode: "unavailable", reason: "missing-config" });
    process.env.SUPABASE_URL = "";
    assert.deepEqual(getDataConfiguration(), { mode: "unavailable", reason: "missing-config" });
    process.env.SUPABASE_URL = "invalid-url";
    assert.deepEqual(getDataConfiguration(), { mode: "unavailable", reason: "missing-config" });
    process.env.APP_DATA_MODE = "invalid";
    assert.deepEqual(getDataConfiguration(), { mode: "unavailable", reason: "invalid-mode" });
    process.env.APP_DATA_MODE = "demo";
    assert.deepEqual(getDataConfiguration(), { mode: "demo" });
    process.env.APP_DATA_MODE = "supabase";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_" + "a".repeat(40);
    process.env.SUPABASE_EVENT_SLUG = "test-event";
    assert.deepEqual(getDataConfiguration(), { mode: "supabase" });
    process.env.SUPABASE_SECRET_KEY = "sb_publishable_" + "a".repeat(40);
    assert.deepEqual(getDataConfiguration(), { mode: "unavailable", reason: "missing-config" });
  } finally {
    keys.forEach((key, index) => { const value = before[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  }
});
