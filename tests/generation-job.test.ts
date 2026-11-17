import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ensureSheetPack: vi.fn(), getUserTextClient: vi.fn(), run: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: h.getUserTextClient, withDeclineFallback: async (_s: unknown, _u: unknown, _f: unknown, p: { client: unknown }, _r: unknown, work: (c: unknown) => unknown) => work(p.client) }));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: h.ensureSheetPack }));

import { buildJob, fitPrompt, injectJob, PROMPT_LIMIT, type JobCharacter } from "@/lib/generation-job";
import { PACK_V, QUALITY_SHADING_MATCH, type SheetPack } from "@/lib/ai/prompts/identity";
import { REALISM_FIX } from "@/lib/ai/prompts/rules";
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
  it("photo edit: the lean swap recipe, her two reference sheets first (never crops) and the target last", () => {
    const job = injectJob(c, pack, "LONG SCENE PROMPT", { target: TARGET, edit: "New pose: sitting", frame: "face, hair", chg: { pose: true } }, SEEDREAM, 4);
    expect(job.photoEdit).toBe(true);
    expect(job.paths).toEqual([`${U}/face.jpg`, `${U}/body.jpg`, TARGET]);
    expect(job.paths.some((p) => p.includes("/pack/"))).toBe(false);
    expect(job.prompt).toMatch(
      /^Replace the person in @image3 \(target photo\) with the exact face and hair of @image1 \(face reference\) and the entire body likeness \(chest, shoulders, waist, hips, glutes and legs\) of @image2 \(body reference\)\./,
    );
    expect(job.prompt).toContain("Keep everything else in @image3 exactly: outfit, hairstyle, background, light, camera angle, framing, image quality.");
    expect(job.prompt).toContain("Change: New pose: sitting.");
    expect(job.prompt).toContain("small blemishes and fine body hair");
    expect(job.prompt).not.toContain("HER LOOK");
    expect(job.prompt).not.toContain("LONG SCENE PROMPT");
    expect(job.prompt.length).toBeLessThan(700);
  });

  it("a swap brief adds the camera and the pose in the writer's words, and can't be recreated without the target", () => {
    const meta = { brief: true, camera: "Phone at chest height, straight on, tilted slightly up; main lens; frame cuts at mid-thigh", pose: "Standing, chest to the camera, weight on the leg on the left of the frame." };
    const job = injectJob(c, pack, "ignored", { ...meta, target: TARGET }, SEEDREAM, 4);
    expect(job.prompt).toContain("Keep everything else in @image3 exactly: pose, outfit, hairstyle,");
    expect(job.prompt).toContain("\n\nCamera: Phone at chest height, straight on, tilted slightly up; main lens; frame cuts at mid-thigh.\n\nPose: Standing, chest to the camera, weight on the leg on the left of the frame.\n\n");
    expect(job.prompt.length).toBeLessThan(900);
    expect(() => injectJob(c, pack, "ignored", meta, SEEDREAM, 4)).toThrow(/Swap into photo/);
  });

  it("a photo edit with only one sheet sends that sheet", () => {
    const job = injectJob({ ...c, face_sheet_path: null }, null, "scene", { target: TARGET }, SEEDREAM, 10);
    expect(job.paths).toEqual([`${U}/body.jpg`, TARGET]);
    expect(job.prompt).toMatch(/^Replace the person in @image2 \(target photo\) with the exact face, hair and entire body likeness \(.*\) of the woman in @image1\./);
  });

  it("text + refs: her two sheets, framed for the configured model, with her look in words from the pack", () => {
    const job = injectJob(c, pack, "Photo of her on a balcony.", { frame: "", outfit: "a red dress" }, SEEDREAM, 10);
    expect(job.photoEdit).toBe(false);
    expect(job.paths).toEqual([`${U}/face.jpg`, `${U}/body.jpg`]);
    expect(job.prompt).toMatch(/^@image1 is her face reference sheet, a grid of her face from many angles: take her exact face, hair and piercings\. @image2 is her full-body reference sheet/);
    expect(job.prompt).toContain("\n\nHER LOOK (fixed, the same in every image): Hair: jet black. Build: wide hips.\n\n");
    expect(job.prompt).toContain("She wears only a red dress. Take only the person from @image1 and @image2, never their grid, plain background, studio light or plain outfit (white shorts).");
    expect(job.prompt).toContain("Her identity from the references is the highest priority");
    // One framing for every image model.
    expect(injectJob(c, pack, "Photo.", {}, "google/nano-banana-2.1/edit", 10).prompt).toBe(injectJob(c, pack, "Photo.", {}, SEEDREAM, 10).prompt);
  });

  it("without sheets falls back to up to 3 reference photos", () => {
    expect(injectJob(c, null, "Photo.", {}, SEEDREAM, 10)).toMatchObject({ paths: [`${U}/face.jpg`, `${U}/body.jpg`], photoEdit: false });
    const photos = injectJob({ ...c, face_sheet_path: null, body_sheet_path: null }, null, "Photo.", { clean: true }, SEEDREAM, 10);
    expect(photos.paths).toEqual(c.reference_paths);
    expect(photos.prompt).toMatch(/^@image1 is a reference photo of her: take her exact face.*@image3 is a reference photo of her/);
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
    expect(job.paths).toEqual([`${U}/face.jpg`, `${U}/body.jpg`, TARGET]);
  });

  it("never pays to read a sheet for a price check", async () => {
    const job = await buildJob(userClient(), U, { kind: "inject", characterId: "c1", extraPaths: [], prompt: "Photo.", meta: {} }, { model: SEEDREAM, max: 10, forQuote: true });
    expect(h.ensureSheetPack).not.toHaveBeenCalled();
    expect(job.paths).toEqual([`${U}/face.jpg`, `${U}/body.jpg`]);
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

describe("Director", () => {
  const ask = (opts: { forQuote?: boolean } = {}, row: Partial<JobCharacter> = c) =>
    buildJob(userClient(row), U, { kind: "inject", characterId: "c1", extraPaths: [], prompt: "Her on a balcony at sunset in a red dress.", meta: { direct: true } } as never, { model: SEEDREAM, max: 10, ...opts });

  it("writes the scene from the direction, then sends her face sheet as @image1 and body sheet as @image2 with her identity first", async () => {
    h.ensureSheetPack.mockResolvedValue(pack);
    h.run.mockResolvedValue("===VERSION 1===\nIN FRAME: face, hair, waist, hips, legs\nOUTFIT: a red satin slip dress\nPhoto of a woman on a balcony at sunset in a red satin slip dress.");
    const job = await ask();
    expect(h.getUserTextClient).toHaveBeenCalledWith(expect.anything(), U, "llm", "prompt");
    expect(h.run.mock.calls[0][0].prompt).toContain("<<<Her on a balcony at sunset in a red dress.>>>");
    expect(job.paths).toEqual([`${U}/face.jpg`, `${U}/body.jpg`]);
    expect(job.prompt).toContain("@image1 is her face reference sheet");
    expect(job.prompt).toContain("@image2 is her full-body reference sheet");
    expect(job.prompt).toContain("Her identity from the references is the highest priority");
    expect(job.prompt).toContain("Photo of a woman on a balcony at sunset in a red satin slip dress.");
    expect(job.prompt).toContain("She wears only a red satin slip dress.");
    // With a read sheet her look is the app's fixed block, so the writer is told to leave it out.
    expect(h.run.mock.calls[0][0].prompt).toContain("HER LOOK IS FIXED TEXT");
    expect(h.run.mock.calls[0][0].prompt).toContain("- DEPTH: give the image real depth");
    expect(job.prompt).not.toContain("IN FRAME");
  });

  it("realism off leaves a fantastical scene as written, with no photo-realism lines added", async () => {
    h.ensureSheetPack.mockResolvedValue(pack);
    h.run.mockResolvedValue("===VERSION 1===\nIN FRAME: face, hair, arms\nOUTFIT: a flowing violet wizard robe\nShe flies on a red dragon above the clouds in a flowing violet wizard robe, no garbled lettering.");
    const job = await buildJob(userClient(), U, { kind: "inject", characterId: "c1", extraPaths: [], prompt: "Her flying on a dragon in a wizard robe", meta: { direct: true, real: false } } as never, { model: SEEDREAM, max: 10 });
    const task = h.run.mock.calls[0][0].prompt;
    expect(task).toContain("STYLE (Inject realism is off)");
    expect(task).not.toContain("REALISM (Inject realism is on)");
    expect(job.prompt).toContain("She flies on a red dragon above the clouds");
    expect(job.prompt).not.toContain(REALISM_FIX.quality);
    expect(job.prompt).not.toContain(REALISM_FIX.skin);
    expect(job.prompt).not.toContain(QUALITY_SHADING_MATCH);
    expect(job.prompt).toContain("highest priority");
    expect(job.prompt).toContain("@image2 is her full-body reference sheet");
  });

  it("realism on (the default) asks for real skin, light and depth, and keeps what was asked for", async () => {
    h.ensureSheetPack.mockResolvedValue(pack);
    h.run.mockResolvedValue("===VERSION 1===\nIN FRAME: face\nOUTFIT: a robe\nShe rides a dragon.");
    const job = await ask();
    const task = h.run.mock.calls[0][0].prompt;
    expect(task).toContain("REALISM (Inject realism is on)");
    expect(task).toContain("Keep everything the direction asks for, fantastical or not");
    expect(job.prompt).toContain(QUALITY_SHADING_MATCH);
    expect(job.prompt).toContain(REALISM_FIX.quality);
  });

  it("needs both sheets, and a price check never writes the prompt", async () => {
    await expect(ask({}, { ...c, body_sheet_path: null })).rejects.toThrow(/face sheet and body sheet/);
    const quote = await ask({ forQuote: true });
    expect(h.run).not.toHaveBeenCalled();
    expect(quote.paths).toEqual([`${U}/face.jpg`, `${U}/body.jpg`]);
  });
});

describe("buildJob for Inject", () => {
  it("shortens only the scene when the framed prompt is too long, keeping both sheets and her identity whole", async () => {
    h.ensureSheetPack.mockResolvedValue(pack);
    h.run.mockResolvedValue("Photo of her on a balcony, shortened.");
    const long = "Photo of her on a balcony. " + "Soft light on the railing. ".repeat(200);
    const job = await buildJob(userClient(), U, { kind: "inject", characterId: "c1", prompt: long, extraPaths: [], meta: {} } as never, { model: SEEDREAM, max: 10 });
    expect(h.run.mock.calls[0][0].prompt).toMatch(/^Shorten this image prompt's scene description/);
    expect(job.prompt.length).toBeLessThanOrEqual(PROMPT_LIMIT);
    expect(job.prompt).toContain("Photo of her on a balcony, shortened.");
    expect(job.prompt).toContain("@image2 is her full-body reference sheet");
    expect(job.prompt).toContain("highest priority");
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
