import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { fillPatch, parseOverlays, planClean } from "@/lib/ai/prompts/cleanup";

describe("parseOverlays", () => {
  it("keeps sane boxes only, and at most 12", () => {
    const r = parseOverlays({
      overlays: [{ what: "like bar", box: [0.85, 0.3, 0.98, 0.7] }, { what: "bad", box: [0, 0, 2, 1] }, { box: [0.1, 0.1, 0.105, 0.5] }, null, { box: [0.02, 0.9, 0.5, 0.99] }, { what: "status bar", box: [1, 0.03, 0, 0] }],
      person: [0.3, 0.1, 0.7, 1],
    });
    // Thin strips (a 3%-tall status bar) count; slivers under 1% don't.
    expect(r.ovs).toEqual([{ what: "like bar", box: [0.85, 0.3, 0.98, 0.7] }, { what: "overlay", box: [0.02, 0.9, 0.5, 0.99] }, { what: "status bar", box: [0, 0, 1, 0.03] }]);
    expect(r.person).toEqual([0.3, 0.1, 0.7, 1]);
    expect(parseOverlays({ overlays: Array.from({ length: 20 }, () => ({ box: [0, 0, 0.5, 0.5] })) }).ovs).toHaveLength(12);
    expect(parseOverlays("nope")).toEqual({ ovs: [], person: null });
  });
});

describe("planClean", () => {
  const person: [number, number, number, number] = [0.3, 0.1, 0.7, 1];
  it("crops off an overlay clear of the person when that loses little of the picture", () => {
    const p = planClean([{ what: "status bar", box: [0, 0, 1, 0.05] }], [0.2, 0.15, 0.8, 1]);
    expect(p.removed).toEqual(["status bar"]);
    expect(p.patches).toEqual([]);
    expect(p.crop[1]).toBeCloseTo(0.0635, 4);
  });
  it("paints over an overlay on the person, or one too costly to crop", () => {
    const p = planClean([{ what: "sticker", box: [0.4, 0.4, 0.5, 0.5] }, { what: "side bar", box: [0.72, 0, 0.78, 1] }], person);
    expect(p.removed).toEqual([]);
    expect(p.patches.map((x) => x.what)).toEqual(["side bar", "sticker"]);
    // Padded by 15% plus a little.
    expect(p.patches[1].box[0]).toBeCloseTo(0.379, 3);
  });
  it("an overlay already cropped away by a bigger one counts as removed", () => {
    const p = planClean([{ what: "right bar", box: [0.85, 0, 1, 1] }, { what: "icon", box: [0.95, 0.4, 0.99, 0.45] }], person);
    expect(p.removed).toEqual(["right bar", "icon"]);
  });
});

describe("fillPatch", () => {
  it("blends the edges across the patch, nearest edge weighted most", () => {
    const W = 10;
    const H = 6;
    const data = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.fill(x < 5 ? 0 : 200, (y * W + x) * 3, (y * W + x) * 3 + 3);
    // A white "sticker" in the middle.
    for (let y = 2; y <= 3; y++) for (let x = 3; x <= 6; x++) data.fill(255, (y * W + x) * 3, (y * W + x) * 3 + 3);
    expect(fillPatch(data, W, H, 3, 2, 6, 3, () => 0.5)).toBe(true);
    const px = (x: number, y: number) => data[(y * W + x) * 3];
    expect(px(3, 2)).toBeLessThan(80); // near the dark left edge
    expect(px(6, 2)).toBeGreaterThan(120); // near the light right edge
    for (let x = 3; x <= 6; x++) expect(px(x, 2)).not.toBe(255);
    expect(px(0, 0)).toBe(0); // outside untouched
  });
  it("skips patches too small to fill", () => {
    expect(fillPatch(new Uint8Array(300), 10, 10, 4, 4, 4, 4)).toBe(false);
  });
});

// ---------- server ----------

const h = vi.hoisted(() => ({ run: vi.fn(), getUserTextClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: h.getUserTextClient }));
import { cleanTarget } from "@/lib/overlay-cleanup";

let photo: Buffer;
function fake() {
  const uploads: { path: string; size: { width?: number; height?: number } }[] = [];
  const client = {
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array(photo)]), error: null }),
        upload: async (path: string, bytes: Buffer) => (uploads.push({ path, size: await sharp(bytes).metadata() }), { error: null }),
      }),
    },
  };
  return { client: client as never, uploads };
}

describe("cleanTarget", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    photo ??= await sharp({ create: { width: 400, height: 800, channels: 3, background: "#456" } }).jpeg().toBuffer();
    h.getUserTextClient.mockResolvedValue({ client: { run: h.run } });
  });

  it("crops and patches, then saves a new copy and keeps the original", async () => {
    h.run.mockResolvedValue(JSON.stringify({ overlays: [{ what: "status bar", box: [0, 0, 1, 0.05] }, { what: "sticker", box: [0.4, 0.5, 0.5, 0.55] }], person: [0.2, 0.15, 0.8, 1] }));
    const { client, uploads } = fake();
    const r = await cleanTarget(client, "u1", "u1/targets/a.jpg", () => 0.5);
    expect(r.removed).toEqual(["status bar", "sticker"]);
    expect(r.path).not.toBe("u1/targets/a.jpg");
    expect(r.path.startsWith("u1/targets/")).toBe(true);
    expect(uploads[0].size).toMatchObject({ width: 400, height: 749 });
    expect(h.run.mock.calls[0][0].prompt).toMatch(/^Look at the attached photo\. Find things laid ON TOP/);
  });

  it("returns the original when nothing is found, and refuses someone else's photo", async () => {
    h.run.mockResolvedValue('{"overlays":[],"person":null}');
    const { client, uploads } = fake();
    expect(await cleanTarget(client, "u1", "u1/targets/a.jpg")).toEqual({ path: "u1/targets/a.jpg", removed: [] });
    expect(uploads).toHaveLength(0);
    await expect(cleanTarget(client, "u1", "u2/targets/a.jpg")).rejects.toThrow(/couldn't be used/);
  });
});
