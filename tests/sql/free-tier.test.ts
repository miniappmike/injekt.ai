import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { FREE_LIMITS } from "@/lib/limits";

// Runs the real migrations in an in-process Postgres with minimal stand-ins for Supabase's auth schema and roles.
const db = new PGlite();
let legacyUser = "";
let legacyGeneration = "";
const migration = (f: string) => readFileSync(join(__dirname, "../../supabase/migrations", f), "utf8");

async function asUser(id: string | null, role: "authenticated" | "service_role" | "postgres" = "authenticated") {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id ?? ""}', false);`);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}
async function newUser(email: string) {
  await db.exec("reset role");
  const r = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
  return r.rows[0].id;
}
const character = (userId: string, name = "c") =>
  db.query("insert into public.characters (user_id, name, provenance_attested_at) values ($1, $2, now())", [userId, name]);

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create publication supabase_realtime;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  `);
  // Supabase grants new tables and functions to its API roles by default, so the migrations have to take access away.
  await db.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  await db.exec(migration("0001_init.sql"));
  await db.exec(migration("0002_drop_profile_versions.sql"));
  await db.exec(migration("0004_free_tier_limits.sql"));
  await db.exec(migration("0005_prompt_history.sql"));
  await db.exec(migration("0003_storage.sql"));
  await db.exec(migration("0006_generation_retention.sql"));
  await db.exec(migration("0007_spend_tracking.sql"));
  // Rows written by the old ledger, so the next migration has something to carry over.
  const legacy = await db.query<{ id: string }>("insert into auth.users (email) values ('legacy@x.com') returning id");
  legacyUser = legacy.rows[0].id;
  const gen = await db.query<{ id: string }>(
    "insert into public.generations (user_id, kind, status, provider) values ($1, 'inject', 'complete', 'spicyapi') returning id",
    [legacyUser],
  );
  legacyGeneration = gen.rows[0].id;
  await db.query(
    `insert into public.usage_ledger (user_id, provider, key_source, cost_usd, job, feature, model, input_tokens, output_tokens, cost_known, generation_id, created_at) values
       ($1, 'anthropic', 'byok', 0.0123, 'vision', 'profile', 'claude-sonnet-5-5', 4000, 600, true, null, '2026-10-01T10:00:00Z'),
       ($1, 'spicyapi', 'byok', 0.04, 'image', 'image:inject', 'seedream', null, null, true, $2, '2026-10-02T10:00:00Z'),
       ($1, 'openai', 'byok', 0, 'vision', null, 'gpt-4o', 10, 1, false, null, '2026-10-03T10:00:00Z'),
       ($1, 'spicyapi', 'server', 0.5, null, null, null, null, null, true, null, '2026-10-04T10:00:00Z')`,
    [legacyUser, legacyGeneration],
  );
  await db.exec(migration("0008_api_ledger.sql"));
  await db.exec(migration("0009_history_extra_images.sql"));
  await db.exec(migration("0010_sheet_pack.sql"));
  // Storage tables are only stand-ins here; turn on row-level security so the policies are actually tested.
  await db.exec(`alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;`);
});

describe("allowance counters", () => {
  it("allows up to the limit, then refuses, and a release gives one back", async () => {
    const u = await newUser("a@x.com");
    await asUser(null, "service_role");
    const use = async () => (await db.query<{ consume_allowance: boolean }>("select consume_allowance($1, 'profile_builds', 3)", [u])).rows[0].consume_allowance;
    expect([await use(), await use(), await use(), await use()]).toEqual([true, true, true, false]);
    await db.query("select release_allowance($1, 'profile_builds')", [u]);
    expect(await use()).toBe(true);
    expect(await use()).toBe(false);
  });

  it("never goes below zero on release and refuses a zero limit", async () => {
    const u = await newUser("b@x.com");
    await asUser(null, "service_role");
    await db.query("select release_allowance($1, 'k')", [u]);
    const row = await db.query<{ count: number }>("select count from usage_counters where user_id = $1 and key = 'k'", [u]);
    expect(row.rows).toHaveLength(0);
    expect((await db.query<{ consume_allowance: boolean }>("select consume_allowance($1, 'k', 0)", [u])).rows[0].consume_allowance).toBe(false);
  });

  it("keeps counters separate per user and per key", async () => {
    const [u1, u2] = [await newUser("c@x.com"), await newUser("d@x.com")];
    await asUser(null, "service_role");
    const use = async (u: string, k: string) => (await db.query<{ consume_allowance: boolean }>("select consume_allowance($1, $2, 1)", [u, k])).rows[0].consume_allowance;
    expect([await use(u1, "a"), await use(u1, "a"), await use(u1, "b"), await use(u2, "a")]).toEqual([true, false, true, true]);
  });

  it("is not callable by signed-in users (they could reset their own limits)", async () => {
    const u = await newUser("e@x.com");
    await asUser(u);
    await expect(db.query("select consume_allowance($1, 'x', 99)", [u])).rejects.toThrow(/permission denied/);
    await expect(db.query("select release_allowance($1, 'x')", [u])).rejects.toThrow(/permission denied/);
  });

  it("lets users read only their own counters and never write them", async () => {
    const [u1, u2] = [await newUser("f@x.com"), await newUser("g@x.com")];
    await asUser(null, "service_role");
    await db.query("select consume_allowance($1, 'seen', 5)", [u1]);
    await db.query("select consume_allowance($1, 'seen', 5)", [u2]);
    await asUser(u1);
    expect((await db.query("select * from usage_counters")).rows).toHaveLength(1);
    await expect(db.query("insert into usage_counters (user_id, key, count) values ($1, 'hack', 0)", [u1])).rejects.toThrow();
    await db.query("update usage_counters set count = 0");
    await asUser(null, "service_role");
    expect((await db.query<{ count: number }>("select count from usage_counters where user_id = $1", [u1])).rows[0].count).toBe(1);
  });
});

describe("free plan character limit", () => {
  it("matches the limit the app shows", async () => {
    const u = await newUser("h@x.com");
    await asUser(u);
    for (let i = 0; i < FREE_LIMITS.characters; i++) await character(u, `c${i}`);
    await expect(character(u, "one too many")).rejects.toThrow(/character_limit_reached/);
  });

  it("applies per user and frees a slot when a character is deleted", async () => {
    const [u1, u2] = [await newUser("i@x.com"), await newUser("j@x.com")];
    await asUser(u1);
    await character(u1);
    await asUser(u2);
    await character(u2);
    await asUser(u1);
    await db.query("delete from characters where user_id = $1", [u1]);
    await character(u1);
  });

  it("does not apply to pro or admin accounts", async () => {
    const [pro, admin] = [await newUser("k@x.com"), await newUser("l@x.com")];
    await asUser(null, "service_role");
    await db.query("update profiles set plan = 'pro' where id = $1", [pro]);
    await db.query("update profiles set is_admin = true where id = $1", [admin]);
    for (const u of [pro, admin]) {
      await asUser(u);
      await character(u, "1");
      await character(u, "2");
      await character(u, "3");
    }
  });

  it("cannot be skipped by promoting yourself from the browser", async () => {
    const u = await newUser("m@x.com");
    await asUser(u);
    await db.query("update profiles set plan = 'pro', is_admin = true where id = $1", [u]);
    await asUser(null, "service_role");
    const p = await db.query<{ plan: string; is_admin: boolean }>("select plan, is_admin from profiles where id = $1", [u]);
    expect(p.rows[0]).toEqual({ plan: "free", is_admin: false });
  });
});

describe("prompt history", () => {
  const entry = (u: string, label = "x", kind = "inject") =>
    db.query("insert into public.prompt_history (user_id, kind, label, prompt) values ($1, $2, $3, 'p')", [u, kind, label]);

  it("keeps up to 2 extra images per entry, defaulting to none", async () => {
    const u = await newUser("extras@x.com");
    await asUser(u);
    await entry(u, "no-extras");
    const plain = await db.query<{ extra_image_paths: string[] }>("select extra_image_paths from prompt_history where label = 'no-extras'");
    expect(plain.rows[0].extra_image_paths).toEqual([]);
    await db.query("insert into prompt_history (user_id, kind, label, prompt, extra_image_paths) values ($1, 'carousel', 'two', 'p', $2)", [u, ["a", "b"]]);
    await expect(
      db.query("insert into prompt_history (user_id, kind, label, prompt, extra_image_paths) values ($1, 'carousel', 'three', 'p', $2)", [u, ["a", "b", "c"]]),
    ).rejects.toThrow(/check/);
    await db.query("insert into prompt_history (user_id, kind, label, prompt, extra_image_paths) values ($1, 'variant', 'other', 'p', $2)", [u, ["b", "z"]]);
    // The overlap lookup the cleanup uses finds entries that still use a file as an extra image.
    const used = await db.query("select label from prompt_history where extra_image_paths && $1 order by label", [["b"]]);
    expect(used.rows).toEqual([{ label: "other" }, { label: "two" }]);
  });

  it("is private to its owner for reads, updates and deletes", async () => {
    const [a, b] = [await newUser("n@x.com"), await newUser("o@x.com")];
    await asUser(a);
    await entry(a, "mine");
    await asUser(b);
    await entry(b, "theirs");
    expect((await db.query("select * from prompt_history")).rows).toHaveLength(1);
    await db.query("delete from prompt_history where label = 'mine'");
    await db.query("update prompt_history set prompt = 'hacked' where label = 'mine'");
    await asUser(a);
    const rows = await db.query<{ prompt: string }>("select prompt from prompt_history where label = 'mine'");
    expect(rows.rows).toEqual([{ prompt: "p" }]);
  });

  it("cannot be written on behalf of another user", async () => {
    const [a, b] = [await newUser("p@x.com"), await newUser("q@x.com")];
    await asUser(a);
    await expect(entry(b)).rejects.toThrow(/row-level security/);
  });

  it("only accepts known kinds", async () => {
    const u = await newUser("r@x.com");
    await asUser(u);
    await expect(entry(u, "x", "bogus")).rejects.toThrow();
  });
});

describe("sheet pack and generation kinds (0010)", () => {
  it("stores a sheet pack on a character the owner can update, and history meta defaults to {}", async () => {
    const u = await newUser("pack@x.com");
    await asUser(u);
    await character(u, "packed");
    await db.query(`update characters set sheet_pack = '{"v":3,"sig":"a|b"}' where name = 'packed'`);
    const c = await db.query<{ sheet_pack: { v: number } }>("select sheet_pack from characters where name = 'packed'");
    expect(c.rows[0].sheet_pack.v).toBe(3);
    await db.query("insert into prompt_history (user_id, kind, label, prompt) values ($1, 'inject', 'm', 'p')", [u]);
    const h = await db.query<{ meta: unknown }>("select meta from prompt_history where label = 'm'");
    expect(h.rows[0].meta).toEqual({});
  });

  it("accepts likeness fixes and still refuses unknown kinds", async () => {
    const u = await newUser("kinds@x.com");
    await asUser(u);
    const insert = (kind: string) => db.query("insert into generations (user_id, kind, status, provider) values ($1, $2, 'pending', 'p')", [u, kind]);
    await expect(insert("likeness_fix")).resolves.toBeTruthy();
    await expect(insert("reference_sheet")).resolves.toBeTruthy();
    await expect(insert("bogus")).rejects.toThrow();
  });
});

describe("generation files expire", () => {
  async function generation(u: string, path: string, expires: string) {
    await db.exec("reset role");
    await db.query("insert into storage.objects (bucket_id, name) values ('generations', $1)", [path]);
    await db.query(
      `insert into public.generations (user_id, kind, status, provider, output_path, completed_at, expires_at)
       values ($1, 'inject', 'complete', 'p', $2, now(), ${expires})`,
      [u, path],
    );
  }
  const visible = async (u: string) => (await (async () => { await asUser(u); return db.query<{ name: string }>("select name from storage.objects where bucket_id = 'generations'"); })()).rows.map((r) => r.name);

  it("lets owners read unexpired files only", async () => {
    const u = await newUser("s@x.com");
    await generation(u, `${u}/fresh.png`, "now() + interval '10 hours'");
    await generation(u, `${u}/old.png`, "now() - interval '1 minute'");
    expect(await visible(u)).toEqual([`${u}/fresh.png`]);
  });

  it("never shows one user's files to another", async () => {
    const [a, b] = [await newUser("t@x.com"), await newUser("u@x.com")];
    await generation(a, `${a}/mine.png`, "now() + interval '10 hours'");
    expect(await visible(b)).toEqual([]);
  });

  it("gives up access exactly at expires_at even if the file is still stored", async () => {
    const u = await newUser("v@x.com");
    await generation(u, `${u}/x.png`, "now() + interval '10 hours'");
    expect(await visible(u)).toEqual([`${u}/x.png`]);
    await db.exec("reset role");
    await db.query("update public.generations set expires_at = now() - interval '1 second' where user_id = $1", [u]);
    expect(await visible(u)).toEqual([]);
  });

  it("backfills old rows so they expire 72 hours after completion", async () => {
    const m = migration("0006_generation_retention.sql");
    expect(m).toContain("interval '72 hours'");
  });
});

describe("the api ledger", () => {
  const day = "2026-10-24T00:00:00Z";
  const month = "2026-10-01T00:00:00Z";
  const base = { platform: "anthropic", job: "vision", feature: "profile", model: "m", key_source: "byok", status: "succeeded", input_tokens: 1000, output_tokens: 100, cost_usd: 0.01, cost_known: true, cost_source: "list_price", created_at: "2026-10-24T10:00:00Z" };
  async function ledger(u: string, over: Record<string, unknown> = {}) {
    const r = { ...base, ...over };
    await db.exec("reset role");
    await db.query(
      `insert into public.api_ledger (user_id, platform, job, feature, model, key_source, status, input_tokens, output_tokens, cost_usd, cost_known, cost_source, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [u, r.platform, r.job, r.feature, r.model, r.key_source, r.status, r.input_tokens, r.output_tokens, r.cost_usd, r.cost_known, r.cost_source, r.created_at],
    );
  }
  const summary = async (u: string, job: string | null = null) => {
    await asUser(u);
    return (await db.query<Record<string, string>>("select * from ledger_summary($1, $2, $3)", [day, month, job])).rows;
  };
  const row = (rows: Record<string, string>[], platform: string) => rows.find((r) => r.platform === platform)!;

  it("carries over what the old ledger held, then removes the old table and its estimate functions", async () => {
    await db.exec("reset role");
    const rows = (await db.query<Record<string, any>>("select * from api_ledger where user_id = $1 order by id", [legacyUser])).rows;
    expect(rows).toHaveLength(3); // the row with no job was not a real call and is not carried over
    expect(rows[0]).toMatchObject({ platform: "anthropic", job: "vision", feature: "profile", model: "claude-sonnet-5-5", input_tokens: 4000, cost_known: true, cost_source: null, status: "succeeded" });
    expect(Number(rows[0].cost_usd)).toBeCloseTo(0.0123);
    expect(rows[1]).toMatchObject({ platform: "spicyapi", job: "image", cost_source: "provider", generation_id: legacyGeneration });
    expect(rows[2]).toMatchObject({ platform: "openai", feature: "other", cost_known: false, cost_source: null });
    expect((await db.query<{ t: string | null }>("select to_regclass('public.usage_ledger') as t")).rows[0].t).toBeNull();
    await expect(db.query("select * from spend_summary(now(), now())")).rejects.toThrow();
    await expect(db.query("select * from typical_costs()")).rejects.toThrow();
  });

  it("adds up today, this month and all time per platform, with calls, tokens and unpriced calls", async () => {
    const u = await newUser("w@x.com");
    await ledger(u, { cost_usd: 0.012 });
    await ledger(u, { cost_usd: 0.03, created_at: "2026-10-10T10:00:00Z" }); // this month, not today
    await ledger(u, { cost_usd: 0, cost_known: false, cost_source: null });
    await ledger(u, { cost_usd: 9, created_at: "2026-09-30T10:00:00Z" }); // last month
    await ledger(u, { platform: "spicyapi", job: "image", feature: "image:inject", cost_usd: 0.04, cost_source: "provider", input_tokens: null, output_tokens: null });
    const rows = await summary(u);
    expect(rows.map((r) => r.platform)).toEqual(["anthropic", "spicyapi"]); // biggest spender first
    const a = row(rows, "anthropic");
    expect(Number(a.day_cost)).toBeCloseTo(0.012);
    expect(Number(a.month_cost)).toBeCloseTo(0.042);
    expect(Number(a.all_cost)).toBeCloseTo(9.042);
    expect(Number(a.calls)).toBe(4);
    expect(Number(a.month_calls)).toBe(3);
    expect(Number(a.input_tokens)).toBe(4000);
    expect(Number(a.unpriced_calls)).toBe(1);
    expect(Number(row(rows, "spicyapi").month_cost)).toBeCloseTo(0.04);
  });

  it("can be narrowed to one job", async () => {
    const u = await newUser("x@x.com");
    await ledger(u, { job: "vision", cost_usd: 0.1 });
    await ledger(u, { job: "image", feature: "image:edit", cost_usd: 0.2 });
    expect(Number(row(await summary(u, "image"), "anthropic").all_cost)).toBeCloseTo(0.2);
    expect(Number(row(await summary(u, "vision"), "anthropic").all_cost)).toBeCloseTo(0.1);
    expect(Number(row(await summary(u), "anthropic").all_cost)).toBeCloseTo(0.3);
  });

  it("leaves out calls the platform paid for", async () => {
    const u = await newUser("y@x.com");
    await ledger(u, { platform: "spicyapi", key_source: "server", cost_usd: 0.05 });
    expect(await summary(u)).toEqual([]);
    await asUser(u);
    expect((await db.query("select * from api_ledger")).rows).toHaveLength(1); // still listed, just not counted
  });

  it("only ever shows a person their own rows and totals", async () => {
    const [a, b] = [await newUser("z@x.com"), await newUser("aa@x.com")];
    await ledger(a, { cost_usd: 0.5 });
    await ledger(b, { cost_usd: 0.25 });
    expect(Number((await summary(a))[0].all_cost)).toBeCloseTo(0.5);
    expect(Number((await summary(b))[0].all_cost)).toBeCloseTo(0.25);
    await asUser(a);
    expect((await db.query("select * from api_ledger")).rows).toHaveLength(1);
  });

  it("cannot be written, changed or deleted by a signed-in user", async () => {
    const u = await newUser("bb@x.com");
    await ledger(u, { cost_usd: 0.5 });
    await asUser(u);
    await expect(
      db.query("insert into api_ledger (user_id, platform, job, feature, key_source) values ($1, 'x', 'vision', 'f', 'byok')", [u]),
    ).rejects.toThrow(/row-level security/);
    await db.query("update api_ledger set cost_usd = 0");
    await db.query("delete from api_ledger");
    expect(Number((await summary(u))[0].all_cost)).toBeCloseTo(0.5);
  });

  it("refuses rows that make no sense", async () => {
    const u = await newUser("cc@x.com");
    await expect(ledger(u, { job: "bogus" })).rejects.toThrow();
    await expect(ledger(u, { key_source: "friend" })).rejects.toThrow();
    await expect(ledger(u, { status: "weird" })).rejects.toThrow();
    await expect(ledger(u, { cost_usd: -1 })).rejects.toThrow();
    await expect(ledger(u, { cost_source: "guess" })).rejects.toThrow();
    await expect(ledger(u, { cost_known: false, cost_source: "provider" })).rejects.toThrow(); // an unpriced call has no source
  });

  it("keeps fractions of a cent", async () => {
    const u = await newUser("dd@x.com");
    await ledger(u, { cost_usd: 0.000123 });
    expect(Number((await summary(u))[0].all_cost)).toBeCloseTo(0.000123, 6);
  });

  it("keeps the ledger row when a generation is deleted", async () => {
    const u = await newUser("ee@x.com");
    await db.exec("reset role");
    const g = await db.query<{ id: string }>("insert into generations (user_id, kind, status, provider) values ($1, 'edit', 'complete', 'spicyapi') returning id", [u]);
    await db.query("insert into api_ledger (user_id, platform, job, feature, key_source, cost_usd, generation_id) values ($1, 'spicyapi', 'image', 'image:edit', 'byok', 0.04, $2)", [u, g.rows[0].id]);
    await db.query("delete from generations where id = $1", [g.rows[0].id]);
    const rows = (await db.query<{ generation_id: string | null; cost_usd: string }>("select generation_id, cost_usd from api_ledger where user_id = $1", [u])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].generation_id).toBeNull();
    expect(Number(rows[0].cost_usd)).toBeCloseTo(0.04);
  });
});
