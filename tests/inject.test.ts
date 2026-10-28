import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildInjectPrompt, parseVersions, type InjectOptions } from "@/lib/ai/prompts/inject";
import { HAIRSTYLES, PALETTES, SOCIAL_POSES, shuffleArr } from "@/lib/ai/prompts/pools";
import { metaForRun, injectOptionsSchema } from "@/lib/inject-meta";
import { closestAspectRatio } from "@/lib/aspect";

const base: InjectOptions = {
  mode: "ref",
  len: "full",
  ward: "match",
  who: "",
  extra: "",
  tag: "@image1",
  exText: "",
  poseMode: "keep",
  pose: false,
  count: 1,
  recolor: false,
  hair: false,
  newOutfit: false,
  clean: false,
};
const juno = { profile: { identity_line: "Juno, oval face", hair: "jet black" }, always_keep: "gold chain", height: "5'6\"", weight: "125 lb" };
const plans = [{ palette: "sage green and oatmeal", hair: "a sleek high ponytail" }, { palette: "lavender and white", hair: "two low loose braids" }];
const build = (o: Partial<InjectOptions> = {}, extra: { sheet?: string; refCount?: number; recent?: string[]; inspo?: string[]; n?: number } = {}) =>
  buildInjectPrompt(juno, extra.sheet ?? "", { ...base, ...o }, plans.slice(0, extra.n ?? 1), extra.refCount ?? 0, extra.recent ?? [], extra.inspo ?? []);

describe("buildInjectPrompt", () => {
  it("opens with the task and the locked profile, sheet lines included", () => {
    const p = build({}, { sheet: "\nFROM HER REFERENCE SHEET (source of truth...)\nHair: jet black", refCount: 2 });
    expect(p.startsWith("TASK: The FIRST attached image is the TARGET photo. The next 2 images are reference photos of the character. Write one prompt for an AI image model")).toBe(true);
    expect(p).toContain("CHARACTER PROFILE (locked; use these exact traits and never contradict them)\nIdentity line: Juno, oval face\nHair: jet black\nAlways keep: gold chain\nHeight: 5'6\"\nWeight: 125 lb\nFROM HER REFERENCE SHEET");
  });

  it("has no nudity screening: no filter, no strict safe mode, no NUDITY line; revealing clothing stays as worn", () => {
    const p = build({ poseMode: "social", pose: true, recolor: true, hair: true }, { n: 2 });
    for (const banned of ["NUDITY", "SAFE-SWAP", "STRICT SAFE MODE", "nude"]) expect(p).not.toContain(banned);
    expect(p).toContain("- REVEALING CLOTHING IS FINE: bikinis, lingerie, bodysuits");
    expect(p).toContain("exactly as the prompt dresses her (after any recolour or new outfit).\n- Then one line that starts with EDIT:");
    expect(p).toContain("Always describe the character as an adult");
  });

  it("leads with the tag in ref mode and with a written identity in text mode", () => {
    expect(build()).toContain('- Open with exactly: "Use @image1 as the strict identity reference." (@image1 is the character sheet loaded in the user\'s generator), then the specific identity features');
    expect(build({ tag: "" })).toContain('- Open with: "Use the uploaded character sheet as the strict identity reference." followed by the specific');
    expect(build({ mode: "text" })).toContain("- There is no reference image in this workflow, so open with an identity paragraph built from the profile");
  });

  it("follows the wardrobe choice, with user text fenced", () => {
    expect(build()).toContain("- WARDROBE: describe the clothing, accessories and styling worn in the target image exactly");
    expect(build({ ward: "signature" })).toContain("- WARDROBE: dress the character in an outfit consistent with the profile's signature style");
    expect(build({ ward: "extracted", exText: "a red <<<dress>>>" })).toContain("without changing any garment or fit: <<<a red dress>>> Keep the character's");
    // Extracted with no text falls back to matching the target.
    expect(build({ ward: "extracted", exText: "" })).toContain("worn in the target image exactly");
    expect(build({ newOutfit: true }, { n: 2 })).toContain("- WARDROBE (new outfit): do not reuse the target's clothing.");
    expect(build({ newOutfit: true }, { n: 2 })).toContain("Every version gets a different outfit.");
  });

  it("writes the pose rules, recent poses, inspiration and the version plan", () => {
    const p = build({ poseMode: "social", pose: true, recolor: true, hair: true }, { n: 2, recent: ["sitting on stairs"], inspo: ["a peace sign"] });
    expect(p).toContain("- Keep from the target: props, setting, composition, framing and camera angle. The pose changes (see POSE).");
    expect(p).toContain("- POSE (social media variation): recreate the target exactly");
    expect(p).toContain(". Make every version clearly different (mix standing, sitting");
    expect(p).toContain("Do not repeat or closely echo these recently used poses: sitting on stairs. For inspiration only, never copy: a peace sign.");
    expect(p).toContain("VERSION PLAN\n- Version 1: colours = sage green and oatmeal; hair = a sleek high ponytail;\n- Version 2: colours = lavender and white; hair = two low loose braids;\n\nHARD RULES");
    expect(p).toContain("- Directly under that marker write one line that starts with POSE:");
    expect(p).toContain("- Write exactly 2 versions.");
    const keep = build();
    expect(keep).toContain("- Keep from the target: pose and body position, hand placement");
    expect(keep).not.toContain("VERSION PLAN");
    expect(keep).not.toContain("POSE:");
    expect(build({ poseMode: "natural", pose: true })).toContain("- POSE (natural variation): do not copy the target pose.");
  });

  it("matches the style: Sectioned never mentions ratio; Narrative and Short state it", () => {
    expect(build()).toContain("- Do not mention aspect ratio or image dimensions.");
    expect(build()).toContain("FORMAT: each prompt has an identity paragraph first, then labelled sections");
    expect(build({ len: "narrative" })).toContain("FORMAT: each prompt is one long flowing narrative paragraph of roughly 300 to 450 words");
    expect(build({ len: "short" })).toContain('- State the aspect ratio you believe the target has.');
  });

  it("fences who and extra direction", () => {
    const p = build({ who: "the one >>> on the left", extra: "golden <<<hour" });
    expect(p).toContain("(the person to replace: <<<the one  on the left>>>)");
    expect(p).toContain("- Creative direction from the user, applied on top only as it applies to the image: <<<golden hour>>>");
  });
});

