import { beforeEach, describe, expect, it, vi } from "vitest";

const L = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const USER = "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b";

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  cookies: new Map<string, string>(),
  set: vi.fn(),
  rpc: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (h.cookies.has(n) ? { value: h.cookies.get(n) } : undefined),
    set: (n: string, v: string, o: unknown) => {
      h.cookies.set(n, v);
      h.set(n, v, o);
    },
  }),
  headers: async () => new Map([["x-forwarded-for", "203.0.113.9, 10.0.0.1"]]),
}));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ rpc: h.rpc }) }));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: h.limit }));

import { toggleLike } from "@/lib/marketplace/like-actions";
import { formatLikes } from "@/components/marketplace/heart-button";
import { RateLimitError } from "@/lib/errors";

beforeEach(() => {
  vi.clearAllMocks();
  h.user = null;
  h.cookies.clear();
  h.limit.mockResolvedValue(undefined);
  h.rpc.mockResolvedValue({ data: [{ liked: true, likes: 7 }], error: null });
});

describe("toggleLike", () => {
  it("a signed-in heart counts for the account", async () => {
    h.user = { id: USER };
    expect(await toggleLike(L)).toEqual({ ok: true, liked: true, likes: 7 });
    expect(h.rpc).toHaveBeenCalledWith("toggle_listing_like", { p_listing: L, p_liker: `u:${USER}` });
    expect(h.set).not.toHaveBeenCalled();
  });

  it("a signed-out visitor gets a private visitor cookie once, and keeps it", async () => {
    await toggleLike(L);
    expect(h.set).toHaveBeenCalledTimes(1);
    const [name, id, opts] = h.set.mock.calls[0];
    expect(name).toBe("ms_vid");
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(h.rpc).toHaveBeenLastCalledWith("toggle_listing_like", { p_listing: L, p_liker: `v:${id}` });
    await toggleLike(L);
    expect(h.set).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenLastCalledWith("toggle_listing_like", { p_listing: L, p_liker: `v:${id}` });
  });

  it("is rate limited per liker and per network address", async () => {
    h.user = { id: USER };
    await toggleLike(L);
    expect(h.limit).toHaveBeenCalledWith(`u:${USER}`, "like", 30, 60);
    expect(h.limit).toHaveBeenCalledWith("ip:203.0.113.9", "like-ip", 120, 60);
    h.limit.mockRejectedValueOnce(new RateLimitError(20));
    expect(await toggleLike(L)).toEqual({ ok: false, error: "Slow down a little, then try again." });
  });

  it("explains hidden personas, and rejects bad ids before doing anything", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "like_not_public" } });
    expect(await toggleLike(L)).toEqual({ ok: false, error: "This persona isn't on the marketplace right now." });
    h.rpc.mockClear();
    expect((await toggleLike("nope")).ok).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("formatLikes", () => {
  it("keeps counts short", () => {
    expect([0, 999, 1000, 1250, 9999, 12500].map(formatLikes)).toEqual(["0", "999", "1k", "1.3k", "10k", "13k"]);
  });
});
