import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ collectPending: vi.fn(), order: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/generation", () => ({
  GENERATIONS_BUCKET: "generations",
  collectPending: h.collectPending,
}));

import { generationState, listGenerations } from "@/lib/generation-list";

const NOW = new Date("2026-03-10T12:00:00Z");
const hoursFromNow = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();
const user = { id: "u1", email_confirmed_at: "2026-01-01T00:00:00Z" };

type Row = Record<string, unknown>;
const row = (over: Row = {}): Row => ({
  id: "g1",
  kind: "inject",
  status: "complete",
  model: "seedream",
  prompt: "Use @image1",
  error: null,
  output_path: "u1/generations/g1.jpg",
  created_at: hoursFromNow(-1),
  expires_at: hoursFromNow(71),
  cost_usd: "0.045",
  params: null,
  ...over,
});

// The user's client: their generation rows, and signed links for the files that exist.
function client(rows: Row[], opts: { failLinks?: boolean } = {}) {
  const signed: { path: string; ttl: number; download: boolean }[] = [];
  const supabase = {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => {
            h.order.push("select");
            return { data: rows, error: null };
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, ttl: number, o?: { download?: boolean }) => {
          signed.push({ path, ttl, download: !!o?.download });
          return opts.failLinks ? { data: null, error: new Error("nope") } : { data: { signedUrl: `https://files.test/${path}?d=${o?.download ? 1 : 0}` }, error: null };
        },
      }),
    },
  };
  return { supabase: supabase as never, signed };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.order = [];
  h.collectPending.mockReset();
  h.collectPending.mockImplementation(async () => {
    h.order.push("collect");
  });
});
afterEach(() => vi.useRealTimers());

describe("generationState", () => {
  it("is generating while the job is unfinished", () => {
    expect(generationState({ status: "pending", output_path: null, expires_at: null })).toBe("generating");
    expect(generationState({ status: "processing", output_path: null, expires_at: null })).toBe("generating");
  });

  it("is failed for a failed job", () => {
    expect(generationState({ status: "failed", output_path: null, expires_at: null })).toBe("failed");
  });

  it("is ready only while the file exists and its 72 hours have not run out", () => {
    expect(generationState({ status: "complete", output_path: "p.jpg", expires_at: hoursFromNow(1) })).toBe("ready");
    expect(generationState({ status: "complete", output_path: "p.jpg", expires_at: hoursFromNow(-1) })).toBe("expired");
    // The cleanup job removed the file.
    expect(generationState({ status: "complete", output_path: null, expires_at: hoursFromNow(-1) })).toBe("expired");
    // A finished image with no expiry recorded is not offered, rather than kept forever.
    expect(generationState({ status: "complete", output_path: "p.jpg", expires_at: null })).toBe("expired");
  });
});

describe("listGenerations", () => {
  it("finishes anything that completed while you were away before it lists", async () => {
    const { supabase } = client([row()]);
    await listGenerations(supabase, user);
    expect(h.collectPending).toHaveBeenCalledWith(supabase, user);
    expect(h.order).toEqual(["collect", "select"]);
  });

  it("gives a ready image a view link and a download link that both stop working when it expires", async () => {
    const { supabase, signed } = client([row({ expires_at: hoursFromNow(0.5) })]);
    const [item] = await listGenerations(supabase, user);
    expect(item).toMatchObject({
      id: "g1",
      state: "ready",
      kindLabel: "Inject",
      model: "seedream",
      prompt: "Use @image1",
      previewUrl: "https://files.test/u1/generations/g1.jpg?d=0",
      downloadUrl: "https://files.test/u1/generations/g1.jpg?d=1",
    });
    expect(signed.map((s) => s.download).sort()).toEqual([false, true]);
    for (const s of signed) expect(s.ttl).toBe(1800);
  });

  it("never lets a link outlive the image, and never asks for less than a minute or more than an hour", async () => {
    const { supabase, signed } = client([
      row({ id: "a", output_path: "a.jpg", expires_at: hoursFromNow(70) }),
      row({ id: "b", output_path: "b.jpg", expires_at: new Date(NOW.getTime() + 5_000).toISOString() }),
    ]);
    await listGenerations(supabase, user);
    expect(signed.filter((s) => s.path === "a.jpg").every((s) => s.ttl === 3600)).toBe(true);
    expect(signed.filter((s) => s.path === "b.jpg").every((s) => s.ttl === 60)).toBe(true);
  });

  it("makes no links for images that are expired, failed or still generating", async () => {
    const { supabase, signed } = client([
      row({ id: "old", expires_at: hoursFromNow(-3) }),
      row({ id: "gone", output_path: null, expires_at: hoursFromNow(-3) }),
      row({ id: "bad", status: "failed", output_path: null, error: "The provider said no", cost_usd: "0" }),
      row({ id: "busy", status: "processing", output_path: null, expires_at: null, cost_usd: null }),
    ]);
    const items = await listGenerations(supabase, user);
    expect(signed).toEqual([]);
    expect(items.map((i) => [i.id, i.state, i.previewUrl, i.downloadUrl])).toEqual([
      ["old", "expired", null, null],
      ["gone", "expired", null, null],
      ["bad", "failed", null, null],
      ["busy", "generating", null, null],
    ]);
    expect(items[2].error).toBe("The provider said no");
  });

  it("treats an image whose links could not be made as unavailable instead of showing it broken", async () => {
    const { supabase } = client([row()], { failLinks: true });
    const [item] = await listGenerations(supabase, user);
    expect(item.state).toBe("expired");
    expect(item.previewUrl).toBeNull();
    expect(item.downloadUrl).toBeNull();
  });

  it("shows what each image cost once it is known, as a number", async () => {
    const { supabase } = client([
      row({ id: "paid", cost_usd: "0.045" }),
      row({ id: "unknown", cost_usd: null }),
      row({ id: "busy", status: "pending", output_path: null, expires_at: null, cost_usd: "0.045" }),
    ]);
    const items = await listGenerations(supabase, user);
    expect(items.map((i) => [i.id, i.costUsd])).toEqual([["paid", 0.045], ["unknown", null], ["busy", null]]);
  });

  it("marks the free image, which Model Spawn pays for", async () => {
    const { supabase } = client([row({ id: "free", params: { free: true } }), row({ id: "mine", params: { free: false } }), row({ id: "none", params: null })]);
    const items = await listGenerations(supabase, user);
    expect(items.map((i) => i.free)).toEqual([true, false, false]);
  });

  it("returns an empty list when you have no images", async () => {
    const { supabase } = client([]);
    expect(await listGenerations(supabase, user)).toEqual([]);
  });
});
