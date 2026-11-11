import { beforeEach, describe, expect, it, vi } from "vitest";

// The profile menu's one-click image generation switch, and the confirmation flag behind it.
const h = vi.hoisted(() => ({ prefs: {} as Record<string, unknown>, updates: [] as unknown[], updateError: null as null | { message: string } }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({
    user: { id: "u1" },
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { prefs: h.prefs } }) }) }),
        update: (patch: { prefs: unknown }) => ({
          eq: async () => {
            if (!h.updateError) h.updates.push(patch.prefs);
            return { error: h.updateError };
          },
        }),
      }),
    },
  }),
}));
vi.mock("@/lib/key-store", () => ({ saveUserKey: vi.fn() }));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn() }));
vi.mock("@/lib/ai/image-setup", () => ({ getUserImageConfig: vi.fn(), resolveUserImageKey: vi.fn() }));
vi.mock("@/lib/ai/providers/registry", () => ({ getImageProvider: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: vi.fn() }));

import { setGeneration, toggleGeneration } from "@/app/(app)/settings/api-keys/actions";
import { generationState } from "@/lib/generation-access";

const withKey = { roles: { image: { provider: "spicyapi", model: "m" } } };
const settings = (generation?: unknown, keyed = true) => ({ ...(keyed ? withKey : {}), ...(generation ? { generation } : {}) });

beforeEach(() => {
  h.prefs = {};
  h.updates.length = 0;
  h.updateError = null;
});

describe("generationState", () => {
  it("is on unless they switched it off (credits pay for images, so no key or confirmation is needed)", () => {
    expect(generationState(settings({ enabled: true }))).toEqual({ hasImageKey: true, enabled: true, confirmed: true });
    expect(generationState(settings({ enabled: false, confirmed: true }))).toEqual({ hasImageKey: true, enabled: false, confirmed: true });
    expect(generationState(settings())).toEqual({ hasImageKey: true, enabled: true, confirmed: true });
    expect(generationState(settings(undefined, false))).toEqual({ hasImageKey: false, enabled: true, confirmed: true });
    expect(generationState(settings({ enabled: false }, false))).toMatchObject({ hasImageKey: false, enabled: false });
  });
});

describe("toggleGeneration", () => {
  it("flips it in one click, with or without a key", async () => {
    h.prefs = settings(undefined, false);
    expect(await toggleGeneration()).toEqual({ ok: true, enabled: false });
    h.prefs = h.updates.at(-1) as Record<string, unknown>;
    expect(await toggleGeneration()).toEqual({ ok: true, enabled: true });
  });

  it("switches off in one click, and back on", async () => {
    h.prefs = settings({ enabled: true });
    expect(await toggleGeneration()).toEqual({ ok: true, enabled: false });
    expect(h.updates.at(-1)).toMatchObject({ generation: { enabled: false } });
    h.prefs = h.updates.at(-1) as Record<string, unknown>;
    expect(await toggleGeneration()).toEqual({ ok: true, enabled: true });
    expect(h.updates.at(-1)).toMatchObject({ generation: { enabled: true } });
  });

  it("keeps their other settings, and reports a save problem", async () => {
    h.prefs = { ...settings({ enabled: true }), somethingElse: 1 };
    await toggleGeneration();
    expect(h.updates.at(-1)).toMatchObject({ somethingElse: 1, roles: withKey.roles });
    h.updateError = { message: "x" };
    expect(await toggleGeneration()).toEqual({ ok: false, error: "Couldn't save that. Try again." });
  });
});

describe("setGeneration (Settings)", () => {
  it("switches on and off without a key", async () => {
    h.prefs = settings(undefined, false);
    expect(await setGeneration({ enabled: false })).toEqual({ ok: true });
    expect(h.updates.at(-1)).toMatchObject({ generation: { enabled: false } });
    h.prefs = h.updates.at(-1) as Record<string, unknown>;
    expect(await setGeneration({ enabled: true })).toEqual({ ok: true });
    expect(h.updates.at(-1)).toMatchObject({ generation: { enabled: true } });
  });
});
