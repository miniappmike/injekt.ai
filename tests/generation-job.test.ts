import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ensureSheetPack: vi.fn(), getUserTextClient: vi.fn(), run: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: h.getUserTextClient }));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: h.ensureSheetPack }));

import { buildJob, fitPrompt, injectJob, PROMPT_LIMIT, type JobCharacter } from "@/lib/generation-job";
import { PACK_V, type SheetPack } from "@/lib/ai/prompts/identity";
import { UserFacingError } from "@/lib/errors";

const U = "u1";
const c: JobCharacter = {
  id: "c1",
  face_sheet_path: `${U}/face.jpg`,
  body_sheet_path: `${U}/body.jpg`,
  reference_paths: [`${U}/r1.jpg`, `${U}/r2.jpg`, `${U}/r3.jpg`],
};
const crop = (kind: "front" | "faces" | "side" | "body") => ({ kind, role: `her ${kind}`, path: `${U}/pack/${kind}.jpg` });
const pack: SheetPack = {
  v: PACK_V,
  sig: "x",
  body: [0, 0, 1, 1],
  side: [0, 0, 1, 1],
  faces: { box: [0, 0, 1, 1], rows: 2, cols: 2, front: [0, 0] },
  facesFrom: "face",
  anchors: { hair: "jet black", mid: "wide hips", sheetOutfit: "white shorts" },
  crops: [crop("front"), crop("faces"), crop("side"), crop("body")],
  at: "2026-10-28T00:00:00Z",
};
const SEEDREAM = "bytedance/seedream-5.0-pro/edit";
const TARGET = `${U}/targets/t.jpg`;

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserTextClient.mockResolvedValue({ client: { run: h.run } });
});

describe("injectJob", () => {
  it("photo edit: the target first, then her pack crops, with only the EDIT line as the change", () => {
    const job = injectJob(c, pack, "LONG SCENE PROMPT", { target: TARGET, edit: "New pose: sitting", frame: "face, hair", chg: { pose: true } }, SEEDREAM, 4);
    expect(job.photoEdit).toBe(true);
    // A model taking 4 images keeps the target plus the 3 most useful crops.
    expect(job.paths).toEqual([TARGET, `${U}/pack/front.jpg`, `${U}/pack/body.jpg`, `${U}/pack/side.jpg`]);
    expect(job.prompt).toMatch(/^Replace the person in @image1 with the woman from @image2, @image3 and @image4\./);
    expect(job.prompt).toContain("Change: New pose: sitting.");
    expect(job.prompt).not.toContain("LONG SCENE PROMPT");
  });

  it("photo edit without a pack sends the whole sheet", () => {
    const job = injectJob(c, null, "scene", { target: TARGET }, SEEDREAM, 10);
    expect(job.paths).toEqual([TARGET, `${U}/body.jpg`]);
    expect(job.prompt).toContain("@image2 is her character reference sheet.");
  });

  it("text + refs: her crops only, framed for the configured model", () => {
    const job = injectJob(c, pack, "Photo of her on a balcony.", { frame: "" , outfit: "a red dress" }, SEEDREAM, 10);
    expect(job.photoEdit).toBe(false);
    expect(job.paths).toEqual(pack.crops.map((x) => x.path));
    expect(job.prompt).toMatch(/^IDENTITY \(follow exactly/);
    expect(job.prompt).toContain("She wears a red dress, exactly as described in this prompt. Never dress her in the reference outfit (white shorts).");
    expect(injectJob(c, pack, "Photo.", {}, "google/nano-banana-2.1/edit", 10).prompt).toMatch(/^The woman in this photo is the woman in the reference images/);
  });

  it("without a pack falls back to the whole sheet, or to up to 3 reference photos", () => {
    expect(injectJob(c, null, "Photo.", {}, SEEDREAM, 10)).toMatchObject({ paths: [`${U}/body.jpg`], photoEdit: false });
    const photos = injectJob({ ...c, face_sheet_path: null, body_sheet_path: null }, null, "Photo.", { clean: true }, SEEDREAM, 10);
    expect(photos.paths).toEqual(c.reference_paths);
    expect(photos.prompt).toMatch(/^Use @image1, @image2 and @image3 as the strict identity reference\. They are reference photos/);
    expect(photos.prompt).toContain("no app interface elements");
    expect(() => injectJob({ ...c, face_sheet_path: null, body_sheet_path: null, reference_paths: [] }, null, "Photo.", {}, SEEDREAM, 10)).toThrow(UserFacingError);
  });
});

function userClient(row: Partial<JobCharacter> | null = c) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) } as never;
}

