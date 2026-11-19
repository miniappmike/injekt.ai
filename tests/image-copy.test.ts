import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, ownGeneration: false }));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" } }));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: h.ownGeneration ? [{ id: "g1" }] : [] }) }) }) }) }),
  }),
}));

import { GET } from "@/app/api/image-copy/route";
import { NextRequest } from "next/server";

const call = (u: string) => GET(new NextRequest(`https://modelspawn.test/api/image-copy?u=${encodeURIComponent(u)}`));

beforeEach(() => {
  h.user = { id: "u1" };
  h.ownGeneration = false;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })));
});

describe("/api/image-copy", () => {
  it("passes on a picture from the project's storage", async () => {
    const r = await call("https://proj.supabase.co/storage/v1/object/sign/generations/u1/g.png?token=t");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("passes on the provider's link only when it is one of their own generations", async () => {
    expect((await call("https://cdn.provider.test/out/abc.png")).status).toBe(403);
    h.ownGeneration = true;
    expect((await call("https://cdn.provider.test/out/abc.png")).status).toBe(200);
  });

  it("refuses anyone signed out, other addresses, and things that aren't pictures", async () => {
    expect((await call("http://169.254.169.254/latest/meta-data")).status).toBe(400);
    expect((await call("https://proj.supabase.co/rest/v1/profiles")).status).toBe(403);
    expect((await call("not a url")).status).toBe(400);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })));
    expect((await call("https://proj.supabase.co/storage/v1/object/sign/x?token=t")).status).toBe(415);
    h.user = null;
    expect((await call("https://proj.supabase.co/storage/v1/object/sign/x?token=t")).status).toBe(401);
  });
});
