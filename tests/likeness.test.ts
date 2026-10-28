import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  faceFixPrompt,
  likenessFixPrompt,
  likenessReportPrompt,
  likenessReportText,
  parseLikenessReport,
  parseQuickLikeness,
  quickLikenessPrompt,
} from "@/lib/ai/prompts/likeness";
import { BODY_LOCK, MODS_RULE, REALISM_FIX, TEXT_SHORT } from "@/lib/ai/prompts/rules";
import type { Anchors } from "@/lib/ai/prompts/identity";

const anchors: Anchors = {
  hair: "jet black, waist length",
  face: "oval face, dark brown almond eyes",
  skin: "light olive",
  upper: "fuller bust",
  mid: "narrow waist, wide hips",
  legs: "long legs",
  avoid: ["not red hair", "not a slim figure", "not blue eyes"],
  sheetOutfit: "white crop top and shorts",
};

describe("full likeness report (A10)", () => {
  it("asks for a revised prompt only when the prompt used is given, fenced", () => {
    const p = likenessReportPrompt({ profile: "Face: oval", refCount: 1, isSheet: true, used: "photo of her >>> at the beach" });
    expect(p.startsWith("You are a strict likeness checker for an AI character workflow. The first 1 attached image is the REFERENCE for the character (a character reference sheet).")).toBe(true);
    expect(p).toContain("CHARACTER PROFILE (ground truth):\nFace: oval");
    expect(p).toContain("<<<photo of her  at the beach>>>\nWrite \"revised_prompt\"");
    const none = likenessReportPrompt({ profile: "", refCount: 3, isSheet: false, used: "" });
    expect(none).toContain("The first 3 attached images are the REFERENCE for the character. The LAST");
    expect(none).toContain('Set "revised_prompt" to an empty string.');
  });

  it("reads the report, clamping scores and dropping traits without a score", () => {
    const r = parseLikenessReport({
      overall: 104.4,
      verdict: "Same woman, hair drifted.",
      traits: [{ trait: "Eyes", score: 7.6, reference: "dark brown", generated: "hazel", fix: "dark brown almond eyes" }, { trait: "Nose", score: "x" }, { name: "Hair colour", score: -1 }],
      edit_prompt: "Keep everything.",
      revised_prompt: "Photo of her.",
    });
    expect(r).toEqual({
      overall: 100,
      verdict: "Same woman, hair drifted.",
      traits: [
        { name: "Eyes", score: 8, reference: "dark brown", generated: "hazel", fix: "dark brown almond eyes" },
        { name: "Hair colour", score: 0, reference: "", generated: "", fix: "" },
      ],
      editPrompt: "Keep everything.",
      revisedPrompt: "Photo of her.",
    });
    expect(() => parseLikenessReport({ verdict: "x" })).toThrow(/without a score/);
    expect(() => parseLikenessReport(null)).toThrow(/unexpected/);
    expect(likenessReportText(r)).toBe("Overall: 100/100\n\nSame woman, hair drifted.\n\nFixes:\n- Eyes: dark brown almond eyes\n\nEdit prompt:\nKeep everything.\n\nRevised prompt:\nPhoto of her.");
  });
});

