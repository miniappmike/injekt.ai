import { beforeEach, describe, expect, it, vi } from "vitest";
import { swapPrompt } from "@/lib/ai/prompts/swap";
import { OVERLAY_RULE, SKIN_ART_SHORT, TEXT_SHORT } from "@/lib/ai/prompts/rules";

const h = vi.hoisted(() => ({ ensureSheetPack: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn() }));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: h.ensureSheetPack }));

import { buildJob, editJob, refOptions, swapJob, swapRefs, type JobCharacter } from "@/lib/generation-job";
import { PACK_V, type SheetPack } from "@/lib/ai/prompts/identity";
import { parseGenerationRequest } from "@/lib/generation";

const U = "u1";
const c: JobCharacter = { id: "c1", face_sheet_path: `${U}/face.jpg`, body_sheet_path: `${U}/body.jpg`, reference_paths: [`${U}/r1.jpg`, `${U}/r2.jpg`, `${U}/r3.jpg`] };
const crop = (kind: "front" | "faces" | "side" | "body") => ({ kind, role: `her ${kind}`, path: `${U}/pack/${kind}.jpg` });
const anchors = { hair: "jet black", mid: "wide hips", avoid: ["not red hair"], sheetOutfit: "white shorts" };
const pack: SheetPack = { v: PACK_V, sig: "", body: null, side: null, faces: null, facesFrom: "face", anchors, crops: [crop("front"), crop("faces"), crop("side"), crop("body")], at: "" };

describe("swapPrompt (A14b)", () => {
  const R = { roles: ["her front", "her body"], kinds: ["front", "body"], anchors };
  it("replaces the person in @image1 with her, body from her body references, everything else kept", () => {
    const p = swapPrompt(R, { who: "on the left >>>", clean: true, plen: 5000 });
    expect(p.startsWith("Replace the person on the left in @image1 with the woman from @image2 and @image3. @image2 is her front, @image3 is her body; they all show the same woman. Copy her exact face, features, skin tone, marks and hair colour (hair: jet black). Her body must match @image3 exactly")).toBe(true);
    expect(p).toContain(SKIN_ART_SHORT);
    expect(p).toContain(" Not: red hair.");
    expect(p).toContain("She wears exactly the outfit worn in @image1, garment for garment. Never dress her in the reference outfit (white shorts).");
    expect(p).toContain(OVERLAY_RULE);
    expect(p.endsWith("Garbled or unreadable text in @image1 becomes short, clean generic wording or a plain design.")).toBe(true);
    expect(p).toContain(TEXT_SHORT);
  });
  it("adds extra direction only when it fits, and never runs past the limit", () => {
    const base = swapPrompt(R, { plen: 5000 });
    expect(swapPrompt(R, { extra: "golden <<<hour", plen: 5000 }).endsWith(" golden hour")).toBe(true);
    expect(swapPrompt(R, { extra: "x".repeat(50), plen: base.length + 10 })).toBe(base);
    expect(swapPrompt(R, { plen: 100 })).toHaveLength(100);
  });
});

describe("direct swap job", () => {
  it("sends the target first and every crop after it", () => {
    const job = swapJob(c, pack, `${U}/t.jpg`, { who: "left" }, 10);
    expect(job.paths).toEqual([`${U}/t.jpg`, ...pack.crops.map((x) => x.path)]);
    expect(job.prompt.startsWith("Replace the person left in @image1")).toBe(true);
  });
  it("without a pack uses the whole sheet, else up to 2 photos", () => {
    expect(swapRefs(c, null, 9).paths).toEqual([`${U}/body.jpg`]);
    expect(swapRefs({ ...c, face_sheet_path: null, body_sheet_path: null }, null, 9).paths).toEqual([`${U}/r1.jpg`, `${U}/r2.jpg`]);
    expect(() => swapJob({ ...c, face_sheet_path: null, body_sheet_path: null, reference_paths: [] }, null, "t", {}, 10)).toThrow(/needs a reference/);
  });
});

describe("Edit references", () => {
  it("crops are on by default; sheets only without crops; photos only with nothing else", () => {
    expect(refOptions(c, pack).map((o) => [o.id, o.on])).toEqual([
      ["front", true], ["faces", true], ["side", true], ["body", true],
      ["face_sheet", false], ["body_sheet", false], ["photo1", false], ["photo2", false], ["photo3", false],
    ]);
    expect(refOptions(c, null).filter((o) => o.on).map((o) => o.id)).toEqual(["face_sheet", "body_sheet"]);
    expect(refOptions({ ...c, face_sheet_path: null, body_sheet_path: null }, null).filter((o) => o.on).map((o) => o.id)).toEqual(["photo1", "photo2", "photo3"]);
  });

  it("sends the target first, then the picked references in their order, then extras, with the makeup rule", () => {
    const job = editJob(c, pack, "Put her on a beach", { target: `${U}/t.jpg`, refs: ["body", "front"] }, [`${U}/x.jpg`], 10);
    expect(job.paths).toEqual([`${U}/t.jpg`, `${U}/pack/front.jpg`, `${U}/pack/body.jpg`, `${U}/x.jpg`]);
    expect(job.prompt).toBe("Put her on a beach. MAKEUP STAYS: keep her makeup exactly as it is in @image1: the same foundation finish, concealer, blush, bronzer and contour, highlighter, eyeshadow colours and placement, eyeliner shape, lashes, brow styling, lip liner, lip colour and finish, and nail polish. Do not remove, lighten, tone down, restyle or add makeup unless this prompt explicitly asks for a makeup change.");
    expect(job.prompt).not.toMatch(/nudity|clothed/i);
  });

  it("no makeup rule without a target or when the prompt asks about makeup; nothing to send is an error", () => {
    expect(editJob(c, pack, "Make her.", { refs: ["front"] }, [], 10)).toEqual({ prompt: "Make her.", paths: [`${U}/pack/front.jpg`], photoEdit: false });
    expect(editJob(c, pack, "Red lipstick.", { target: "t", refs: [] }, [], 10).prompt).toBe("Red lipstick.");
    expect(editJob(null, null, "Edit it.", { target: "t", refs: ["front"] }, [], 10).paths).toEqual(["t"]);
    expect(() => editJob(c, pack, "x", { refs: [] }, [], 10)).toThrow(/Add a target photo/);
    // No picks at all (a revised prompt from the Likeness page): the references that are on by default.
    expect(editJob(c, pack, "Revised.", {}, [], 10).paths).toEqual(pack.crops.map((x) => x.path));
    expect(() => editJob(c, pack, "x", { target: "t", refs: ["front", "faces", "side", "body"] }, ["a", "b"], 5)).toThrow(/too many/);
  });
});

