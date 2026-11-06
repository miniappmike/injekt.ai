import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ensureSheetPack: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn() }));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: h.ensureSheetPack }));

import { injectStandalone, runInjectStandalone } from "@/lib/inject-standalone";
import { standaloneRefs } from "@/lib/standalone";

const U = "u1";
const holly = { id: "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b", name: "Holly", face_sheet_path: `${U}/face.jpg`, body_sheet_path: `${U}/body.jpg`, reference_paths: [`${U}/r.jpg`] };
const anchors = { hair: "jet black waves", mid: "wide hips", avoid: ["not red hair"], sheetOutfit: "white shorts" };
const meta = { edit: "new pose: seated on the sofa arm", frame: "face, hair, hips", outfit: "black pinstripe shirt", chg: { pose: true, outfit: false, hair: false, who: "" } };

beforeEach(() => h.ensureSheetPack.mockResolvedValue({ anchors }));

describe("Inject Write only", () => {
  const refs = standaloneRefs(holly);

  it("with the target: the photo edit, target first then her sheets, changing only the EDIT line", () => {
    const p = injectStandalone(refs, anchors, "Photo of her on a red sofa.", meta, {});
    expect(p.attach).toEqual(["@image1: your target photo", "@image2: Holly's face sheet", "@image3: Holly's body sheet"]);
    expect(p.copy.startsWith("Replace the person in @image1 with the woman from @image2 and @image3. @image2 is her face reference sheet, @image3 is her body reference sheet;")).toBe(true);
    expect(p.copy).toContain("Her body comes only from @image3");
    expect(p.copy).toContain("(jet black waves)");
    expect(p.copy).toContain("Change: new pose: seated on the sofa arm.");
    expect(p.copy).toContain("Never dress her in the reference outfit (white shorts).");
    expect(p.attachItems[0]).toMatchObject({ source: "target", tag: "@image1" });
  });

  it("a cleaned target gets a link to save it; without the target, the written prompt from her sheets alone", () => {
    expect(injectStandalone(refs, anchors, "x", meta, { cleanedPath: `${U}/clean.jpg` }).attachItems[0]).toMatchObject({ label: "your target photo (cleaned copy)", path: `${U}/clean.jpg` });
    const p = injectStandalone(refs, anchors, "Photo of her on a red sofa, black pinstripe shirt.", meta, null);
    expect(p.attach).toEqual(["@image1: Holly's face sheet", "@image2: Holly's body sheet"]);
    expect(p.copy.startsWith("Use @image1 and @image2 as the strict identity reference.")).toBe(true);
    expect(p.copy).toContain("Photo of her on a red sofa, black pinstripe shirt.");
    expect(p.copy).toContain("beauty filter");
    expect(p.copy).toContain("Final identity check");
  });

  it("with only reference photos, her first photo is the reference; with nothing, it says so", () => {
    const photo = standaloneRefs({ ...holly, face_sheet_path: null, body_sheet_path: null });
    const p = injectStandalone(photo, null, "Photo of her.", meta, null);
    expect(p.attach).toEqual(["@image1: Holly's reference photo 1"]);
    expect(p.copy.startsWith("Use @image1 as the strict identity reference. @image1 is a reference photo of the person")).toBe(true);
    expect(() => injectStandalone([], null, "x", meta, null)).toThrow(/needs a reference/);
  });

  it("runs for a target's versions with links, and refuses someone else's photo", async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: holly, error: null }) }) }) }),
      storage: { from: () => ({ createSignedUrl: async (p: string, _t: number, o?: { download?: boolean }) => ({ data: { signedUrl: `${o?.download ? "dl" : "view"}:${p}` } }) }) },
    } as never;
    const out = await runInjectStandalone(client, U, { characterId: holly.id, targetPath: `${U}/t.jpg`, versions: [{ text: "a", meta }, { text: "b", meta }] });
    expect(out).toHaveLength(2);
    expect(out[0].attachItems[1]).toMatchObject({ url: `view:${U}/face.jpg`, downloadUrl: `dl:${U}/face.jpg` });
    expect(out[0].attachItems[0].url).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('"path"');
    await expect(runInjectStandalone(client, U, { characterId: holly.id, targetPath: "x/t.jpg", versions: [{ text: "a", meta }] })).rejects.toThrow(/couldn't be used/);
    await expect(runInjectStandalone(client, U, { characterId: holly.id, versions: [] })).rejects.toThrow(/couldn't be read/);
  });
});
