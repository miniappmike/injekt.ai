import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ensureSheetPack: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn() }));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: h.ensureSheetPack }));

import { injectStandalone, runInjectStandalone, swapStandalone } from "@/lib/inject-standalone";
import { standaloneRefs } from "@/lib/standalone";

const U = "u1";
const holly = { id: "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b", name: "Holly", face_sheet_path: `${U}/face.jpg`, body_sheet_path: `${U}/body.jpg`, reference_paths: [`${U}/r.jpg`] };
const anchors = { hair: "jet black waves", mid: "wide hips", avoid: ["not red hair"], sheetOutfit: "white shorts" };
const meta = { edit: "new pose: seated on the sofa arm", frame: "face, hair, hips", outfit: "black pinstripe shirt", chg: { pose: true, outfit: false, hair: false, who: "" } };

beforeEach(() => h.ensureSheetPack.mockResolvedValue({ anchors }));

describe("Inject Write only", () => {
  const refs = standaloneRefs(holly);

  it("with the target: the photo edit, her sheets first (face @image1, body @image2) then the target, changing only the EDIT line", () => {
    const p = injectStandalone(refs, anchors, "Photo of her on a red sofa.", meta, {});
    expect(p.attach).toEqual(["@image1: Holly's face sheet", "@image2: Holly's body sheet", "@image3: your target photo"]);
    expect(p.copy.startsWith("Replace the person in @image3 (target photo) with the exact face and hair of @image1 (face reference) and the entire body likeness")).toBe(true);
    expect(p.copy).toContain("Keep everything else in @image3 exactly:");
    expect(p.copy).toContain("Ignore the clothing and backgrounds in @image1 and @image2.");
    expect(p.copy).not.toMatch(/@image[4-9]/);
    expect(p.copy).not.toContain("Hair: jet black waves.");
    expect(p.copy).toContain("Change: new pose: seated on the sofa arm.");
    expect(p.attachItems[2]).toMatchObject({ source: "target", tag: "@image3" });
  });

  it("a cleaned target gets a link to save it; without the target, the written prompt from her sheets alone", () => {
    expect(injectStandalone(refs, anchors, "x", meta, { cleanedPath: `${U}/clean.jpg` }).attachItems[2]).toMatchObject({ label: "your target photo (cleaned copy)", path: `${U}/clean.jpg` });
    const p = injectStandalone(refs, anchors, "Photo of her on a red sofa, black pinstripe shirt.", meta, null);
    expect(p.attach).toEqual(["@image1: Holly's face sheet", "@image2: Holly's body sheet"]);
    // Each sheet's role first, then her fixed block in its own paragraph.
    expect(p.copy.startsWith("@image1 is her face reference sheet: take her exact face, hair and piercings.")).toBe(true);
    expect(p.copy).toContain("\n\nHER LOOK (fixed, the same in every image): Hair: jet black waves."); 
    expect(p.copy).toContain("Photo of her on a red sofa, black pinstripe shirt.");
    expect(p.copy).toContain("beauty filter");
    expect(p.copy).toContain("highest priority");
  });

  it("Direct swap as a prompt: her sheets first, the target photo last", () => {
    const p = swapStandalone(refs, anchors, { who: "on the left" });
    expect(p.attach).toEqual(["@image1: Holly's face sheet", "@image2: Holly's body sheet", "@image3: your target photo"]);
    expect(p.copy.startsWith("Replace the person on the left in @image3 with the woman from @image1 and @image2.")).toBe(true);
    expect(p.copy).toContain("@image3 is the photo to keep: its pose, expression, outfit,");
    expect(p.copy).not.toMatch(/@image[4-9]/);
    expect(() => swapStandalone([], null, {})).toThrow(/needs a reference/);
  });

  it("with only reference photos, her first photo is the reference; with nothing, it says so", () => {
    const photo = standaloneRefs({ ...holly, face_sheet_path: null, body_sheet_path: null });
    const p = injectStandalone(photo, null, "Photo of her.", meta, null);
    expect(p.attach).toEqual(["@image1: Holly's reference photo 1"]);
    expect(p.copy.startsWith("@image1 is a reference photo of her: take her exact face, hair, body proportions")).toBe(true);
    expect(() => injectStandalone([], null, "x", meta, null)).toThrow(/needs a reference/);
  });

  it("runs for a target's versions with links, and refuses someone else's photo", async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: holly, error: null }) }) }) }),
      storage: { from: () => ({ createSignedUrl: async (p: string, _t: number, o?: { download?: boolean }) => ({ data: { signedUrl: `${o?.download ? "dl" : "view"}:${p}` } }) }) },
    } as never;
    const out = await runInjectStandalone(client, U, { characterId: holly.id, targetPath: `${U}/t.jpg`, versions: [{ text: "a", meta }, { text: "b", meta }] });
    expect(out).toHaveLength(2);
    expect(out[0].attachItems[0]).toMatchObject({ url: `view:${U}/face.jpg`, downloadUrl: `dl:${U}/face.jpg` });
    expect(out[0].attachItems[2].url).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('"path"');
    await expect(runInjectStandalone(client, U, { characterId: holly.id, targetPath: "x/t.jpg", versions: [{ text: "a", meta }] })).rejects.toThrow(/couldn't be used/);
    await expect(runInjectStandalone(client, U, { characterId: holly.id, versions: [] })).rejects.toThrow(/couldn't be read/);
  });
});
