import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Client } from "pg";

// No external DATABASE_URL is accepted. Always start a brand-new disposable
// cluster in OS temp; never reset, migrate or connect to an existing database.
const root = mkdtempSync(join(tmpdir(), "sai-bumi-pg-test-"));
const dataDirectory = join(root, "data");
let owner: Client;
let started = false;

async function connect(role?: "anon" | "authenticated" | "service_role") {
  const client = new Client({ host: root, port: 55439, database: "postgres", user: userInfo().username });
  await client.connect();
  if (role) await client.query(`set role ${role}`);
  return client;
}

before(async () => {
  execFileSync("initdb", ["-D", dataDirectory, "--auth=trust", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", dataDirectory, "-l", join(root, "postgres.log"), "-o", `-F -h '' -k ${root} -p 55439`, "-w", "start"], { stdio: "pipe" });
  started = true;
  owner = await connect();
  await owner.query(readFileSync("tests/database/bootstrap.sql", "utf8"));
  for (const name of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) {
    await owner.query(readFileSync(join("supabase/migrations", name), "utf8"));
  }
}, { timeout: 30_000 });

after(async () => {
  await owner?.end();
  if (started) execFileSync("pg_ctl", ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "pipe" });
  // Keep the tiny cluster/log under OS temp for inspectability; no destructive cleanup.
});

type Fixture = { id: string; slug: string; ids: string[] };
async function fixture(count = 35): Promise<Fixture> {
  const id = randomUUID();
  const slug = "test-" + id;
  await owner.query("insert into public.events(id,slug,title,starts_on,ends_on,registration_open) values($1,$2,'Synthetic SQL test', '2026-11-24','2026-11-27',true)", [id, slug]);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const participantId = randomUUID();
    ids.push(participantId);
    await owner.query("insert into public.participants(id,event_id,participant_code,full_name) values($1,$2,$3,$4)", [participantId, id, `T-${i + 1}`, i < 2 ? "Synthetic Same Name" : `Synthetic Person ${i + 1}`]);
  }
  return { id, slug, ids };
}

const originalHash = "a".repeat(64);
const storageHash = "b".repeat(64);
type Upload = { id: string; path: string; key: string; ids: string[]; number: number; originalHash: string };

// Legacy owner-only regression helpers: protocol is revoked from service_role.
async function prepare(f: Fixture, ids: string[], number: number, key = randomUUID(), photoHash = originalHash): Promise<Upload> {
  const client = await connect();
  try {
    const { rows } = await client.query("select public.prepare_registration_upload($1,$2,$3,$4,$5,$6,$7,$8,true) as value", [f.slug, number, ids.length, ids, key, photoHash, storageHash, 100]);
    return { ...rows[0].value, key, ids, number, originalHash: photoHash };
  } finally { await client.end(); }
}

async function validate(f: Fixture, upload: Pick<Upload, "id" | "path">) {
  await owner.query("insert into storage.objects(bucket_id,name,metadata) values('sai-bumi-team-photos',$1,$2) on conflict do nothing", [upload.path, { mimetype: "image/jpeg", size: 100 }]);
  const client = await connect("service_role");
  try { await client.query("select public.validate_registration_upload($1,$2,$3)", [f.slug, upload.id, storageHash]); }
  finally { await client.end(); }
}

async function commit(f: Fixture, upload: Upload, override: Partial<Upload> = {}) {
  const value = { ...upload, ...override };
  const client = await connect();
  try {
    const { rows } = await client.query("select public.register_event_group($1,$2,$3,$4,$5,$6,$7,true) as value", [f.slug, value.number, value.ids.length, value.ids, value.key, value.id, value.originalHash]);
    return rows[0].value;
  } finally { await client.end(); }
}

async function snapshot(f: Fixture) {
  const client = await connect("service_role");
  try { return (await client.query("select public.registration_snapshot($1) as value", [f.slug])).rows[0].value; }
  finally { await client.end(); }
}

