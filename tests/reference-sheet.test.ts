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
  it("the face sheet is a 3x3 grid of beauty headshots in the artifact's panel order, with the realism block", () => {
    const p = sheetPrompts(false, false).face;
    expect(p.startsWith("Create a clean character face reference sheet of the woman in @image1 (face reference). Layout: a 3 by 3 grid of 9 equal portrait panels")).toBe(true);
    expect(p).toContain("Row 1: front view, neutral relaxed expression, mouth closed;");
    expect(p).toContain("Row 3: head tilted slightly down, eyes lowered, gentle smile; laughing with eyes crinkled, slight head tilt; back of the head showing the full hairstyle.");
    expect(p).toContain("SKIN REALISM, always");
    expect(p.endsWith("No text, labels, numbers, arrows, logos or watermarks anywhere.")).toBe(true);
  });

  it("the turnaround takes her face from @image1 and her body from one or two body photos", () => {
    const one = sheetPrompts(true, false).body;
    expect(one).toContain("of the woman in @image1 (her face reference sheet), with her body taken from @image2 (body reference). Wide 16:9 layout");
    expect(one).toContain("proportions and height exactly as in @image2, shown in a neutral");
    expect(one).toContain("Outfit in all four views: a plain fitted white athletic-fit crop top and matching plain white athletic-fit shorts, with bare feet.");
    expect(one).toContain(" Do not beautify, slim, age or change her. ");
    const two = sheetPrompts(false, true).body;
    expect(two).toContain("of the woman in @image1 (face reference), with her body taken from @image2 and @image3 (body references");
    expect(two).toContain("from both body references");
  });

  it("outfit choices and body tuning", () => {
    expect(sheetPrompts(true, false, { outfit: "photo" }).body).toContain("Outfit in all four views: the exact outfit she wears in @image2.");
    expect(sheetPrompts(true, false, { outfit: "custom", outfitText: "a red <<<dress" }).body).toContain("Outfit in all four views: a red dress.");
    expect(sheetPrompts(true, false, { outfit: "custom", outfitText: " " }).body).toContain("plain fitted white athletic-fit crop top");
    const tuned = sheetPrompts(true, false, { gluteSize: "larger", gluteShape: "heart", cup: "D" }).body;
    expect(tuned).toContain(" Body adjustments, applied the same way in every view: noticeably fuller, larger glutes than in the body photos; a heart-shaped glute shape, fuller at the lower curve; a natural bust proportionate to a D cup. Everything else about her body");
    expect(tuned).toContain("Apart from the listed body adjustments, do not beautify, slim, age or change her.");
    expect(tuneLine({ gluteSize: "match", cup: "Z" })).toBe("");
  });

  it("makes each sheet in a shape the image model accepts", () => {
    expect(SHEET_ASPECT_RATIO).toEqual({ face: "4:5", body: "16:9" });
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
