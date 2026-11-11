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
  it("is on only with an Image key; confirmed once they've been through Settings (or already had it on)", () => {
    expect(generationState(settings({ enabled: true }))).toEqual({ hasImageKey: true, enabled: true, confirmed: true });
    expect(generationState(settings({ enabled: false, confirmed: true }))).toEqual({ hasImageKey: true, enabled: false, confirmed: true });
    expect(generationState(settings())).toEqual({ hasImageKey: true, enabled: false, confirmed: false });
    expect(generationState(settings({ enabled: true }, false))).toMatchObject({ hasImageKey: false, enabled: false });
  });
});

describe("toggleGeneration", () => {
  it("with no Image key it sends them to Settings and changes nothing", async () => {
    h.prefs = settings(undefined, false);
    expect(await toggleGeneration()).toEqual({ ok: false, settings: true });
    expect(h.updates).toHaveLength(0);
  });

  it("with a key but the Settings confirmation never done, switching on goes to Settings too", async () => {
    h.prefs = settings();
    expect(await toggleGeneration()).toEqual({ ok: false, settings: true });
    expect(h.updates).toHaveLength(0);
  });

  it("switches off in one click, and back on once they've confirmed", async () => {
    h.prefs = settings({ enabled: true });
    expect(await toggleGeneration()).toEqual({ ok: true, enabled: false });
    expect(h.updates.at(-1)).toMatchObject({ generation: { enabled: false, confirmed: true } });
    h.prefs = h.updates.at(-1) as Record<string, unknown>;
    expect(await toggleGeneration()).toEqual({ ok: true, enabled: true });
    expect(h.updates.at(-1)).toMatchObject({ generation: { enabled: true, confirmed: true } });
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
  it("records the confirmation when switching on, and keeps it when switching off", async () => {
    h.prefs = settings();
    expect(await setGeneration({ enabled: true })).toMatchObject({ ok: false });
    expect(await setGeneration({ enabled: true, confirmed: true })).toEqual({ ok: true });
    expect(h.updates.at(-1)).toMatchObject({ generation: { enabled: true, confirmed: true } });
    h.prefs = h.updates.at(-1) as Record<string, unknown>;
    await setGeneration({ enabled: false });
    expect(h.updates.at(-1)).toMatchObject({ generation: { enabled: false, confirmed: true } });
  });

  it("won't switch on without an Image key", async () => {
    h.prefs = settings(undefined, false);
    expect(await setGeneration({ enabled: true, confirmed: true })).toMatchObject({ ok: false, error: expect.stringMatching(/Image key/) });
  });
});