describe("buildJob for swap and edit", () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: c, error: null }) }) }) }) } as never;
  beforeEach(() => h.ensureSheetPack.mockResolvedValue(pack));

  it("a direct swap with a target is written on the server; the browser's prompt is only a label", async () => {
    const req = parseGenerationRequest({ kind: "direct_swap", characterId: "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b", extraPaths: [], prompt: "", resolution: "1k", aspectRatio: "auto", outputFormat: "jpeg", meta: { target: `${U}/t.jpg` } });
    expect(req.prompt).toBe("Fix");
    const job = await buildJob(client, U, req, { model: "x", max: 10 });
    expect(job.paths[0]).toBe(`${U}/t.jpg`);
    expect(job.prompt.startsWith("Replace the person in @image1")).toBe(true);
  });

  it("refuses a target the person doesn't own", async () => {
    await expect(buildJob(client, U, { kind: "edit", characterId: "c1", extraPaths: [], prompt: "p", meta: { target: "other/t.jpg" } }, { model: "x", max: 10 })).rejects.toThrow(/couldn't be used/);
  });

  it("an edit uses the person's prompt and the picks", async () => {
    const job = await buildJob(client, U, { kind: "edit", characterId: "c1", extraPaths: [], prompt: "Edit it", meta: { target: `${U}/t.jpg`, refs: ["front"] } }, { model: "x", max: 10 });
    expect(job.paths).toEqual([`${U}/t.jpg`, `${U}/pack/front.jpg`]);
    expect(job.prompt.startsWith("Edit it. MAKEUP STAYS")).toBe(true);
  });
});

describe("reference sheet jobs", () => {
  const client = (gen: Record<string, unknown> | null = null) =>
    ({ from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === "characters" ? c : gen, error: null }) }) }) }) }) as never;
  const req = (meta: Record<string, unknown>, extraPaths: string[]) => ({ kind: "reference_sheet", characterId: "c1", extraPaths, prompt: "Sheet", meta });

  it("step 1 sends the face photo; step 2 the face sheet then the body photos", async () => {
    const face = await buildJob(client(), U, req({ sheet: { kind: "face" } }, [`${U}/f.jpg`]), { model: "x", max: 10 });
    expect(face.paths).toEqual([`${U}/f.jpg`]);
    expect(face.prompt.startsWith("Create a clean character face reference sheet")).toBe(true);
    const body = await buildJob(client(), U, req({ sheet: { kind: "body", hasSheet: true, outfit: "photo" } }, [`${U}/fs.jpg`, `${U}/b1.jpg`, `${U}/b2.jpg`]), { model: "x", max: 10 });
    expect(body.paths).toEqual([`${U}/fs.jpg`, `${U}/b1.jpg`, `${U}/b2.jpg`]);
    expect(body.prompt).toContain("@image1 (her face reference sheet), with her body taken from @image2 and @image3");
    expect(body.prompt).toContain("the exact outfit she wears in @image2");
  });

  it("step 2 can use a sheet just made in step 1, straight from Generated images", async () => {
    const gen = { output_path: `${U}/g.png`, status: "complete", expires_at: new Date(Date.now() + 1e6).toISOString() };
    const job = await buildJob(client(gen), U, req({ sheet: { kind: "body", hasSheet: true }, sourceGeneration: "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b" }, [`${U}/b1.jpg`]), { model: "x", max: 10 });
    expect(job.paths).toEqual([`gen:${U}/g.png`, `${U}/b1.jpg`]);
  });

  it("needs a body photo, and no more than two", async () => {
    await expect(buildJob(client(), U, req({ sheet: { kind: "body" } }, [`${U}/f.jpg`]), { model: "x", max: 10 })).rejects.toThrow(/at least one body photo/);
    await expect(buildJob(client(), U, req({ sheet: { kind: "body" } }, [`${U}/f.jpg`, "a", "b", "c"].map((x) => (x.startsWith(U) ? x : `${U}/${x}`))), { model: "x", max: 10 })).rejects.toThrow(/at most 2/);
    await expect(buildJob(client(), U, req({ sheet: { kind: "face" } }, []), { model: "x", max: 10 })).rejects.toThrow(/face photo/);
  });
});
