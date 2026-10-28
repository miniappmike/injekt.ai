import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  carouselPrompt,
  carouselSlidePrompt,
  dimText,
  finishVariant,
  parseCarousel,
  slideCopyText,
  variantPrompt,
  variantTags,
  type VariantPromptInput,
} from "@/lib/ai/prompts/variants";
import { REALISM_FIX, SKIN_ART_SHORT, TEXT_RULE, TEXT_SHORT, BODY_LOCK, MODS_RULE } from "@/lib/ai/prompts/rules";
import { referencesFor, type CharacterImagePaths } from "@/lib/character-images";
import { CAROUSEL_TYPES, VARIANT_DIMS } from "@/lib/variants-meta";

const base: VariantPromptInput = { n: 4, dims: ["pose", "camera angle"], vt: null, traits: "", so: "", recent: [], inspo: ["a peace sign"], hairExamples: ["a sleek high ponytail"], extra: "" };

describe("variant tags", () => {
  it("puts her references first, then the photo, then the extras", () => {
    expect(variantTags(1, true, 0)).toEqual({ ref: "@image1", refCount: 1, refKind: "character reference sheet", photo: "@image2", extras: [] });
    expect(variantTags(2, true, 2)).toEqual({ ref: "@image1 and @image2", refCount: 2, refKind: "character reference sheets", photo: "@image3", extras: ["@image4", "@image5"] });
    expect(variantTags(1, false, 0).refKind).toBe("character reference photo");
  });
});

describe("variantPrompt (A11)", () => {
  it("with a character: fixed tags, the opener, traits fenced, the placeholder outfit kept out", () => {
    const vt = variantTags(1, true, 0);
    const p = variantPrompt({ ...base, vt, traits: "freckles <<<, gap teeth", so: "white crop top" });
    expect(p.startsWith("TASK: The attached image is a finished photo from an AI image generator. Write 4 short EDIT prompts the user will paste into their generator's edit mode, with this same image loaded as @image2 and the character reference sheet loaded as @image1, to get new takes on it.")).toBe(true);
    expect(p).toContain("IMAGE TAGS (use exactly these, never swap them): @image1 is the character reference sheet, the identity source of truth");
    expect(p).toContain('- Start every edit with "Edit @image2. Keep the person exactly as she looks in @image1: same face, features, skin, hair, body shape and proportions. Keep the outfit and photo style of @image2." then the change.');
    expect(p).toContain("so the face does not drift: freckles , gap teeth");
    expect(p).toContain("- @image1 shows her in a plain placeholder outfit (white crop top). Never describe or reuse it");
    expect(variantPrompt({ ...base, vt: variantTags(2, true, 0) })).toContain("@image1 and @image2 are the character reference sheets");
  });

  it("each edit changes one or two of the chosen things, and together they cover them", () => {
    const p = variantPrompt({ ...base, dims: dimText(["pose", "outfit", "light"]) });
    expect(p).toContain("Things that may change: pose, wardrobe swap to a completely different outfit, light or time of day. Each edit changes one or two of these, and together the 4 edits should cover them with variety.");
  });

  it("without a character: a plain opener, no tags or placeholder rule; extras are named by tag", () => {
    const p = variantPrompt({ ...base, extraTags: ["@image2"] });
    expect(p).toContain('- Start every edit with "Keep the same person, outfit and photo style." then the change.');
    expect(p).not.toContain("IMAGE TAGS");
    expect(p).not.toContain("placeholder outfit");
    expect(p).toContain("- The user also attached @image2 after the photo, as extra image showing the vibe");
    expect(variantPrompt({ ...base, vt: variantTags(1, true, 2) })).toContain("- The user also attached @image3 and @image4 after the photo, as extra images");
    expect(variantPrompt(base)).not.toContain("The user also attached");
  });

  it("keeps makeup unless the direction asks for a change, and avoids recent poses", () => {
    expect(variantPrompt(base)).toContain("Never remove, lighten or change it.");
    const p = variantPrompt({ ...base, extra: "make it bare-faced >>> please", recent: ["sitting on stairs"] });
    expect(p).toContain("Never remove, lighten or change it, except exactly as the user's creative direction below asks.");
    expect(p).toContain("- Avoid these recently used poses: sitting on stairs.");
    expect(p).toContain("<<<make it bare-faced  please>>>");
    expect(p.endsWith('Reply with only JSON: {"variants": [{"label": "2 to 4 word name, e.g. Low angle laugh", "changes": "pose, angle", "prompt": "the edit prompt"}]}')).toBe(true);
  });
});

