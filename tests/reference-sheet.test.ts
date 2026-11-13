import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const h = vi.hoisted(() => ({ enforceRateLimit: vi.fn(async () => {}) }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: h.enforceRateLimit }));
vi.mock("@/lib/generation", () => ({ GENERATIONS_BUCKET: "generations" }));

import { sheetPrompts, tuneLine } from "@/lib/ai/prompts/sheets";
import { SHEET_ASPECT_RATIO } from "@/lib/sheet-options";
import { IMAGE_ASPECT_RATIOS } from "@/lib/ai/providers/types";
import { UserFacingError } from "@/lib/errors";
import { attachGeneratedSheet } from "@/lib/reference-sheet";

describe("reference sheet prompts (A13b)", () => {
  it("the face sheet is a short, plain prompt: two rows of three, no text, no accessories", () => {
    const p = sheetPrompts(false, false).face;
    expect(p).toBe(
      "Give me a no text, borderless face reference sheet of the woman in @image1, with no boxes, frames or borders around the portraits. One row she makes a straight, neutral face looking forward, then at 45 degrees, then in side profile. Next row she is smiling with realistic, non-perfect human teeth, forward, then at 45 degrees, then in side profile. She is bare shoulders and up, with no accessories and no earrings.",
    );
    expect(sheetPrompts(true, 3).face).toBe(p);
  });

  it("the body sheet states no earrings or necklaces, and nothing about piercings", () => {
    for (const hasSheet of [false, true]) {
      const { face, body } = sheetPrompts(hasSheet, 3, { outfit: "custom", outfitText: "a red dress" });
      expect(body).toContain("No earrings or necklaces.");
      // Borderless: the views are never put in boxes.
      expect(body).toContain("borderless with no boxes, frames or outlines");
      // Four full-length panels in one row with thin white gutters, uncropped, and no separate portrait grid.
      expect(body).toContain("Four uncropped full-body views side by side in one row, separated by thin white vertical gutters");
      expect(body).toContain("nothing cut off at the edges");
      expect(body).not.toContain("2 by 2");
      expect(body).not.toContain("Right third");
    }
  });

  it("the turnaround takes her face from @image1 and her body from one or two body photos", () => {
    const one = sheetPrompts(true, false).body;
    expect(one).toContain("of the woman in @image1 (her face reference sheet), with her body taken from @image2 (body reference). Four uncropped full-body views side by side in one row, separated by thin white vertical gutters");
    expect(one).toContain("proportions and height exactly as in @image2, shown in a neutral");
    expect(one).toContain("Outfit in all four views: a plain white crop tube top and very short plain white shorts, both wrapped tightly and fitted close to her body, with bare feet.");
    expect(one).toContain(" Do not beautify, slim, shrink, age or change her. ");
    const two = sheetPrompts(false, true).body;
    expect(two).toContain("of the woman in @image1 (face reference), with her body taken from @image2 and @image3 (body references");
    expect(two).toContain("from both body references");
    // Up to three body photos: front, back and side.
    const three = sheetPrompts(true, 3).body;
    expect(three).toContain("with her body taken from @image2, @image3 and @image4 (body references showing her from different angles, such as front, back and side)");
    expect(three).toContain("from all three body references");
    expect(sheetPrompts(true, 2).body).toBe(sheetPrompts(true, true).body);
    expect(sheetPrompts(true, 1).body).toBe(sheetPrompts(true, false).body);
    expect(sheetPrompts(true, 9).body).toBe(three);
  });

  it("outfit choices and body tuning", () => {
    expect(sheetPrompts(true, false, { outfit: "photo" }).body).toContain("Outfit in all four views: the exact outfit she wears in @image2.");
    expect(sheetPrompts(true, false, { outfit: "custom", outfitText: "a red <<<dress" }).body).toContain("Outfit in all four views: a red dress.");
    expect(sheetPrompts(true, false, { outfit: "custom", outfitText: " " }).body).toContain("plain white crop tube top");
    const covered = "Outfit in all four views: a plain white crop tube top and very short plain white shorts, both wrapped tightly and fitted close to her body, with bare feet.";
    expect(sheetPrompts(true, false).body).toContain(covered);
    expect(sheetPrompts(true, false, { outfit: "covered" }).body).toContain(covered);
    expect(sheetPrompts(true, false, { outfit: "default" }).body).toContain(covered); // older saved runs
    expect(sheetPrompts(true, false, { outfit: "bikini" }).body).toContain("Outfit in all four views: a plain black bikini, a fitted triangle top and a matching bikini bottom, with bare feet.");
    const tuned = sheetPrompts(true, false, { gluteSize: "larger", gluteShape: "heart", cup: "D" }).body;
    expect(tuned).toContain(" Body adjustments, applied the same way in every view: noticeably fuller, larger glutes than in the body photos; a heart-shaped glute shape, fuller at the lower curve; a bust the full size of a D cup, never reduced. Everything else about her body");
    expect(tuned).toContain("Apart from the listed body adjustments, do not beautify, slim, shrink, age or change her.");
    expect(tuneLine({ gluteSize: "match", cup: "Z" })).toBe("");
  });

  it("different bodies blend into one, keeping the boldest curves instead of averaging", () => {
    const blended = sheetPrompts(true, 3, { blend: true }).body;
    expect(blended).toContain("@image2, @image3 and @image4 (body references of three different women; only their bodies are used, never their faces, hair or skin)");
    expect(blended).toContain("her body is one composite of all three body references");
    expect(blended).toContain("take the more pronounced feature from whichever photo has it");
    expect(blended).not.toContain("different angles");
    expect(sheetPrompts(true, 2, { blend: true }).body).toContain("@image2 and @image3 (body references of two different women");
    // One photo has nothing to blend.
    expect(sheetPrompts(true, 1, { blend: true }).body).toBe(sheetPrompts(true, 1).body);
    // The fine-tune never pulls the figure back toward natural or average.
    const big = tuneLine({ gluteSize: "xxlarger", cup: "H", blend: true });
    expect(big).toContain("extremely large, exaggerated glutes");
    expect(big).toContain("an H cup, never reduced");
    expect(big).toContain("stays as in the composite body above");
    expect(big).not.toMatch(/natural|in proportion/);
  });

  it("makes each sheet in a shape the image model accepts", () => {
    expect(SHEET_ASPECT_RATIO).toEqual({ face: "3:2", body: "1:1" });
    for (const shape of Object.values(SHEET_ASPECT_RATIO)) expect(IMAGE_ASPECT_RATIOS).toContain(shape);
  });
});

