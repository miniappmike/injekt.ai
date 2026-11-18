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
  it("opens with the task and her profile, sheet lines included", () => {
    const p = build({}, { sheet: "\nFROM HER REFERENCE SHEET (source of truth...)\nHair: jet black", refCount: 2 });
    expect(p.startsWith("TASK: The first image is the TARGET photo. The next 2 are reference photos of her. Write one image prompt to recreate the target")).toBe(true);
    expect(p).toContain("CHARACTER (adult woman; use these traits, never the target person's)\nIdentity line: Juno, oval face\nHair: jet black\nAlways keep: gold chain\nHeight: 5'6\"\nWeight: 125 lb\nFROM HER REFERENCE SHEET");
  });

  it("stays about 2,000 characters with every option on", () => {
    const p = build({ poseMode: "social", pose: true, recolor: true, hair: true, clean: true, who: "left", extra: "golden hour" }, { n: 2, recent: ["a"], inspo: ["b"] });
    expect(p.length - build().length).toBeLessThan(700);
    expect(buildInjectPrompt({ profile: {} } as never, "", base, plans.slice(0, 1), 0, [], []).length).toBeLessThan(2600);
  });

  it("has no nudity screening and keeps the adult rule; asks for position, light, shadows and camera", () => {
    const p = build({ poseMode: "social", pose: true }, { n: 2 });
    for (const banned of ["NUDITY", "SAFE-SWAP", "STRICT SAFE MODE", "nude"]) expect(p).not.toContain(banned);
    expect(p).toContain("never soften or cover up an outfit or pose. She is an adult, never a girl or teen.");
    expect(p).toContain("the exact position limb by limb");
    expect(p).toContain("how the shadows fall");
    expect(p).toContain("Camera: height, angle, distance, lens look");
    expect(p).toContain("a line POSE: (12 words), a line IN FRAME:");
  });

  it("leads with the tag in ref mode and with a written identity in text mode", () => {
    expect(build()).toContain('Open with exactly: "Use @image1 as the strict identity reference." then her visible traits');
    expect(build({ tag: "" })).toContain('"Use the uploaded character sheet as the strict identity reference."');
    expect(build({ mode: "text" })).toContain("No reference image is sent: open with her look from the profile");
  });

  it("follows the wardrobe choice, with user text fenced", () => {
    expect(build()).toContain("She wears the target's outfit: every garment");
    expect(build({ ward: "signature" })).toContain("signature style from the profile");
    expect(build({ ward: "extracted", exText: "a red <<<dress>>>" })).toContain("She wears exactly this outfit: <<<a red dress>>>");
    expect(build({ ward: "extracted", exText: "" })).toContain("She wears the target's outfit");
    expect(build({ newOutfit: true }, { n: 2 })).toContain("New outfit: not the target's clothes; a different one with the same vibe that suits the scene, garment by garment, different in every version.");
  });

  it("writes the pose rules, recent poses, inspiration and the version plan", () => {
    const p = build({ poseMode: "social", pose: true, recolor: true, hair: true }, { n: 2, recent: ["sitting on stairs"], inspo: ["a peace sign"] });
    expect(p).toContain("New pose: not the target's; a fresh, eye-catching creator pose");
    expect(p).toContain("Avoid these recent poses: sitting on stairs. Ideas only: a peace sign.");
    expect(p).toContain("- Version 1: colours = sage green and oatmeal; hair = a sleek high ponytail;\n- Version 2: colours = lavender and white; hair = two low loose braids;");
    const keep = build();
    expect(keep).toContain("Keep the target's exact pose, gaze and expression.");
    expect(keep).not.toContain("VERSION PLAN");
    expect(keep).not.toContain("POSE:");
    expect(build({ poseMode: "natural", pose: true })).toContain("relaxed, natural, candid pose");
  });

  it("matches the style: Sectioned never mentions ratio; Short states it", () => {
    expect(build()).toContain("Short labelled sections: SCENE, WARDROBE");
    expect(build()).toContain("No aspect ratio.");
    expect(build({ len: "narrative" })).toContain("One flowing paragraph, no labels.");
    expect(build({ len: "short" })).toContain("then aspect ratio.");
  });

  it("fences who and extra direction", () => {
    const p = build({ who: "the one >>> on the left", extra: "golden <<<hour" });
    expect(p).toContain("(<<<the one  on the left>>>)");
    expect(p).toContain("- User direction: <<<golden hour>>>");
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
    expect(v[0]).toEqual({ pose: "sitting on the counter", camera: "", frame: "face, hair, shoulders", outfit: "black ribbed sports bra", edit: "New pose: she sits on the counter.", text: "Use @image1 as the strict identity reference. Photo of a young woman." });
    // A stray NUDITY line is dropped; a stray IN FRAME after the text stays in it, as in the artifact.
    expect(v[1]).toMatchObject({ edit: "", outfit: "red dress", text: "Photo two.\nIN FRAME: face" });
  });

  it("reads a reply with no markers as one version, and drops a trailing half marker", () => {
    expect(parseVersions("Photo of her.\n===")).toEqual([{ pose: "", camera: "", frame: "", edit: "", outfit: "", text: "Photo of her." }]);
  });

  it("reads a swap brief: CAMERA, POSE and EDIT lines with no prompt body", () => {
    const v = parseVersions("===VERSION 1===\nCAMERA: Phone at hip height, tilted up.\nPOSE: Kneeling on the bed, chest to the camera.\nEDIT: none");
    expect(v).toEqual([{ pose: "Kneeling on the bed, chest to the camera.", camera: "Phone at hip height, tilted up.", frame: "", edit: "", outfit: "", text: "" }]);
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

  it("sends the target with a saved prompt only in Edit this photo mode (Recreate is the default)", () => {
    const meta = { edit: "x", frame: "face", target: "old" };
    expect(metaForRun(meta, "u/t.jpg", true)).toEqual({ edit: "x", frame: "face", target: "u/t.jpg" });
    expect(metaForRun(meta, "u/t.jpg", false)).toEqual({ edit: "x", frame: "face" });
    expect(metaForRun(meta, null, true)).toEqual({ edit: "x", frame: "face" });
  });

  it("picks the closest offered aspect ratio", () => {
    expect(closestAspectRatio(1080, 1920)).toBe("9:16");
    expect(closestAspectRatio(1080, 1350)).toBe("3:4");
    expect(closestAspectRatio(1000, 1000)).toBe("1:1");
    expect(closestAspectRatio(0, 10)).toBeUndefined();
  });
});