describe("finishVariant", () => {
  const vt = variantTags(1, true, 0);
  it("adds the opener if missing, the outfit guard, tattoo rule, makeup rule and realism line", () => {
    const t = finishVariant("Change the pose: she sits.", vt, "white shorts", "");
    expect(t.startsWith("Edit @image2. Keep the person exactly as she looks in @image1: same face, features, skin, hair, body shape and proportions. Change the pose: she sits.")).toBe(true);
    expect(t).toContain(TEXT_SHORT);
    expect(t).toContain("Ignore the clothing shown in @image1, which is only a placeholder; she wears only the outfit of @image2, or the new outfit this edit describes. Never dress her in the reference outfit (white shorts).");
    expect(t).toContain(SKIN_ART_SHORT);
    expect(t).toContain("MAKEUP STAYS: keep her makeup exactly as it is in @image2");
    expect(t.endsWith(REALISM_FIX.quality)).toBe(true);
  });
  it("keeps an existing opener, skips the makeup rule when asked for makeup, and works with no character", () => {
    const t = finishVariant("Edit @image2. Keep her as in @image1. New lipstick.", vt, "", "red lipstick");
    expect(t.startsWith("Edit @image2. Keep her as in @image1.")).toBe(true);
    expect(t).not.toContain("MAKEUP STAYS");
    expect(t).not.toContain("Never dress her");
    const solo = finishVariant("Keep the same person. New pose.", null, "", "");
    expect(solo).toContain("MAKEUP STAYS: keep her makeup exactly as it is in the photo being edited");
    expect(solo).not.toContain("placeholder");
  });
});