describe("buildJob", () => {
  it("frames Inject prompts that carry meta, reading the sheet pack first", async () => {
    h.ensureSheetPack.mockResolvedValue(pack);
    const job = await buildJob(userClient(), U, { kind: "inject", characterId: "c1", extraPaths: [], prompt: "Photo.", meta: { target: TARGET, edit: "none" } }, { model: SEEDREAM, max: 10 });
    expect(h.ensureSheetPack).toHaveBeenCalledTimes(1);
    expect(job.paths[0]).toBe(TARGET);
  });

  it("never pays to read a sheet for a price check", async () => {
    const job = await buildJob(userClient(), U, { kind: "inject", characterId: "c1", extraPaths: [], prompt: "Photo.", meta: {} }, { model: SEEDREAM, max: 10, forQuote: true });
    expect(h.ensureSheetPack).not.toHaveBeenCalled();
    expect(job.paths).toEqual([`${U}/body.jpg`]);
  });

  it("sends other prompts as written: her references, then the extra pictures", async () => {
    const job = await buildJob(userClient(), U, { kind: "edit", characterId: "c1", extraPaths: [`${U}/x.jpg`], prompt: "Edit." }, { model: SEEDREAM, max: 10 });
    expect(job).toEqual({ prompt: "Edit.", paths: [`${U}/face.jpg`, `${U}/body.jpg`, ...c.reference_paths, `${U}/x.jpg`], photoEdit: false });
    const sheet = await buildJob(userClient(), U, { kind: "reference_sheet", characterId: "c1", extraPaths: [`${U}/x.jpg`], prompt: "Sheet." }, { model: SEEDREAM, max: 10 });
    expect(sheet.paths).toEqual([`${U}/x.jpg`]);
  });

  it("refuses someone else's images and a missing character", async () => {
    await expect(buildJob(userClient(), U, { kind: "inject", characterId: "c1", extraPaths: [], prompt: "p", meta: { target: "other/t.jpg" } }, { model: SEEDREAM, max: 10 })).rejects.toThrow(/couldn't be used/);
    await expect(buildJob(userClient(), U, { kind: "edit", extraPaths: ["../u1/x.jpg"], prompt: "p" }, { model: SEEDREAM, max: 10 })).rejects.toThrow(/couldn't be used/);
    await expect(buildJob(userClient(null), U, { kind: "edit", characterId: "c1", extraPaths: [], prompt: "p" }, { model: SEEDREAM, max: 10 })).rejects.toThrow(/Character not found/);
  });
});

describe("fitPrompt", () => {
  it("points tags at images that are sent and leaves short prompts alone", async () => {
    expect(await fitPrompt(userClient(), U, "@image1 and @image4", 2)).toBe("@image1 and @image1");
    expect(h.getUserTextClient).not.toHaveBeenCalled();
  });

  it("has the person's text model condense a long prompt, keeping its tags", async () => {
    h.run.mockResolvedValue("Short version with @image2 and @image9.");
    const out = await fitPrompt(userClient(), U, "@image2 " + "x".repeat(PROMPT_LIMIT), 3);
    expect(h.getUserTextClient).toHaveBeenCalledWith(expect.anything(), U, "llm", "condense");
    expect(h.run.mock.calls[0][0].prompt).toMatch(/^Rewrite this image-edit prompt in at most 4960 characters\./);
    expect(out).toBe("Short version with @image2 and @image1.");
  });

  it("cuts to length when it can't be condensed, and never condenses for a price check", async () => {
    h.getUserTextClient.mockRejectedValue(new Error("no key"));
    const long = "y".repeat(PROMPT_LIMIT + 50);
    expect(await fitPrompt(userClient(), U, long, 1)).toHaveLength(PROMPT_LIMIT);
    h.getUserTextClient.mockClear();
    expect(await fitPrompt(userClient(), U, long, 1, { forQuote: true })).toHaveLength(PROMPT_LIMIT);
    expect(h.getUserTextClient).not.toHaveBeenCalled();
  });
});