// ---- the server run ----

const h = vi.hoisted(() => ({ complete: vi.fn(), ensureSheetPack: vi.fn(), saveHistory: vi.fn(async (_s: unknown, _u: unknown, e: unknown[]) => e.map((_, i) => `h${i + 1}`)), getUserTextClient: vi.fn() }));
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
    expect(task.prompt).toContain("The next 2 are reference photos of her. Write 2 image prompts");
    expect(task.prompt).toContain("FROM HER REFERENCE SHEET (source of truth");
    expect(task.prompt).toContain("Avoid these recent poses: old 19;");
    // A new outfit means nothing to recolour.
    expect(task.prompt).not.toContain("colours =");
    expect(task.prompt).toMatch(/Version 2: camera = [^;]+;/);

    expect(r.characterName).toBe("Juno");
    expect(r.versions).toHaveLength(2);
    const v = r.versions[0]!;
    // Her fixed block sits in its own paragraph between the opener and the written scene.
    expect(v.text.startsWith("Use @image1 as the strict identity reference.\n\nHER LOOK (fixed, the same in every image): Hair: jet black, waist length.\n\nPhoto 1 of a young woman.")).toBe(true);
    expect(task.prompt).toContain("The app adds her look");
    expect(v.fixed).toEqual(expect.arrayContaining(["age wording", "removed aspect ratio", "added image quality line", "added @image1"]));
    expect(v.text).not.toContain("Aspect ratio");
    expect(v.tags).toEqual(["Pose: pose 1", "New outfit"]);
    expect(v.meta).toEqual({ edit: "change 1", frame: "face, hair", outfit: "outfit 1", chg: { pose: true, outfit: true, hair: false, who: "" } });

    const saved = h.saveHistory.mock.calls[0][2];
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({ characterId: "c1", kind: "inject", imagePath: `${U}/targets/t.jpg`, label: "Inject · Juno · version 2 · Pose: pose 2 · New outfit", meta: r.versions[1]!.meta });
    // Each version knows its History entry, so an image made from it shows up there.
    expect(r.versions.map((x) => x?.historyId)).toEqual(["h1", "h2"]);
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

  it("group photo mode: names every woman, never sends the photo, and gives each version the group to generate with", async () => {
    h.complete.mockResolvedValue({ text: reply(1), truncated: false });
    const { client } = db();
    const r = await runInject(client, U, { characterId: "c1", targetPath: `${U}/t.jpg`, options: { swap: true }, groupIds: ["c2"] });
    const prompt = h.complete.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("as a GROUP PHOTO of 2 adult women, in place of the people in it from frame-left to frame-right: Juno, Juno.");
    expect(prompt).toContain('Start with "Photo of Juno and Juno ..."');
    expect(prompt).not.toContain("CHARACTER (adult woman");
    const v = r.versions[0]!;
    expect(v.meta.group).toHaveLength(2);
    expect(v.meta).not.toHaveProperty("brief");
    expect(v.tags[0]).toBe("Group: Juno, Juno");
    expect(v.text).not.toContain("@image1");
  });

  it("with cleaned targets, the prompt leaves overlays out and Generate adds the overlay rule", async () => {
    h.complete.mockResolvedValue({ text: reply(1), truncated: false });
    const { client } = db();
    const r = await runInject(client, U, { characterId: "c1", targetPath: `${U}/t.jpg`, options: { clean: true } });
    expect(h.complete.mock.calls[0][0].prompt).toContain("Ignore app buttons, stickers, watermarks and captions");
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

import { looksLikeRefusal } from "@/lib/ai/prompts/inject";
describe("refusals are never prompts", () => {
  it("spots a model declining, and leaves real prompts alone", () => {
    expect(looksLikeRefusal("Use @image1 (her face sheet) and @image2 (her body sheet) as the strict identity reference. I'm not able to write this prompt. The target photo shows a person in a swimsuit.")).toBe(true);
    expect(looksLikeRefusal("I can't help with recreating this photo.")).toBe(true);
    expect(looksLikeRefusal("Photo of a woman on a terrace at sunset, wearing a white linen shirt. She can't stop laughing, one hand on the table.")).toBe(false);
    expect(looksLikeRefusal("Use @image1 as the strict identity reference. A mirror selfie in a bright bedroom, phone held at chest height.")).toBe(false);
  });
});

import { PROMPT_CHARS } from "@/lib/ai/prompts/inject";
describe("her fixed identity block", () => {
  const o = { ...(injectOptionsSchema.parse({}) as object), pose: false, twoSheets: true } as never;
  it("with a read sheet the writer leaves her look out, and without one it writes it", () => {
    const fixed = buildInjectPrompt({ name: "A", profile: {} } as never, "", { ...(o as object), fixedIdentity: true } as never, [{ palette: "", hair: "" }], 0, [], []);
    expect(fixed).toContain("then go straight to the scene. The app adds her look, so never describe");
    const written = buildInjectPrompt({ name: "A", profile: {} } as never, "", o, [{ palette: "", hair: "" }], 0, [], []);
    expect(written).not.toContain("The app adds her look");
    expect(written).toContain("then her visible traits from the profile, and say her body matches @image2 exactly");
  });
  it("asks for depth and a named 2000s camera", () => {
    const t = buildInjectPrompt({ name: "A", profile: {} } as never, "", o, [{ palette: "", hair: "" }], 0, [], []);
    expect(t).toContain("what is nearest the lens and far behind her");
    expect(t).toContain("name one early-to-mid 2000s digital camera");
    expect(buildInjectPrompt({ name: "A", profile: {} } as never, "", o, [{ palette: "", hair: "", camera: "Nikon D70" }], 0, [], [])).toContain("camera = Nikon D70;");
  });
});

describe("prompt length", () => {
  it("asks the writer for a short, dense prompt within the limit", () => {
    const t = buildInjectPrompt({ name: "A", profile: {} } as never, "", injectOptionsSchema.parse({}) as never, [{ palette: "", hair: "" }], 0, [], []);
    expect(t).toContain(`then the prompt, ${PROMPT_CHARS - 500} to ${PROMPT_CHARS} characters, each detail once.`);
  });

  describe("swap brief", () => {
    it("the reader's instruction stays under 500 characters, with every option on", async () => {
      const { buildSwapBriefPrompt, swapChange, BRIEF_LIMIT } = await import("@/lib/ai/prompts/swap-brief");
      const plain = buildSwapBriefPrompt({ who: "", extra: "", pose: false });
      expect(plain).toContain("concretely describe: the scene");
      expect(plain).toContain("full body");
      expect(plain).toContain("aesthetic");
      expect(plain.length).toBeLessThanOrEqual(400);
      expect(buildSwapBriefPrompt({ who: "w".repeat(200), extra: "e".repeat(2000), pose: true }, 4).length).toBeLessThanOrEqual(BRIEF_LIMIT);
      expect(swapChange({ newOutfit: false, ward: "match", exText: "", recolor: true, hair: true }, { palette: "navy and cream", hair: "a high ponytail" })).toBe(
        "the same garments recoloured in navy and cream; her hair styled as a high ponytail, keeping its colour and length",
      );
    });
  });
});