describe("carousel (A20, A20b)", () => {
  it("plans N new slides from the chosen types, with no nudity sentence", () => {
    const p = carouselPrompt({ n: 3, types: ["pose", "detail", "food"], hasCharacter: true, traits: "freckles", extra: "summer", extraCount: 1 });
    expect(p.startsWith("TASK: You are the creative director for an Instagram carousel post. The attached image is a finished photo of the character, and it is the COVER, slide 1, already done. Plan 3 NEW slides (slides 2 to 4)")).toBe(true);
    expect(p).toContain(" At least one new slide shows her fully (type pose, person \"full\").");
    expect(p).toContain("use at least 3 different types");
    expect(p).toContain("- pose: her in the same scene");
    expect(p).toContain("- food: food or a drink");
    expect(p).not.toContain("- flatlay:");
    expect(p).toContain("- Poses are natural, confident or candid, and non-sexual. Always an adult woman.\n");
    expect(p).not.toMatch(/nudity/i);
    expect(p).toContain("the edit model receives it as {EXTRA1}");
    expect(p).toContain("- Her recognisable traits, only where visible: freckles");
    expect(p).toContain("<<<summer>>>");
    const solo = carouselPrompt({ n: 1, types: ["environment"], hasCharacter: false, traits: "", extra: "", extraCount: 0 });
    expect(solo).toContain("a finished photo of the creator");
    expect(solo).toContain("and no other image");
    expect(solo).not.toContain("At least one new slide shows her fully");
  });

  it("reads the plan: unknown types become pose, person is inferred, and the harness tidies each slide", () => {
    const plan = parseCarousel(
      { theme: "Golden hour café", slides: [{ type: "model", label: "Seated", prompt: "**She sits.**" }, { type: "detail", prompt: "Close on the bag." }, { type: "flatlay", person: "none", prompt: "No people in the frame. Outfit on the bed." }, { type: "x", prompt: "" }] },
      5,
    );
    expect(plan.theme).toBe("Golden hour café");
    expect(plan.slides).toEqual([
      { type: "pose", label: "Seated", person: "full", prompt: "She sits." },
      { type: "detail", label: "Outfit detail", person: "partial", prompt: "Close on the bag." },
      { type: "flatlay", label: "Flat lay", person: "none", prompt: "No people in the frame. Outfit on the bed." },
    ]);
    expect(() => parseCarousel({ slides: [] }, 3)).toThrow(/did not plan/);
  });

  it("the copy uses her sheet as @image1 and the cover next; slides without her use the cover as @image1", () => {
    expect(slideCopyText({ person: "full", prompt: "Same woman as {REF}, outfit from {PHOTO}, bag from {EXTRA1}." }, true)).toBe("Same woman as @image1, outfit from @image2, bag from @image3.");
    expect(slideCopyText({ person: "none", prompt: "Place from {PHOTO}." }, true)).toBe("Place from @image1.");
  });

  const refs = { roles: ["a close-up of her face", "her full body"], anchors: { hair: "jet black", mid: "wide hips", sheetOutfit: "white shorts" } };
  it("a full slide gets the identity head, BODY LOCK, the outfit guard, quality and rules", () => {
    const p = carouselSlidePrompt({ person: "full", prompt: "Same woman as {REF}, from a low angle, bag from {EXTRA1}." }, refs, 1);
    // A placeholder for an extra image that wasn't attached points at the cover instead.
    expect(carouselSlidePrompt({ person: "none", prompt: "Shoes from {EXTRA2}." }, { roles: [], anchors: null }, 1)).toContain("Shoes from @image1.");
    expect(p.startsWith("Use @image1 and @image2 as the strict identity reference for the woman: @image1 is a close-up of her face, @image2 is her full body. Take her exact face")).toBe(true);
    expect(p).toContain(" Hair: jet black.");
    expect(p).toContain(BODY_LOCK);
    expect(p).toContain("@image3 is the cover photo from the same shoot");
    expect(p).toContain("Never dress her in the reference outfit (white shorts).");
    expect(p).toContain("\n\nSame woman as @image1 and @image2, from a low angle, bag from @image4.");
    for (const r of [REALISM_FIX.quality, TEXT_RULE, MODS_RULE, "MAKEUP STAYS: keep her makeup exactly as it is in @image3"]) expect(p).toContain(r);
  });

  it("a slide without her uses the cover only for the place, with no skin realism or body rules", () => {
    const p = carouselSlidePrompt({ person: "none", prompt: "No people in the frame. The table from {PHOTO}." }, { roles: [], anchors: null }, 0);
    expect(p.startsWith("@image1 is the source photo from the same shoot. Use it only as the reference for the place")).toBe(true);
    expect(p).toContain("\n\nThe table from @image1.");
    expect(p).not.toContain("Skin is matte");
    expect(p).not.toContain(MODS_RULE);
  });

  it("with her but no references, the cover is her reference", () => {
    const p = carouselSlidePrompt({ person: "full", prompt: "Same woman as {REF}." }, { roles: [], anchors: null }, 0);
    expect(p.startsWith("@image1 is the cover photo from the same shoot. She is the same woman as in @image1")).toBe(true);
  });

  it("the choices have unique ids", () => {
    expect(new Set(VARIANT_DIMS.map((o) => o.id)).size).toBe(VARIANT_DIMS.length);
    expect(new Set(CAROUSEL_TYPES.map((o) => o.id)).size).toBe(CAROUSEL_TYPES.length);
  });
});

