import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: vi.fn(async () => null) }));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: vi.fn(async () => {}) }));
vi.mock("@/lib/entitlements", () => ({ entitlements: { useAllowance: vi.fn() } }));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn() }));
vi.mock("@/lib/character-images", async (orig) => ({
  ...(await orig<typeof import("@/lib/character-images")>()),
  loadForVision: vi.fn(async () => [{ label: "face sheet", dataUri: "data:image/jpeg;base64,QUJD" }]),
}));

import { runProfileBuild } from "@/lib/ai/build-profile";
import { entitlements } from "@/lib/entitlements";
import { getUserTextClient } from "@/lib/ai/text-client";
import { ApiKeyRequiredError, LimitReachedError } from "@/lib/errors";

const character = { name: "Juno", height: null, weight: null, always_keep: null, face_sheet_path: "u/characters/c/a.jpg", body_sheet_path: null, reference_paths: [] };

function fakeSupabase(opts: { character?: unknown; updateError?: boolean } = {}) {
  const updates: unknown[] = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: "character" in opts ? opts.character : character }) }) }),
      update: (row: unknown) => ({ eq: async () => (updates.push(row), { error: opts.updateError ? { message: "db" } : null }) }),
    }),
  };
  return { client: client as never, updates };
}

const release = vi.fn(async () => {});
const modelReplies = (text: string | Error) =>
  vi.mocked(getUserTextClient).mockResolvedValue({
    client: { run: async () => { if (text instanceof Error) throw text; return text; } },
    imageMaxEdge: undefined,
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(entitlements.useAllowance).mockResolvedValue({ release });
});

describe("runProfileBuild", () => {
  it("saves the generated profile and keeps the free-plan attempt used", async () => {
    modelReplies('{"identity":"Tall brunette","face":"oval"}');
    const { client, updates } = fakeSupabase();
    const r = await runProfileBuild(client, "u", "c");
    expect(r).toEqual({ ok: true, profile: { identity_line: "Tall brunette", face: "oval" } });
    expect(updates[0]).toMatchObject({ profile: { identity_line: "Tall brunette", face: "oval" } });
    expect(release).not.toHaveBeenCalled();
  });

  it("does not use an attempt when there are no images", async () => {
    const { client } = fakeSupabase({ character: { ...character, face_sheet_path: null } });
    const r = await runProfileBuild(client, "u", "c");
    expect(r).toMatchObject({ ok: false, code: "no_images" });
    expect(entitlements.useAllowance).not.toHaveBeenCalled();
  });

  it("reports a missing character as a failure", async () => {
    const { client } = fakeSupabase({ character: null });
    expect(await runProfileBuild(client, "u", "c")).toMatchObject({ ok: false, code: "failed" });
  });

  it("gives the attempt back and points at API keys when no key is set up", async () => {
    vi.mocked(getUserTextClient).mockRejectedValue(new ApiKeyRequiredError("vision"));
    const { client } = fakeSupabase();
    const r = await runProfileBuild(client, "u", "c");
    expect(r).toMatchObject({ ok: false, code: "no_key", redirectTo: "/settings/api-keys?provider=vision" });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("reports the free limit without having used an attempt", async () => {
    vi.mocked(entitlements.useAllowance).mockRejectedValue(new LimitReachedError("profile_builds"));
    const { client } = fakeSupabase();
    const r = await runProfileBuild(client, "u", "c");
    expect(r).toMatchObject({ ok: false, code: "limit" });
    expect(release).not.toHaveBeenCalled();
    expect(getUserTextClient).not.toHaveBeenCalled();
  });

  it("gives the attempt back when the provider fails", async () => {
    modelReplies(new Error("provider down"));
    const { client, updates } = fakeSupabase();
    expect(await runProfileBuild(client, "u", "c")).toMatchObject({ ok: false, code: "failed" });
    expect(release).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(0);
  });

  it("gives the attempt back when the model returns something unusable", async () => {
    modelReplies("sorry, I can't do that");
    const { client, updates } = fakeSupabase();
    expect(await runProfileBuild(client, "u", "c")).toMatchObject({ ok: false, code: "failed" });
    expect(release).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(0);
  });

  it("gives the attempt back when saving fails, so the user is not charged for a lost result", async () => {
    modelReplies('{"face":"oval"}');
    const { client } = fakeSupabase({ updateError: true });
    expect(await runProfileBuild(client, "u", "c")).toMatchObject({ ok: false, code: "failed" });
    expect(release).toHaveBeenCalledTimes(1);
  });
});