test("all internal tables have RLS; anon/authenticated cannot read, write or execute internal functions", async () => {
  const f = await fixture();
  const tables = ["events", "participants", "groups", "group_members", "registration_uploads", "registration_rate_limits"];
  for (const table of tables) {
    assert.equal((await owner.query("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${table}`])).rows[0].relrowsecurity, true);
  }
  const funcs = await owner.query("select oid::regprocedure::text as signature from pg_proc where pronamespace='public'::regnamespace");
  for (const role of ["anon", "authenticated"] as const) {
    for (const table of tables) {
      assert.equal((await owner.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') value", [role, `public.${table}`])).rows[0].value, false);
    }
    for (const { signature } of funcs.rows) {
      assert.equal((await owner.query("select has_function_privilege($1,$2,'execute') value", [role, signature])).rows[0].value, false, `${role}: ${signature}`);
    }
    const client = await connect(role);
    try {
      for (const table of tables) await assert.rejects(client.query(`select * from public.${table}`), { code: "42501" });
      await assert.rejects(client.query("select public.registration_snapshot($1)", [f.slug]), { code: "42501" });
      await assert.rejects(client.query("select public.register_event_group($1,1,8,$2,$3,$4,$5,true)", [f.slug, f.ids.slice(0, 8), randomUUID(), randomUUID(), originalHash]), { code: "42501" });
      assert.equal((await client.query("select count(*)::int n from storage.buckets where id='sai-bumi-team-photos'")).rows[0].n, 0);
      await assert.rejects(client.query("insert into storage.objects(bucket_id,name) values('sai-bumi-team-photos','not-allowed.jpg')"), { code: "42501" });
    } finally { await client.end(); }
  }
  const backend = await connect("service_role");
  try { await assert.rejects(backend.query("insert into public.groups(event_id) values($1)", [f.id]), { code: "42501" }); }
  finally { await backend.end(); }
});

test("35 active participants can register 9+9+9+8; counts and availability remain consistent", async () => {
  const f = await fixture(35);
  let offset = 0;
  for (const [index, count] of [9, 9, 9, 8].entries()) {
    const upload = await prepare(f, f.ids.slice(offset, offset + count), index + 1);
    await validate(f, upload);
    const group = await commit(f, upload);
    assert.equal(group.members.length, count);
    offset += count;
    const data = await snapshot(f);
    assert.deepEqual(data.statistics, { total: 35, registered: offset, unregistered: 35 - offset });
    assert.equal(data.availableParticipants.length, 35 - offset);
    assert.equal(JSON.stringify(data).includes("payload_hash"), false);
    assert.equal(JSON.stringify(data).includes(upload.path), false);
    assert.equal(group.members[0].id, upload.ids[0]);
  }
  await assert.rejects(owner.query("update public.participants set is_active=false where id=$1", [f.ids[0]]), { code: "P1008" });
  await assert.rejects(owner.query("delete from public.participants where id=$1", [f.ids[0]]), { code: "P1008" });
});

test("identical concurrent retries return the same group; changed payload/key binding is rejected", async () => {
  const f = await fixture();
  const ids = f.ids.slice(0, 8);
  const key = randomUUID();
  const [first, second] = await Promise.all([prepare(f, ids, 1, key), prepare(f, ids, 1, key)]);
  assert.equal(first.id, second.id);
  await validate(f, first);
  const [a, b] = await Promise.all([commit(f, first), commit(f, second)]);
  assert.deepEqual(a, b);
  await assert.rejects(commit(f, first, { ids: f.ids.slice(8, 16) }), { code: "P1005" });
  await assert.rejects(prepare(f, ids, 1, key, "c".repeat(64)), { code: "P1005" });
  await owner.query("update public.events set registration_open=false where id=$1", [f.id]);
  assert.deepEqual(await commit(f, first), a, "retry after close still returns its committed result");
  assert.equal((await snapshot(f)).groups.length, 1);
});

test("concurrent same-number or overlapping-participant requests cannot leave partial groups", async () => {
  for (const overlap of [false, true]) {
    const f = await fixture();
    const a = await prepare(f, f.ids.slice(0, 8), 1);
    const b = await prepare(f, f.ids.slice(overlap ? 7 : 8, overlap ? 15 : 16), overlap ? 2 : 1);
    await validate(f, a); await validate(f, b);
    const outcomes = await Promise.allSettled([commit(f, a), commit(f, b)]);
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    const rejected = outcomes.find((o) => o.status === "rejected");
    assert.equal(rejected?.status === "rejected" && rejected.reason.code, "P1002");
    const data = await snapshot(f);
    assert.equal(data.groups.length, 1);
    assert.equal(data.statistics.registered, 8);
    assert.equal((await owner.query("select count(*)::int n from public.registration_uploads where event_id=$1 and state='consumed'", [f.id])).rows[0].n, 1);
  }
});

test("RPC rejects wrong count, duplicates, inactive/cross-event participants, closed events and unvalidated/expired photos", async () => {
  const f = await fixture();
  await assert.rejects(prepare(f, f.ids.slice(0, 7), 1), { code: "P1001" });
  await assert.rejects(prepare(f, Array(8).fill(f.ids[0]), 1), { code: "P1001" });
  await assert.rejects(prepare(f, f.ids.slice(0, 8), 5), { code: "P1001" });
  await owner.query("update public.participants set is_active=false where id=$1", [f.ids[0]]);
  assert.equal((await snapshot(f)).statistics.total, 34);
  assert.equal((await snapshot(f)).availableParticipants.some((p: { id: string }) => p.id === f.ids[0]), false);
  await assert.rejects(prepare(f, f.ids.slice(0, 8), 1), { code: "P1004" });
  const other = await fixture(8);
  await assert.rejects(prepare(f, other.ids, 1), { code: "P1004" });
  const upload = await prepare(f, f.ids.slice(1, 9), 1);
  await assert.rejects(commit(f, upload), { code: "P1006" });
  await owner.query("update public.events set registration_open=false where id=$1", [f.id]);
  await assert.rejects(commit(f, upload), { code: "P1003" });
  await owner.query("update public.events set registration_open=true where id=$1", [f.id]);
  await validate(f, upload);
  await owner.query("delete from storage.objects where name=$1", [upload.path]);
  await assert.rejects(commit(f, upload), { code: "P1006" });
  await validate(f, upload);
  await owner.query("update public.registration_uploads set expires_at=now()-interval '1 hour', created_at=now()-interval '2 hours' where id=$1", [upload.id]);
  await assert.rejects(commit(f, upload), { code: "P1007" });
  assert.equal((await snapshot(f)).groups.length, 0);
});

test("deferred constraints reject owner writes that leave incomplete groups or cross-event relations", async () => {
  const f = await fixture();
  const upload = await prepare(f, f.ids.slice(0, 8), 1);
  await validate(f, upload);
  const group = await commit(f, upload);
  await owner.query("begin");
  await owner.query("delete from public.group_members where group_id=$1 and position=8", [group.id]);
  await assert.rejects(owner.query("commit"), { code: "P1001" });
  await owner.query("rollback");
  assert.equal((await snapshot(f)).statistics.registered, 8);
  const other = await fixture(8);
  await assert.rejects(owner.query("insert into public.group_members(event_id,group_id,participant_id,position) values($1,$2,$3,9)", [other.id, group.id, other.ids[0]]), { code: "23503" });
  await owner.query("begin");
  await owner.query("update public.events set registration_open=false where id=$1", [f.id]);
  await owner.query("delete from public.group_members where group_id=$1", [group.id]);
  await owner.query("delete from public.groups where id=$1", [group.id]);
  await owner.query("update public.participants set is_active=false where id=$1", [f.ids[0]]);
  await owner.query("commit");
  assert.deepEqual((await snapshot(f)).statistics, { total: 34, registered: 0, unregistered: 34 });
});

test("cleanup cannot claim a consumed upload and rate limit is atomic", async () => {
  const f = await fixture();
  const a = await prepare(f, f.ids.slice(0, 8), 1);
  const b = await prepare(f, f.ids.slice(8, 16), 2);
  await validate(f, a); await commit(f, a);
  await owner.query("update public.registration_uploads set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where event_id=$1", [f.id]);
  const client = await connect();
  try {
    const claimed = (await client.query("select public.claim_expired_registration_uploads($1,50) value", [f.slug])).rows[0].value;
    assert.deepEqual(claimed.map((u: { id: string }) => u.id), [b.id]);
    await assert.rejects(commit(f, b), { code: "P1006" });
    const budgets = await Promise.allSettled(Array.from({ length: 21 }, async () => {
      const concurrent = await connect();
      try { await concurrent.query("select public.consume_registration_budget($1,$2)", [f.slug, originalHash]); }
      finally { await concurrent.end(); }
    }));
    assert.equal(budgets.filter((r) => r.status === "fulfilled").length, 20);
    assert.equal(budgets.filter((r) => r.status === "rejected" && r.reason.code === "P1029").length, 1);
  } finally { await client.end(); }
  assert.equal((await snapshot(f)).statistics.registered, 8);
});

test("payload hash is deterministic, ordered and bound to the original photo", async () => {
  const f = await fixture(8);
  const expected = createHash("sha256").update(`v1|${f.id}|1|8|${f.ids.join(",")}|${originalHash}|true`).digest("hex");
  const actual = (await owner.query("select public.registration_payload_hash($1,1,8,$2,$3) value", [f.id, f.ids, originalHash])).rows[0].value;
  assert.equal(actual, expected);
});

test("CSV import targets the selected event, rejects wrong slug/duplicates and rolls back the entire import", async () => {
  const f = await fixture(0);
  const csvPath = join(root, "participants.csv");
  const script = readFileSync("supabase/scripts/import-participants.psql", "utf8").replace("supabase/import/participants.csv", csvPath);
  const runImport = (slug: string) => execFileSync("psql", ["-X", "-h", root, "-p", "55439", "-U", userInfo().username, "-d", "postgres", "-v", `event_slug=${slug}`], { input: script, stdio: "pipe" });
  writeFileSync(csvPath, "participant_code,full_name\nS-001,Synthetic Same\nS-002,Synthetic Same\n");
  assert.throws(() => runImport("event-that-does-not-exist"));
  assert.equal((await snapshot(f)).statistics.total, 0);
  runImport(f.slug);
  assert.equal((await snapshot(f)).statistics.total, 2);
  writeFileSync(csvPath, "participant_code,full_name\nS-003,New Synthetic\nS-001,Would Overwrite\n");
  assert.throws(() => runImport(f.slug));
  assert.equal((await snapshot(f)).statistics.total, 2);
  assert.equal((await owner.query("select count(distinct event_id)::int n from public.participants where event_id=$1", [f.id])).rows[0].n, 1);
});

// Current production protocol: all calls below run with the real backend role.
type Staged = { id: string; path: string; session: string; token: string; stagingKey: string };
async function staged(f: Fixture): Promise<Staged> {
  const session = createHash('sha256').update(randomUUID()).digest('hex');
  const token = createHash('sha256').update(randomUUID()).digest('hex');
  const stagingKey = randomUUID();
  const client = await connect('service_role');
  try {
    const {rows} = await client.query('select public.stage_registration_photo($1,$2,$3,$4,$5,$6,100,3600) value', [f.slug,session,stagingKey,token,originalHash,storageHash]);
    return {...rows[0].value,session,token,stagingKey};
  } finally {await client.end();}
}
async function stagedCommit(f: Fixture, upload: Staged, ids: string[], number: number, key = randomUUID()) {
  const client = await connect('service_role');
  try {
    return (await client.query('select public.submit_staged_registration($1,$2,$3,$4,$5,$6,$7,true) value', [f.slug,number,ids.length,ids,key,upload.token,upload.session])).rows[0].value;
  } finally {await client.end();}
}

test('legacy mutating RPCs are revoked from the backend; staging does not bind a roster', async () => {
  const f=await fixture();
  for (const signature of ['public.prepare_registration_upload(text,integer,integer,uuid[],uuid,text,text,integer,boolean)','public.register_event_group(text,integer,integer,uuid[],uuid,uuid,text,boolean)','public.claim_expired_registration_uploads(text,integer)']) {
    assert.equal((await owner.query("select has_function_privilege('service_role',$1,'execute') allowed",[signature])).rows[0].allowed,false);
  }
  const upload=await staged(f);
  const row=(await owner.query('select session_hash,token_hash,payload_hash,idempotency_key from public.registration_uploads where id=$1',[upload.id])).rows[0];
  assert.equal(row.session_hash,upload.session); assert.equal(row.token_hash,upload.token);
  assert.equal(row.payload_hash,null); assert.equal(row.idempotency_key,null);
});

test('staging enforces session ownership, single claim, and idempotency even after expiry/close',async()=>{
  const f=await fixture(); const u=await staged(f); await validate(f,u);
  await assert.rejects(stagedCommit(f,{...u,session:'c'.repeat(64)},f.ids.slice(0,8),1),{code:'P1006'});
  const key=randomUUID();
  const [a,b]=await Promise.all([stagedCommit(f,u,f.ids.slice(0,8),1,key),stagedCommit(f,u,f.ids.slice(0,8),1,key)]);
  assert.deepEqual(a,b);
  await assert.rejects(stagedCommit(f,u,f.ids.slice(8,16),2,key),{code:'P1005'});
  await assert.rejects(stagedCommit(f,u,f.ids.slice(8,16),2),{code:'P1002'});
  await owner.query("update public.registration_uploads set created_at=now()-interval '3 hours',expires_at=now()-interval '2 hours' where id=$1",[u.id]);
  await owner.query('update public.events set registration_open=false where id=$1',[f.id]);
  assert.deepEqual(await stagedCommit(f,u,f.ids.slice(0,8),1,key),a);
});

test('a roster/number conflict keeps the staged photo reusable with new selections',async()=>{
  const f=await fixture(); const a=await staged(f); const b=await staged(f);
  await validate(f,a); await validate(f,b);
  await stagedCommit(f,a,f.ids.slice(0,8),1);
  await assert.rejects(stagedCommit(f,b,f.ids.slice(8,16),1),{code:'P1002'});
  assert.equal((await owner.query('select state from public.registration_uploads where id=$1',[b.id])).rows[0].state,'validated');
  const result=await stagedCommit(f,b,f.ids.slice(8,16),3);
  assert.equal(result.groupNumber,3);
  assert.equal((await snapshot(f)).statistics.registered,16);
});

test('cleanup observes grace period and never claims a group photo while submitting concurrently',async()=>{
  const f=await fixture(); const u=await staged(f); await validate(f,u);
  const client=await connect('service_role');
  try {
    const [group,cleanup]=await Promise.all([stagedCommit(f,u,f.ids.slice(0,8),1),client.query('select public.claim_staged_upload_cleanup($1,50,60) value',[f.slug])]);
    assert.ok(group.id); assert.deepEqual(cleanup.rows[0].value,[]);
    await owner.query("update public.registration_uploads set created_at=now()-interval '3 hours',expires_at=now()-interval '2 hours' where id=$1",[u.id]);
    assert.deepEqual((await client.query('select public.claim_staged_upload_cleanup($1,50,60) value',[f.slug])).rows[0].value,[]);
    const unused=await staged(f); await validate(f,unused);
    await owner.query("update public.registration_uploads set created_at=now()-interval '2 hours',expires_at=now()-interval '30 seconds' where id=$1",[unused.id]);
    assert.deepEqual((await client.query('select public.claim_staged_upload_cleanup($1,50,60) value',[f.slug])).rows[0].value,[]);
    await owner.query("update public.registration_uploads set expires_at=now()-interval '2 minutes' where id=$1",[unused.id]);
    assert.deepEqual((await client.query('select public.claim_staged_upload_cleanup($1,50,60) value',[f.slug])).rows[0].value.map((row:{id:string})=>row.id),[unused.id]);
    await assert.rejects(stagedCommit(f,unused,f.ids.slice(8,16),2),{code:'P1006'});
  } finally {await client.end();}
});

test('new upload/submit budgets are atomic, configurable, and independent',async()=>{
  const f=await fixture();
  const outcomes=await Promise.allSettled(Array.from({length:4},async()=>{
    const client=await connect('service_role');
    try {await client.query("select public.consume_registration_request_budget($1,$2,'upload',3,6,600,172800)",[f.slug,originalHash]);}
    finally{await client.end();}
  }));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,3);
  assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.code==='P1029').length,1);
  const client=await connect('service_role');
  try {await client.query("select public.consume_registration_request_budget($1,$2,'submit',3,6,600,172800)",[f.slug,originalHash]);}
  finally {await client.end();}
});

test('signed photo path lookup denies temporary uploads, unknown groups, other and inactive events',async()=>{
  const f=await fixture(); const u=await staged(f); await validate(f,u);
  const client=await connect('service_role');
  try {
    assert.equal((await client.query('select public.registration_photo_path($1,$2) value',[f.slug,u.id])).rows[0].value,null);
    const g=await stagedCommit(f,u,f.ids.slice(0,8),1);
    assert.equal((await client.query('select public.registration_photo_path($1,$2) value',[f.slug,g.id])).rows[0].value,u.path);
    assert.equal((await client.query('select public.registration_photo_path($1,$2) value',['another-event',g.id])).rows[0].value,null);
    await owner.query('update public.events set is_active=false where id=$1',[f.id]);
    assert.equal((await client.query('select public.registration_photo_path($1,$2) value',[f.slug,g.id])).rows[0].value,null);
    assert.equal(await snapshot(f),null);
  } finally {await client.end();}
});