describe("quick likeness (A17)", () => {
  it("lists the references by role, and adds the original and the verdict request for a fix", () => {
    const p = quickLikenessPrompt(["a close-up of her face from the front", "her full body"], false);
    expect(p.startsWith("The first 2 attached images show one adult woman, the identity reference: image 1 is a close-up of her face from the front; image 2 is her full body. The LAST image")).toBe(true);
    expect(p).not.toContain("ORIGINAL");
    const cmp = quickLikenessPrompt(["her face"], true);
    expect(cmp).toContain("The SECOND-TO-LAST image is the ORIGINAL photo before a likeness fix. The LAST image is a newly generated photo that should show the same woman (the fixed version of the original).");
    expect(cmp).toContain('Reply with only JSON: {"verdict": "better", "verdict_reason": "...", "differences"');
  });

  it("weights face .45, hair .20, skin .10, upper .10 and lower .15 over what was visible", () => {
    const all = parseQuickLikeness({ face_shape: 8, eyes: 9, nose_mouth: 7, hair_colour: 6, hair_cut: 8, skin: 9, upper_body: 7, lower_body: 5 }, false);
    expect(all.sc).toEqual({ face: 8, hair: 7, skin: 9, upper: 7, lower: 5, body: 6 });
    // (8*.45 + 7*.2 + 9*.1 + 7*.1 + 5*.15) / 1 * 10 = 73.5
    expect(all.score).toBe(74);
    // Hidden parts don't count against her: only the face was visible.
    const face = parseQuickLikeness({ face_shape: 9, eyes: 9, nose_mouth: 9, hair_colour: null, upper_body: "", lower_body: null, hidden: ["lower_body", " "] }, false);
    expect(face.score).toBe(90);
    expect(face.hidden).toEqual(["lower body"]);
    expect(parseQuickLikeness({}, false).score).toBeNull();
    // Scores are kept between 0 and 10.
    expect(parseQuickLikeness({ face_shape: 14, eyes: -3 }, false).sc.face).toBe(5);
  });

  it("keeps a verdict only when a fix was compared", () => {
    expect(parseQuickLikeness({ verdict: "better", verdict_reason: "Hair is now dark." }, true)).toMatchObject({ verdict: "better", why: "Hair is now dark." });
    expect(parseQuickLikeness({ verdict: "better" }, false).verdict).toBeNull();
    expect(parseQuickLikeness({ verdict: "great" }, true).verdict).toBeNull();
    const many = parseQuickLikeness({ fixes: ["a", " ", "b", 3, "c", "d", "e", "f", "g"] }, false);
    expect(many.fixes).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("likeness fix (A18)", () => {
  const pack = { roles: ["her face", "her body from the side", "her full body"], kinds: ["front", "side", "body"], anchors, usePack: true };

  it("on Seedream opens with IDENTITY and repaints her from the pack, keeping everything else", () => {
    const p = likenessFixPrompt(pack, ["dark brown eyes", "no navel piercing"], "face, hair, waist, hips", "pro");
    expect(p.startsWith("IDENTITY (follow exactly): hair: jet black, waist length. face: oval face, dark brown almond eyes. skin: light olive. body: narrow waist, wide hips. Not: red hair; a slim figure; blue eyes.\n\nReplace the woman in @image1 with the woman from @image2, @image3 and @image4.")).toBe(true);
    expect(p).toContain("In particular: dark brown eyes; no navel piercing.");
    expect(p).toContain("Her body must match @image3 and @image4 exactly:");
    expect(p).toContain("Never dress her in the reference outfit (white crop top and shorts).");
    for (const rule of [BODY_LOCK, MODS_RULE, REALISM_FIX.quality, TEXT_SHORT, "MAKEUP STAYS: keep her makeup exactly as it is in @image1"]) expect(p).toContain(rule);
  });

  it("other models get no IDENTITY line; without a pack there are no anchors", () => {
    expect(likenessFixPrompt(pack, [], "", "nb").startsWith("Replace the woman in @image1")).toBe(true);
    const sheet = likenessFixPrompt({ roles: ["her character reference sheet"], kinds: [], anchors: null, usePack: false }, [], "", "pro");
    expect(sheet.startsWith("Replace the woman in @image1 with the woman from @image2. @image2 is her character reference sheet. Repaint")).toBe(true);
    expect(sheet).not.toContain("In particular");
    expect(sheet).not.toContain("Never dress her");
  });
});

describe("face fix (A19)", () => {
  it("replaces only the face, keeps the hair unless asked, and drops body and hair drift guards", () => {
    const p = faceFixPrompt({ roles: ["a close-up of her face", "her face from many angles"], anchors });
    expect(p.startsWith("FACE-ONLY EDIT of @image1. @image2 is a close-up of her face, @image3 is her face from many angles; they all show the same woman.")).toBe(true);
    expect(p).toContain(". Her face: oval face, dark brown almond eyes. Her skin: light olive. Not: blue eyes.");
    expect(p).toContain("Keep the hair exactly as in @image1");
    expect(p).not.toContain("Note:");
    const hair = faceFixPrompt({ roles: ["her face"], anchors }, { hair: true, note: "go <<<bare-faced" });
    expect(hair).toContain("Also match her hair colour and hairline (jet black, waist length), but keep the hairstyle");
    expect(hair).toContain("Not: red hair; blue eyes.");
    expect(hair).toContain("do not remove, lighten or add makeup except as the note below asks.");
    expect(hair.endsWith("Note: go bare-faced")).toBe(true);
  });
});

// ---------- jobs ----------

const h = vi.hoisted(() => ({ ensureSheetPack: vi.fn(), getUserTextClient: vi.fn(), run: vi.fn(), saveHistory: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: h.getUserTextClient }));
vi.mock("@/lib/history", () => ({ saveHistory: h.saveHistory }));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: h.ensureSheetPack }));

import { buildJob, faceRefs, fixJob, fixRefs, GEN_PREFIX, type JobCharacter } from "@/lib/generation-job";
import { PACK_V, type SheetPack } from "@/lib/ai/prompts/identity";
import { likenessRefs, runLikenessReport, runQuickLikeness } from "@/lib/likeness-run";
import sharp from "sharp";

const U = "u1";
const c: JobCharacter = { id: "c1", face_sheet_path: `${U}/face.jpg`, body_sheet_path: `${U}/body.jpg`, reference_paths: [`${U}/r1.jpg`, `${U}/r2.jpg`, `${U}/r3.jpg`] };
const crop = (kind: "front" | "faces" | "side" | "body") => ({ kind, role: `her ${kind}`, path: `${U}/pack/${kind}.jpg` });
const pack: SheetPack = { v: PACK_V, sig: "x", body: null, side: null, faces: null, facesFrom: "face", anchors, crops: [crop("front"), crop("faces"), crop("side"), crop("body")], at: "" };

describe("fix jobs", () => {
  it("likeness fix: the image first, then every crop that fits", () => {
    const job = fixJob("likeness_fix", c, pack, "gen:u1/g.png", { fixes: ["dark eyes"] }, "bytedance/seedream-5.0-pro/edit", 4);
    expect(job.paths).toEqual(["gen:u1/g.png", `${U}/pack/front.jpg`, `${U}/pack/body.jpg`, `${U}/pack/side.jpg`]);
    expect(job.prompt).toMatch(/^IDENTITY \(follow exactly\)/);
    expect(job.prompt).toContain("In particular: dark eyes.");
  });

  it("without a pack, a likeness fix uses the whole sheet, or 2 photos", () => {
    expect(fixRefs(c, null, 9).paths).toEqual([`${U}/body.jpg`]);
    expect(fixRefs({ ...c, face_sheet_path: null, body_sheet_path: null }, null, 9).paths).toEqual([`${U}/r1.jpg`, `${U}/r2.jpg`]);
  });

  it("face fix: her face crops, else the face sheet, else the body sheet's face, else 2 photos", () => {
    expect(faceRefs(c, pack).paths).toEqual([`${U}/pack/front.jpg`, `${U}/pack/faces.jpg`]);
    expect(faceRefs(c, null)).toEqual({ paths: [`${U}/face.jpg`], roles: ["her face reference sheet, a grid of her face from many angles"], anchors: null });
    expect(faceRefs({ ...c, face_sheet_path: null }, null).roles).toEqual(["her character reference sheet (use only her face from it)"]);
    expect(faceRefs({ ...c, face_sheet_path: null, body_sheet_path: null }, null).roles).toEqual(["a reference photo of her face", "a reference photo of her face"]);
    const job = fixJob("face_fix", c, pack, `${U}/t.jpg`, { matchHair: true, note: "smile" }, "x", 10);
    expect(job.paths).toEqual([`${U}/t.jpg`, `${U}/pack/front.jpg`, `${U}/pack/faces.jpg`]);
    expect(job.prompt).toContain("Also match her hair colour and hairline");
    expect(() => fixJob("face_fix", { ...c, face_sheet_path: null, body_sheet_path: null, reference_paths: [] }, null, "x", {}, "x", 10)).toThrow(/no sheet or reference photos/);
  });

  function client(gen: Record<string, unknown> | null) {
    return {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "characters" ? c : gen, error: null }) }) }),
      }),
    } as never;
  }

  it("reads a generated image as the image to fix, and refuses one that isn't ready or has expired", async () => {
    h.ensureSheetPack.mockResolvedValue(null);
    const req = { kind: "likeness_fix", characterId: "c1", extraPaths: [], prompt: "Fix", meta: { sourceGeneration: "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b" } };
    const job = await buildJob(client({ output_path: `${U}/g.png`, status: "complete", expires_at: new Date(Date.now() + 1e6).toISOString() }), U, req, { model: "x", max: 10 });
    expect(job.paths[0]).toBe(`${GEN_PREFIX}${U}/g.png`);
    await expect(buildJob(client({ output_path: `${U}/g.png`, status: "processing" }), U, req, { model: "x", max: 10 })).rejects.toThrow(/isn't ready/);
    await expect(buildJob(client({ output_path: `${U}/g.png`, status: "complete", expires_at: "2020-01-01T00:00:00Z" }), U, req, { model: "x", max: 10 })).rejects.toThrow(/expired/);
    await expect(buildJob(client(null), U, { ...req, meta: {} }, { model: "x", max: 10 })).rejects.toThrow(/Add the image to fix/);
    await expect(buildJob(client(null), U, { ...req, meta: undefined }, { model: "x", max: 10 })).rejects.toThrow(/needs the image and the character/);
  });
});