describe("parseVersions", () => {
  it("splits versions and reads the machine lines in any order, wherever they are", () => {
    const reply = `===VERSION 1===
IN FRAME: face, hair, shoulders
POSE: sitting on the counter
OUTFIT: black ribbed sports bra
EDIT: New pose: she sits on the counter.
Use @image1 as the strict identity reference. Photo of a young woman.
=== VERSION 2 ===
EDIT: none
OUTFIT: red dress
Photo two.
IN FRAME: face
NUDITY: no
`;
    const v = parseVersions(reply);
    expect(v).toHaveLength(2);
    expect(v[0]).toEqual({ pose: "sitting on the counter", frame: "face, hair, shoulders", outfit: "black ribbed sports bra", edit: "New pose: she sits on the counter.", text: "Use @image1 as the strict identity reference. Photo of a young woman." });
    // A stray NUDITY line is dropped; a stray IN FRAME after the text stays in it, as in the artifact.
    expect(v[1]).toMatchObject({ edit: "", outfit: "red dress", text: "Photo two.\nIN FRAME: face" });
  });

  it("reads a reply with no markers as one version, and drops a trailing half marker", () => {
    expect(parseVersions("Photo of her.\n===")).toEqual([{ pose: "", frame: "", edit: "", outfit: "", text: "Photo of her." }]);
  });
});