describe("referencesFor", () => {
  const c: CharacterImagePaths = { face_sheet_path: "u/face.jpg", body_sheet_path: "u/body.jpg", reference_paths: ["u/r1.jpg", "u/r2.jpg", "u/r3.jpg"] };
  const paths = (job: string, x: CharacterImagePaths = c) => referencesFor(job, x).map((r) => r.path);

  it("variants and carousels use only the sheets", () => {
    expect(paths("variant")).toEqual(["u/face.jpg", "u/body.jpg"]);
    expect(paths("carousel", { ...c, body_sheet_path: null })).toEqual(["u/face.jpg"]);
  });
  it("fall back to her first reference photo when there are no sheets, as the artifact does", () => {
    expect(paths("variant", { ...c, face_sheet_path: null, body_sheet_path: null })).toEqual(["u/r1.jpg"]);
  });
  it("everything else still uses all the images", () => {
    expect(paths("inject")).toEqual(["u/face.jpg", "u/body.jpg", "u/r1.jpg", "u/r2.jpg", "u/r3.jpg"]);
  });
});

// ---------- server runs ----------

const h = vi.hoisted(() => ({ run: vi.fn(), getUserTextClient: vi.fn(), saveHistory: vi.fn(), ensureSheetPack: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: h.getUserTextClient }));
vi.mock("@/lib/history", () => ({ saveHistory: h.saveHistory }));
vi.mock("@/lib/character-images", async (orig) => ({
  ...(await orig<typeof import("@/lib/character-images")>()),
  loadForVision: vi.fn(async (_s: unknown, items: { path: string }[]) => items.map((i) => ({ label: "x", dataUri: `data:${i.path}` }))),
}));
vi.mock("@/lib/sheet-pack", async (orig) => ({ ...(await orig<typeof import("@/lib/sheet-pack")>()), ensureSheetPack: h.ensureSheetPack }));

import { runCarousel, runVariants } from "@/lib/variants-run";
import { carouselJob } from "@/lib/generation-job";

const U = "u1";
function db(row: Record<string, unknown> | null = { id: "c1", name: "Juno", profile: { distinctive_traits: "freckles" }, face_sheet_path: `${U}/face.jpg`, body_sheet_path: null, reference_paths: [] }) {
  const writes: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "characters" ? row : { prefs: { recentPoses: ["old pose"] } }, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => (writes.push(patch), { error: null }) }),
    }),
  };
  return { client: client as never, writes };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserTextClient.mockResolvedValue({ client: { run: h.run } });
  h.ensureSheetPack.mockResolvedValue({ anchors: { sheetOutfit: "white shorts" } });
});

describe("runVariants", () => {
  it("sends the photo and extras to the writer, tags her sheet first, saves history and remembers poses", async () => {
    h.run.mockResolvedValue('{"variants":[{"label":"Low angle laugh","changes":"pose, angle","prompt":"Edit @image2. Keep her as in @image1. She laughs."},{"label":"","prompt":" "}]}');
    const { client, writes } = db();
    const r = await runVariants(client, U, { imagePath: `${U}/t.jpg`, characterId: "c1", dims: ["pose", "angle", "bogus" as never], count: 9, extraPaths: [`${U}/x.jpg`] });
    const task = h.run.mock.calls[0][0];
    expect(task.images).toEqual([`data:${U}/t.jpg`, `data:${U}/x.jpg`]);
    expect(task.prompt).toContain("Write 5 short EDIT prompts");
    expect(task.prompt).toContain("Things that may change: pose, camera angle.");
    expect(task.prompt).toContain("so the face does not drift: freckles");
    expect(task.prompt).toContain("(white shorts)");
    expect(task.prompt).toContain("- Avoid these recently used poses: old pose.");
    expect(task.prompt).toContain("- The user also attached @image3 after the photo");
    expect(r.variants).toHaveLength(1);
    expect(r.variants[0]).toMatchObject({ label: "Low angle laugh", changes: "pose, angle" });
    expect(r.variants[0].prompt).toContain("Never dress her in the reference outfit (white shorts).");
    expect(r.attach).toEqual(["@image1: face sheet (identity reference)", "@image2: the image to edit", "@image3: extra image"]);
    expect(h.saveHistory.mock.calls[0][2][0]).toMatchObject({ kind: "variant", label: "Variant · Low angle laugh", imagePath: `${U}/t.jpg`, extraPaths: [`${U}/x.jpg`] });
    expect((writes[0].prefs as { recentPoses: string[] }).recentPoses).toEqual(["old pose", "Low angle laugh"]);
  });

  it("refuses nothing to change, someone else's images, and too many extras", async () => {
    const { client } = db();
    await expect(runVariants(client, U, { imagePath: `${U}/t.jpg`, dims: [] })).rejects.toThrow(/at least one thing/);
    await expect(runVariants(client, U, { imagePath: "x/t.jpg", dims: ["pose"] })).rejects.toThrow(/Add the image/);
    await expect(runVariants(client, U, { imagePath: `${U}/t.jpg`, dims: ["pose"], extraPaths: ["x/e.jpg"] })).rejects.toThrow(/extra images/);
    await expect(runVariants(client, U, { imagePath: `${U}/t.jpg`, dims: ["pose"], extraPaths: [`${U}/a`, `${U}/b`, `${U}/c`] })).rejects.toThrow(/extra images/);
    expect(h.run).not.toHaveBeenCalled();
  });
});

