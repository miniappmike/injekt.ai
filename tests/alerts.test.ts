import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake database: user_settings prefs and profiles, enough for the alert connect flow.
const h = vi.hoisted(() => ({
  settings: new Map<string, Record<string, unknown>>(),
  admins: new Set<string>(),
  sent: [] as { chat_id: number; text: string }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments/telegram", () => ({
  telegramEnabled: () => true,
  telegramApi: vi.fn(async (_m: string, body: { chat_id: number; text: string }) => (h.sent.push(body), true)),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@x.com` } } }) } },
    from: (table: string) => {
      const q: { col?: string; val?: unknown; in?: string[] } = {};
      const rows = () =>
        table === "profiles"
          ? [...h.admins].map((id) => ({ id, is_admin: true })).filter((r) => (q.col === "id" ? r.id === q.val : true))
          : [...h.settings].map(([user_id, prefs]) => ({ user_id, prefs })).filter((r) =>
              q.in ? q.in.includes(r.user_id) : q.col === "user_id" ? r.user_id === q.val : q.col?.startsWith("prefs->") ? (r.prefs.telegramAlertLink as { code?: string } | undefined)?.code === q.val : true,
            );
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => ((q.col = c), (q.val = v), chain),
        in: (_c: string, v: string[]) => ((q.in = v), chain),
        maybeSingle: async () => ({ data: rows()[0] ?? null }),
        then: (res: (x: unknown) => unknown) => Promise.resolve({ data: rows() }).then(res),
        update: (patch: { prefs: Record<string, unknown> }) => ({ eq: async (_c: string, id: string) => (h.settings.set(id, patch.prefs), { error: null }) }),
      };
      return chain;
    },
  }),
}));

import { alertAdmins, alertConnectLink, alertStatus, connectAlertChat, disconnectAlerts } from "@/lib/payments/alerts";

beforeEach(() => {
  h.settings.clear();
  h.admins.clear();
  h.sent.length = 0;
});

describe("Telegram alerts", () => {
  it("connects an admin's chat from the one-time link, then sends them alerts", async () => {
    h.admins.add("a1");
    h.settings.set("a1", { other: 1 });
    const url = await alertConnectLink("a1", "ModelSpawnBot");
    const code = url.split("alerts_")[1];
    expect(url).toMatch(/^https:\/\/t\.me\/ModelSpawnBot\?start=alerts_[0-9a-f]{24}$/);
    expect(await connectAlertChat(code, 777)).toMatch(/Alerts are on/);
    expect(h.settings.get("a1")).toMatchObject({ other: 1, telegramAlert: { chatId: 777 } });
    expect(h.settings.get("a1")?.telegramAlertLink).toBeUndefined(); // the code can't be used twice
    expect(await connectAlertChat(code, 888)).toMatch(/expired/);
    expect((await alertStatus("a1")).connected).toBe(true);

    await alertAdmins("hello");
    expect(h.sent).toEqual([expect.objectContaining({ chat_id: 777, text: "hello" })]);

    await disconnectAlerts("a1");
    expect((await alertStatus("a1")).connected).toBe(false);
  });

  it("won't connect a non-admin, a made-up code or an expired one", async () => {
    h.settings.set("u1", { telegramAlertLink: { code: "a".repeat(24), expires: new Date(Date.now() + 60_000).toISOString() } });
    expect(await connectAlertChat("a".repeat(24), 1)).toMatch(/Only ModelSpawn admins/);
    expect(await connectAlertChat("not-a-code", 1)).toMatch(/isn't valid/);
    h.admins.add("u2");
    h.settings.set("u2", { telegramAlertLink: { code: "b".repeat(24), expires: new Date(Date.now() - 1).toISOString() } });
    expect(await connectAlertChat("b".repeat(24), 1)).toMatch(/expired/);
  });
});