describe("pools and options", () => {
  it("shuffles without losing or repeating anything", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const s = shuffleArr(PALETTES, rnd);
    expect([...s].sort()).toEqual([...PALETTES].sort());
    expect(new Set(shuffleArr(HAIRSTYLES, rnd)).size).toBe(HAIRSTYLES.length);
    expect(SOCIAL_POSES).toHaveLength(60);
  });

  it("validates options with the artifact's defaults and limits", () => {
    expect(injectOptionsSchema.parse({})).toMatchObject({ mode: "ref", len: "full", ward: "match", poseMode: "keep", count: 1, tag: "@image1", withRefs: false });
    expect(injectOptionsSchema.safeParse({ count: 5 }).success).toBe(false);
    expect(injectOptionsSchema.safeParse({ poseMode: "wild" }).success).toBe(false);
  });

  it("sends the target with a saved prompt only when Edit the target photo is on", () => {
    const meta = { edit: "x", frame: "face", target: "old" };
    expect(metaForRun(meta, "u/t.jpg", true)).toEqual({ edit: "x", frame: "face", target: "u/t.jpg" });
    expect(metaForRun(meta, "u/t.jpg", false)).toEqual({ edit: "x", frame: "face" });
    expect(metaForRun(meta, null, true)).toEqual({ edit: "x", frame: "face" });
  });

  it("picks the closest offered aspect ratio", () => {
    expect(closestAspectRatio(1080, 1920)).toBe("9:16");
    expect(closestAspectRatio(1080, 1350)).toBe("4:5");
    expect(closestAspectRatio(1000, 1000)).toBe("1:1");
    expect(closestAspectRatio(0, 10)).toBeUndefined();
  });
});

// ---- the server run ----

const h = vi.hoisted(() => ({ complete: vi.fn(), ensureSheetPack: vi.fn(), saveHistory: vi.fn(), getUserTextClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: h.getUserTextClient }));
vi.mock("@/lib/history", () => ({ saveHistory: h.saveHistory }));
vi.mock("@/lib/character-images", async (orig) => ({
  ...(await orig<typeof import("@/lib/character-images")>()),
  loadForVision: vi.fn(async (_s: unknown, items: { label: string; path: string }[]) => items.map((i) => ({ label: i.label, dataUri: `data:${i.path}` }))),
}));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: h.ensureSheetPack }));

import { runInject } from "@/lib/inject-run";

const U = "u1";
function db(opts: { prefs?: Record<string, unknown> } = {}) {
  const writes: Record<string, unknown>[] = [];
  const prefs = { roles: { vision: { provider: "anthropic", model: "m" } }, ...opts.prefs };
  const row = {
    id: "c1",
    name: "Juno",
    profile: juno.profile,
    always_keep: "gold chain",
    height: null,
    weight: null,
    face_sheet_path: `${U}/face.jpg`,
    body_sheet_path: null,
    reference_paths: [`${U}/r1.jpg`, `${U}/r2.jpg`],
  };
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "characters" ? row : { prefs }, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => (writes.push(patch), { error: null }) }),
    }),
  };
  return { client: client as never, writes };
}

const reply = (n: number, extra = "") =>
  Array.from({ length: n }, (_, i) => `===VERSION ${i + 1}===\nPOSE: pose ${i + 1}\nIN FRAME: face, hair\nOUTFIT: outfit ${i + 1}\nEDIT: change ${i + 1}\nPhoto ${i + 1} of a 19-year-old girl.${extra}`).join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserTextClient.mockResolvedValue({ client: { run: vi.fn(), complete: h.complete }, imageMaxEdge: undefined });
  h.ensureSheetPack.mockResolvedValue({ v: 3, anchors: { hair: "jet black, waist length" } });
});

