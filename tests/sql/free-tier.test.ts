import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { FREE_LIMITS } from "@/lib/limits";

// Runs the real migrations in an in-process Postgres with minimal stand-ins for Supabase's auth schema and roles.
const db = new PGlite();
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