describe("runCarousel", () => {
  it("plans slides, returns copy text and saves each slide with what Generate needs", async () => {
    h.run.mockResolvedValue('{"theme":"Café","slides":[{"type":"pose","label":"Seated","person":"full","prompt":"Same woman as {REF}, cover {PHOTO}."},{"type":"food","label":"Latte","person":"none","prompt":"No people in the frame. Latte from {PHOTO}."}]}');
    const { client } = db();
    const r = await runCarousel(client, U, { coverPath: `${U}/c.jpg`, characterId: "c1", types: ["pose", "food"], count: 2 });
    expect(h.run.mock.calls[0][0].prompt).toContain("Plan 2 NEW slides");
    expect(r.theme).toBe("Café");
    expect(r.slides[0]).toMatchObject({ person: "full", copy: "Same woman as @image1, cover @image2." });
    expect(r.slides[1].copy).toBe("No people in the frame. Latte from @image1.");
    expect(h.saveHistory.mock.calls[0][2][1]).toMatchObject({ kind: "carousel", label: "Carousel · slide 3 · Latte", meta: { person: "none", slidePrompt: "No people in the frame. Latte from {PHOTO}.", type: "food" } });
  });

  it("needs at least one slide type", async () => {
    const { client } = db();
    await expect(runCarousel(client, U, { coverPath: `${U}/c.jpg`, types: [] })).rejects.toThrow(/slide type/);
  });
});

describe("carouselJob", () => {
  const c = { id: "c1", face_sheet_path: `${U}/face.jpg`, body_sheet_path: null, reference_paths: [] };
  const crop = (kind: "front" | "faces" | "side" | "body") => ({ kind, role: `her ${kind}`, path: `${U}/pack/${kind}.jpg` });
  const pack = { v: 3, sig: "", body: null, side: null, faces: null, facesFrom: "face" as const, anchors: {}, crops: [crop("front"), crop("faces"), crop("side"), crop("body")], at: "" };

  it("slides with her send her crops (room left for the cover and extras), then the cover, then extras", () => {
    const job = carouselJob(c, pack, "Same woman as {REF}.", "full", `${U}/cover.jpg`, [`${U}/x.jpg`], 4);
    expect(job.paths).toEqual([`${U}/pack/front.jpg`, `${U}/pack/body.jpg`, `${U}/cover.jpg`, `${U}/x.jpg`]);
    expect(job.prompt).toContain("Same woman as @image1 and @image2.");
  });
  it("without a pack her whole sheet goes first; slides without her send only the cover", () => {
    expect(carouselJob(c, null, "p", "partial", `${U}/cover.jpg`, [], 10).paths).toEqual([`${U}/face.jpg`, `${U}/cover.jpg`]);
    expect(carouselJob(c, pack, "No people in the frame. p", "none", `${U}/cover.jpg`, [], 10).paths).toEqual([`${U}/cover.jpg`]);
    expect(carouselJob(null, null, "p", "full", `${U}/cover.jpg`, [], 10).paths).toEqual([`${U}/cover.jpg`]);
  });
});