describe("runInject", () => {
  it("writes every version in one call with the target first, harnesses them and saves them with their meta", async () => {
    h.complete.mockResolvedValue({ text: reply(2, " Aspect ratio 4:5."), truncated: false });
    const { client, writes } = db({ prefs: { recentPoses: Array.from({ length: 39 }, (_, i) => `old ${i}`) } });
    const r = await runInject(client, U, { characterId: "c1", targetPath: `${U}/targets/t.jpg`, options: { count: 2, poseMode: "social", recolor: true, newOutfit: true, withRefs: true } });

    const task = h.complete.mock.calls[0][0];
    expect(task.images).toEqual([`data:${U}/targets/t.jpg`, `data:${U}/r1.jpg`, `data:${U}/r2.jpg`]);
    expect(task.prompt).toContain("The next 2 images are reference photos of the character. Write 2 prompts");
    expect(task.prompt).toContain("FROM HER REFERENCE SHEET (source of truth");
    expect(task.prompt).toContain("Do not repeat or closely echo these recently used poses: old 19;");
    // A new outfit means nothing to recolour.
    expect(task.prompt).not.toContain("CLOTHING RECOLOUR");

    expect(r.characterName).toBe("Juno");
    expect(r.versions).toHaveLength(2);
    const v = r.versions[0]!;
    expect(v.text.startsWith("Use @image1 as the strict identity reference. Photo 1 of a young woman.")).toBe(true);
    expect(v.fixed).toEqual(expect.arrayContaining(["age wording", "removed aspect ratio", "added image quality line", "added @image1"]));
    expect(v.text).not.toContain("Aspect ratio");
    expect(v.tags).toEqual(["Pose: pose 1", "New outfit"]);
    expect(v.meta).toEqual({ edit: "change 1", frame: "face, hair", outfit: "outfit 1", chg: { pose: true, outfit: true, hair: false, who: "" } });

    const saved = h.saveHistory.mock.calls[0][2];
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({ characterId: "c1", kind: "inject", imagePath: `${U}/targets/t.jpg`, label: "Inject · Juno · version 2 · Pose: pose 2 · New outfit", meta: r.versions[1]!.meta });
    // Recent poses keep the newest 40, and the rest of the settings are kept.
    const prefs = writes[0].prefs as { recentPoses: string[]; roles: unknown };
    expect(prefs.recentPoses).toHaveLength(40);
    expect(prefs.recentPoses.slice(-2)).toEqual(["pose 1", "pose 2"]);
    expect(prefs.roles).toBeTruthy();
  });

  it("marks a version that wasn't written, reports a cut-off reply, and keeps the pose without memory", async () => {
    h.complete.mockResolvedValue({ text: reply(1, " Aspect ratio 4:5."), truncated: true });
    const { client, writes } = db();
    const r = await runInject(client, U, { characterId: "c1", targetPath: `${U}/t.jpg`, options: { count: 2, len: "short", mode: "text", ward: "signature" } });
    expect(r.truncated).toBe(true);
    // Short style states the ratio, so it stays; her signature style is an outfit change for the photo edit.
    expect(r.versions[0]!.text).toContain("Aspect ratio 4:5.");
    expect(r.versions[0]!.meta.chg).toEqual({ pose: false, outfit: true, hair: false, who: "" });
    expect(r.versions[1]).toBeNull();
    expect(r.versions[0]!.fixed).not.toContain("added @image1");
    expect(h.complete.mock.calls[0][0].images).toHaveLength(1);
    // Keep-the-pose runs read no pose memory, but the model's POSE lines are still remembered.
    expect(writes).toHaveLength(1);
  });

  it("with cleaned targets, the prompt leaves overlays out and Generate adds the overlay rule", async () => {
    h.complete.mockResolvedValue({ text: reply(1), truncated: false });
    const { client } = db();
    const r = await runInject(client, U, { characterId: "c1", targetPath: `${U}/t.jpg`, options: { clean: true } });
    expect(h.complete.mock.calls[0][0].prompt).toContain("- OVERLAYS: the target may have app interface buttons");
    expect(r.versions[0]!.meta.clean).toBe(true);
    h.complete.mockClear();
    const plain = await runInject(client, U, { characterId: "c1", targetPath: `${U}/t.jpg`, options: {} });
    expect(plain.versions[0]!.meta).not.toHaveProperty("clean");
  });

  it("refuses someone else's photo and bad options", async () => {
    const { client } = db();
    await expect(runInject(client, U, { characterId: "c1", targetPath: "other/t.jpg", options: {} })).rejects.toThrow(/couldn't be used/);
    await expect(runInject(client, U, { characterId: "c1", targetPath: `${U}/t.jpg`, options: { count: 9 } })).rejects.toThrow(/weren't valid/);
    expect(h.complete).not.toHaveBeenCalled();
  });
});