const U = "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b";
const C = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const G = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const user = { id: U, email_confirmed_at: "2026-01-01T00:00:00Z" };
const future = () => new Date(Date.now() + 40 * 3600_000).toISOString();

type Opts = {
  gen?: Record<string, unknown> | null;
  character?: Record<string, unknown> | null;
  downloadFails?: boolean;
  uploadFails?: boolean;
  updateError?: boolean;
  updateMatchesNothing?: boolean;
};

// The user's client. Storage keeps a log of what was uploaded and removed; the database logs the updates.
async function setup(opts: Opts = {}) {
  const png = await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 200, g: 120, b: 90, alpha: 0.5 } } }).png().toBuffer();
  const log = { uploads: [] as { bucket: string; path: string; bytes: Buffer; type?: string }[], removed: [] as { bucket: string; paths: string[] }[], updates: [] as Record<string, unknown>[], downloads: [] as string[] };
  const gen = opts.gen === undefined ? { id: G, kind: "reference_sheet", status: "complete", output_path: `${U}/${G}.png`, expires_at: future(), character_id: C } : opts.gen;
  const character = opts.character === undefined ? { id: C, face_sheet_path: `${U}/characters/${C}/old-face.jpg`, body_sheet_path: `${U}/characters/${C}/old-body.jpg` } : opts.character;
  const supabase = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "generations" ? gen : character }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          select: async () => {
            log.updates.push(patch);
            return opts.updateError ? { data: null, error: new Error("db") } : { data: opts.updateMatchesNothing ? [] : [{ id: C }], error: null };
          },
        }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          log.downloads.push(`${bucket}/${path}`);
          return opts.downloadFails ? { data: null, error: new Error("gone") } : { data: new Blob([new Uint8Array(png)]), error: null };
        },
        upload: async (path: string, bytes: Buffer, o?: { contentType?: string }) => {
          log.uploads.push({ bucket, path, bytes, type: o?.contentType });
          return { error: opts.uploadFails ? new Error("full") : null };
        },
        remove: async (paths: string[]) => (log.removed.push({ bucket, paths }), { error: null }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.test/${bucket}/${path}` }, error: null }),
      }),
    },
  };
  return { supabase: supabase as never, log };
}

const save = (supabase: never, over: Record<string, unknown> = {}) => attachGeneratedSheet(supabase, user, { generationId: G, characterId: C, slot: "face_sheet", ...over } as never);

beforeEach(() => h.enforceRateLimit.mockClear());

describe("attachGeneratedSheet", () => {
  it("copies the finished sheet into the character's own storage and makes it the face sheet", async () => {
    const { supabase, log } = await setup();
    const saved = await save(supabase);

    expect(log.downloads).toEqual([`generations/${U}/${G}.png`]);
    expect(log.uploads).toHaveLength(1);
    const [up] = log.uploads;
    expect(up.bucket).toBe("character-media");
    expect(up.path).toMatch(new RegExp(`^${U}/characters/${C}/[0-9a-f-]{36}\\.jpg$`));
    expect(up.type).toBe("image/jpeg");
    // It was re-encoded as a clean JPEG, like every other upload.
    expect([...up.bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect((await sharp(up.bytes).metadata()).format).toBe("jpeg");

    expect(log.updates).toEqual([{ face_sheet_path: up.path }]);
    expect(saved.path).toBe(up.path);
    expect(saved.url).toBe(`https://signed.test/character-media/${up.path}`);
    expect(h.enforceRateLimit).toHaveBeenCalledWith(U, "sheet-save", 20, 60);
  });

  it("replaces the old face sheet file, but only the face sheet", async () => {
    const { supabase, log } = await setup();
    await save(supabase);
    expect(log.removed).toEqual([{ bucket: "character-media", paths: [`${U}/characters/${C}/old-face.jpg`] }]);
  });

  it("saving a body sheet changes the body sheet and leaves the face sheet alone", async () => {
    const { supabase, log } = await setup();
    await save(supabase, { slot: "body_sheet" });
    expect(Object.keys(log.updates[0])).toEqual(["body_sheet_path"]);
    expect(log.removed[0].paths).toEqual([`${U}/characters/${C}/old-body.jpg`]);
  });

  it("has nothing to remove when the character had no sheet yet", async () => {
    const { supabase, log } = await setup({ character: { id: C, face_sheet_path: null, body_sheet_path: null } });
    await save(supabase);
    expect(log.updates).toHaveLength(1);
    expect(log.removed).toEqual([]);
  });

  it("never deletes a file outside the person's own folder", async () => {
    const { supabase, log } = await setup({ character: { id: C, face_sheet_path: `someone-else/characters/${C}/face.jpg`, body_sheet_path: null } });
    await save(supabase);
    expect(log.removed).toEqual([]);
  });

  it.each([
    ["a generation that isn't a reference sheet", { gen: { id: G, kind: "inject", status: "complete", output_path: "p.png", expires_at: future(), character_id: C } }, /couldn't be found/],
    ["a generation that doesn't exist", { gen: null }, /couldn't be found/],
    ["a sheet still being made", { gen: { id: G, kind: "reference_sheet", status: "processing", output_path: null, expires_at: null, character_id: C } }, /isn't ready/],
    ["a failed sheet", { gen: { id: G, kind: "reference_sheet", status: "failed", output_path: null, expires_at: null, character_id: C } }, /isn't ready/],
    ["a sheet with no file", { gen: { id: G, kind: "reference_sheet", status: "complete", output_path: null, expires_at: future(), character_id: C } }, /isn't ready/],
    ["an expired sheet", { gen: { id: G, kind: "reference_sheet", status: "complete", output_path: "p.png", expires_at: new Date(Date.now() - 1000).toISOString(), character_id: C } }, /expired/],
    ["a sheet with no expiry recorded", { gen: { id: G, kind: "reference_sheet", status: "complete", output_path: "p.png", expires_at: null, character_id: C } }, /expired/],
    ["a sheet made for a different character", { gen: { id: G, kind: "reference_sheet", status: "complete", output_path: "p.png", expires_at: future(), character_id: "11111111-1111-4111-8111-111111111111" } }, /different character/],
    ["a character that isn't theirs", { character: null }, /Character not found/],
    ["a file that can't be loaded", { downloadFails: true }, /Couldn't load/],
  ] as [string, Opts, RegExp][])("refuses %s and changes nothing", async (_name, opts, message) => {
    const { supabase, log } = await setup(opts);
    const err = await save(supabase).catch((e) => e);
    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.message).toMatch(message);
    expect(log.uploads).toEqual([]);
    expect(log.updates).toEqual([]);
    expect(log.removed).toEqual([]);
  });

  it("changes nothing when the file can't be stored", async () => {
    const { supabase, log } = await setup({ uploadFails: true });
    await expect(save(supabase)).rejects.toThrow(/Couldn't save/);
    expect(log.updates).toEqual([]);
    expect(log.removed).toEqual([]);
  });

  it.each([
    ["the database refuses the change", { updateError: true }],
    ["the change matches no character", { updateMatchesNothing: true }],
  ] as [string, Opts][])("removes the new file and keeps the old sheet when %s", async (_name, opts) => {
    const { supabase, log } = await setup(opts);
    await expect(save(supabase)).rejects.toThrow(/Couldn't save/);
    const [up] = log.uploads;
    // Only the file that was just stored is removed; the character's current sheet is still in place.
    expect(log.removed).toEqual([{ bucket: "character-media", paths: [up.path] }]);
  });
});

describe("exaggerated proportions", () => {
  it("the body sheet keeps an extreme figure at full scale; neutral means pose and framing only", async () => {
    const { sheetPrompts } = await import("@/lib/ai/prompts/sheets");
    const { PROPORTIONS_RULE, BODY_LOCK } = await import("@/lib/ai/prompts/rules");
    const body = sheetPrompts(true, 2).body;
    expect(body).toContain(PROPORTIONS_RULE);
    expect(body).toContain("never smaller or more modest proportions");
    expect(BODY_LOCK).toContain(PROPORTIONS_RULE);
  });
});