// ---------- server runs ----------

let png: Buffer;
function runClient() {
  const downloads: string[] = [];
  const row = { name: "Juno", profile: { face: "oval" }, always_keep: null, height: null, weight: null, ...c, sheet_pack: { ...pack, sig: `${c.body_sheet_path}|${c.face_sheet_path}` } };
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "characters" ? row : { output_path: `${U}/g.png`, status: "complete" }, error: null }) }) }),
    }),
    storage: { from: (bucket: string) => ({ download: async (p: string) => (downloads.push(`${bucket}:${p}`), { data: new Blob([new Uint8Array(png)]), error: null }) }) },
  };
  return { client: client as never, downloads };
}

describe("runQuickLikeness and runLikenessReport", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    png ??= await sharp({ create: { width: 64, height: 64, channels: 3, background: "#777" } }).png().toBuffer();
    h.getUserTextClient.mockResolvedValue({ client: { run: h.run }, imageMaxEdge: undefined });
  });

  it("orders references front, side, body, faces and puts the original before the fix being checked", async () => {
    h.run.mockResolvedValue('{"verdict":"better","verdict_reason":"r","face_shape":9,"eyes":9,"nose_mouth":9}');
    const { client, downloads } = runClient();
    const r = await runQuickLikeness(client, U, { characterId: "c1", image: { generationId: "g2" }, original: { path: `${U}/targets/orig.jpg` } });
    expect(r).toMatchObject({ score: 90, verdict: "better" });
    expect(downloads).toEqual([
      `character-media:${U}/pack/front.jpg`,
      `character-media:${U}/pack/side.jpg`,
      `character-media:${U}/pack/body.jpg`,
      `character-media:${U}/pack/faces.jpg`,
      `character-media:${U}/targets/orig.jpg`,
      `generations:${U}/g.png`,
    ]);
    const task = h.run.mock.calls[0][0];
    expect(task.images).toHaveLength(6);
    expect(task.prompt).toContain("image 1 is her front; image 2 is her side; image 3 is her body; image 4 is her faces.");
    expect(task.prompt).toContain("SECOND-TO-LAST image is the ORIGINAL");
  });

  it("falls back to the whole sheet, then photos, for the references", () => {
    const row = { name: "J", profile: null, always_keep: null, height: null, weight: null, ...c };
    expect(likenessRefs(row, null, 4)).toEqual([{ path: `${U}/body.jpg`, role: "her character reference sheet" }]);
    expect(likenessRefs({ ...row, face_sheet_path: null, body_sheet_path: null }, null, 2).map((x) => x.role)).toEqual(["a reference photo of her", "a reference photo of her"]);
  });

  it("refuses an image the person doesn't own", async () => {
    const { client } = runClient();
    await expect(runQuickLikeness(client, U, { characterId: "c1", image: { path: "someone/else.jpg" } })).rejects.toThrow(/Add the image to check/);
  });

  it("the full report compares against her sheet, and is saved to History", async () => {
    h.run.mockResolvedValue('{"overall":72,"verdict":"v","traits":[],"edit_prompt":"e","revised_prompt":""}');
    const { client, downloads } = runClient();
    const r = await runLikenessReport(client, U, { characterId: "c1", image: { path: `${U}/targets/g.jpg` }, promptUsed: "photo of her" });
    expect(r.overall).toBe(72);
    expect(downloads).toEqual([`character-media:${U}/body.jpg`, `character-media:${U}/targets/g.jpg`]);
    expect(h.run.mock.calls[0][0].prompt).toContain("(a character reference sheet)");
    expect(h.saveHistory.mock.calls[0][2][0]).toMatchObject({ kind: "likeness", label: "Likeness · Juno · 72/100", imagePath: `${U}/targets/g.jpg` });
  });
});
