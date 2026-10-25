import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ loaded: [] as string[][] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: async () => ({ client: {}, imageMaxEdge: 768 }) }));
vi.mock("@/lib/character-images", async (orig) => ({
  ...(await orig<typeof import("@/lib/character-images")>()),
  loadForVision: async (_s: unknown, items: { label: string; path: string }[]) => {
    h.loaded.push(items.map((i) => i.path));
    return items.map((i) => ({ label: i.label, dataUri: `data:${i.path}` }));
  },
}));

import { prepareVision } from "@/lib/ai/vision-run";

const character = { name: "Holly", height: null, weight: null, always_keep: null, profile: {}, face_sheet_path: "u/face.jpg", body_sheet_path: "u/body.jpg", reference_paths: ["u/r1.jpg", "u/r2.jpg"] };
const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: character }) }) }) }) } as never;

describe("prepareVision", () => {
  it.each([
    ["variants", ["u/face.jpg", "u/body.jpg"]],
    ["carousel", ["u/face.jpg", "u/body.jpg"]],
    ["likeness", ["u/face.jpg", "u/body.jpg", "u/r1.jpg", "u/r2.jpg"]],
  ] as const)("%s prompt writing sees the same character images its generations send", async (feature, expected) => {
    h.loaded = [];
    const { references } = await prepareVision(supabase, "u", "c1", [{ label: "cover image", path: "u/cover.jpg" }], feature);
    expect(references.map((r) => r.dataUri)).toEqual(expected.map((p) => `data:${p}`));
    expect(h.loaded.at(-1)).toEqual(["u/cover.jpg"]);
  });
});
