import { beforeAll, describe, expect, it } from "vitest";
import { bootDb } from "./boot";

// Tokens (credit lots), the Pro pass and orders, checked against the real migrations.
let t: Awaited<ReturnType<typeof bootDb>>;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => t.db.query<T>(sql, params);
const one = async <T,>(sql: string, params: unknown[] = []) => {
  await t.as(null, "service_role");
  const r = (await q<T>(sql, params)).rows[0];
  await t.db.exec("reset role");
  return r;
};
const balance = async (u: string) => (await one<{ b: number }>("select public.credit_balance($1) as b", [u])).b;
const spend = async (u: string, n: number) => (await one<{ s: string | null }>("select public.spend_credits($1, $2, 'image:inject') as s", [u, n])).s;
const lot = (u: string, source: string, n: number, expires: string | null = null) =>
  q("insert into public.credit_lots (user_id, source, amount, remaining, expires_at) values ($1, $2, $3, $3, $4)", [u, source, n, expires]);
const order = async (u: string, kind: "pro" | "pack", credits: number, bonus = false, email = "a@x.com", device: string | null = null) =>
  (await q<{ id: string }>(
    "insert into public.orders (user_id, kind, credits, amount_cents, first_month_bonus, email_key, device_hash) values ($1, $2, $3, 999, $4, $5, $6) returning id",
    [u, kind, credits, bonus, email, device],
  )).rows[0].id;
const fulfill = async (id: string) => (await one<{ ok: boolean }>("select public.fulfill_order($1, 'test', null, 30, 200) as ok", [id])).ok;

beforeAll(async () => {
  t = await bootDb();
});

describe("tokens", () => {
  it("gives the free tokens once", async () => {
    const u = await t.newUser("free@x.com");
    expect((await one<{ g: boolean }>("select public.grant_signup_credits($1, 15) as g", [u])).g).toBe(true);
    expect((await one<{ g: boolean }>("select public.grant_signup_credits($1, 15) as g", [u])).g).toBe(false);
    expect(await balance(u)).toBe(15);
  });

  it("spends the soonest-expiring first, refuses when short, and a refund puts them back once", async () => {
    const u = await t.newUser("spend@x.com");
    await t.db.exec("reset role");
    await lot(u, "topup", 10);
    await lot(u, "pro", 3, new Date(Date.now() + 86_400_000).toISOString());
    await lot(u, "pro", 50, new Date(Date.now() - 1000).toISOString()); // expired: not spendable
    expect(await balance(u)).toBe(13);
    const s = await spend(u, 4);
    expect(s).toBeTruthy();
    const left = (await q<{ source: string; remaining: number }>("select source, remaining from public.credit_lots where user_id = $1 and source <> 'pro' or (user_id = $1 and expires_at > now()) order by source", [u])).rows;
    expect(left).toEqual([{ source: "pro", remaining: 0 }, { source: "topup", remaining: 9 }]);
    expect(await spend(u, 100)).toBeNull();
    expect(await balance(u)).toBe(9);
    expect((await one<{ r: boolean }>("select public.refund_credits($1) as r", [s])).r).toBe(true);
    expect((await one<{ r: boolean }>("select public.refund_credits($1) as r", [s])).r).toBe(false);
    expect(await balance(u)).toBe(13);
  });

  it("can't be read by someone else or changed from the browser, and the functions are server-only", async () => {
    const u = await t.newUser("own@x.com");
    const v = await t.newUser("other@x.com");
    await t.db.exec("reset role");
    await lot(u, "topup", 5);
    await t.as(v);
    expect((await q("select * from public.credit_lots where user_id = $1", [u])).rows).toHaveLength(0);
    await expect(q("update public.credit_lots set remaining = 999 where user_id = $1", [u])).rejects.toThrow();
    await expect(q("select public.spend_credits($1, 1, 'x')", [u])).rejects.toThrow();
    await expect(q("select public.grant_signup_credits($1, 1000)", [v])).rejects.toThrow();
    await t.as(u);
    expect((await q("select * from public.credit_lots where user_id = $1", [u])).rows).toHaveLength(1);
    await t.db.exec("reset role");
  });
});

describe("orders", () => {
  it("a pack adds tokens that never expire, once", async () => {
    const u = await t.newUser("pack@x.com");
    await t.db.exec("reset role");
    const id = await order(u, "pack", 525);
    expect(await fulfill(id)).toBe(true);
    expect(await fulfill(id)).toBe(false); // a repeated webhook does nothing
    expect(await balance(u)).toBe(525);
    expect((await q<{ expires_at: string | null }>("select expires_at from public.credit_lots where user_id = $1", [u])).rows[0].expires_at).toBeNull();
  });

  it("Pro adds 30 days and the month's tokens, which expire with it; renewing early stacks the days", async () => {
    const u = await t.newUser("pro@x.com");
    await t.db.exec("reset role");
    await fulfill(await order(u, "pro", 220, true, "pro@x.com", "dev-1"));
    const p1 = (await q<{ pro_until: Date }>("select pro_until from public.profiles where id = $1", [u])).rows[0].pro_until;
    expect(new Date(p1).getTime() - Date.now()).toBeGreaterThan(29.9 * 86_400_000);
    expect(await balance(u)).toBe(220);
    await fulfill(await order(u, "pro", 200));
    const p2 = (await q<{ pro_until: Date }>("select pro_until from public.profiles where id = $1", [u])).rows[0].pro_until;
    expect(new Date(p2).getTime() - Date.now()).toBeGreaterThan(59.9 * 86_400_000);
    expect(await balance(u)).toBe(420);
    // Pro has no character limit.
    await q("insert into public.characters (user_id, name, provenance_attested_at) values ($1, 'a', now()), ($1, 'b', now())", [u]);
  });

  it("the first-month bonus goes to one account per email and per device; others get the normal month", async () => {
    const a = await t.newUser("bonus-a@x.com");
    const b = await t.newUser("bonus-b@x.com");
    const c = await t.newUser("bonus-c@x.com");
    await t.db.exec("reset role");
    await fulfill(await order(a, "pro", 220, true, "same@gmail.com", "dev-a"));
    await fulfill(await order(b, "pro", 220, true, "same@gmail.com", "dev-b")); // same inbox
    await fulfill(await order(c, "pro", 220, true, "c@x.com", "dev-a")); // same device
    expect(await balance(a)).toBe(220);
    expect(await balance(b)).toBe(200);
    expect(await balance(c)).toBe(200);
  });
});
