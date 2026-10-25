import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const h = vi.hoisted(() => ({ enforceRateLimit: vi.fn(async () => {}) }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: h.enforceRateLimit }));
vi.mock("@/lib/generation", () => ({ GENERATIONS_BUCKET: "generations" }));

import { bodySheetPrompt, faceSheetPrompt, MAX_BODY_PHOTOS, SHEET_ASPECT_RATIO } from "@/lib/ai/tasks/reference-sheet";
import { IMAGE_ASPECT_RATIOS } from "@/lib/ai/providers/types";
import { UserFacingError } from "@/lib/errors";
import { attachGeneratedSheet } from "@/lib/reference-sheet";

describe("reference sheet prompts", () => {
  it("the face sheet turns the one photo into a 3x3 grid of the same face", () => {
    const p = faceSheetPrompt();
    expect(p).toMatch(/3x3/);
    expect(p).toMatch(/nine/);
    expect(p).toMatch(/three rows of three/);
    expect(p).toContain("@image1 as the strict identity reference");
    // Only one picture goes in, so no other picture may be named.
    expect(p).not.toMatch(/@image[2-9]/);
  });

  it("the face and body sheet names the face sheet first and then each body photo", () => {
    const one = bodySheetPrompt(1);
    expect(one).toContain("@image1 (a face sheet)");
    expect(one).toContain("@image2 (a body photo)");
    expect(one).not.toContain("@image3");

    const two = bodySheetPrompt(2);
    expect(two).toContain("@image2 and @image3 (body photos)");
    expect(two).not.toContain("@image4");
    for (const p of [one, two]) {
      expect(p).toMatch(/front, side and back/);
      expect(p).toMatch(/strict identity reference for the face/);
    }
  });

  it("refuses a number of body photos it has no wording for", () => {
    for (const n of [0, 3, -1, 1.5, NaN]) expect(() => bodySheetPrompt(n)).toThrow(/1 to 2 body photos/);
    expect(MAX_BODY_PHOTOS).toBe(2);
  });

  it("makes each sheet in a shape the image model accepts", () => {
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
