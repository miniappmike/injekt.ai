import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * An in-process Postgres with every migration applied, and stand-ins for Supabase's auth and storage schemas and its
 * API roles (anon, authenticated, service_role), including Supabase's default grants that the migrations must take away.
 */
export async function bootDb() {
  const db = new PGlite();
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
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  const dir = join(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  // Storage tables are stand-ins; turn on row-level security so the storage policies are really tested.
  await db.exec(`
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon, authenticated;
    grant insert, delete on storage.objects to authenticated;
  `);

  /** Acts as a user (or signed out) under one of the API roles, or as the database owner with "postgres". */
  async function as(id: string | null, role: "anon" | "authenticated" | "service_role" | "postgres" = "authenticated") {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id ?? ""}', false);`);
    if (role !== "postgres") await db.exec(`set role ${role}`);
  }
  async function newUser(email: string, opts: { admin?: boolean; plan?: "free" | "pro" } = {}) {
    await db.exec("reset role");
    const id = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
    if (opts.admin) await db.query("update public.profiles set is_admin = true where id = $1", [id]);
    if (opts.plan) await db.query("update public.profiles set plan = $2 where id = $1", [id, opts.plan]);
    return id;
  }
  /** Runs SQL as the database owner with the trusted flag on, the way the purchase and reservation functions do. */
  async function trusted(sql: string, params: unknown[] = []) {
    await db.exec("reset role");
    await db.exec("begin; select set_config('marketplace.trusted', 'on', true);");
    try {
      await db.query(sql, params);
      await db.exec("commit");
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  }
  /** Empties the marketplace tables between tests (sold listings are protected, so the guards are paused). */
  async function resetMarketplace() {
    await db.exec(`
      reset role;
      delete from storage.objects; delete from public.listing_images; delete from public.purchases;
      delete from public.characters where purchased_from_listing_id is not null;
      alter table public.marketplace_listings disable trigger marketplace_listing_delete_guard;
      delete from public.marketplace_listings;
      alter table public.marketplace_listings enable trigger marketplace_listing_delete_guard;
    `);
  }
  return { db, as, newUser, trusted, resetMarketplace };
}
