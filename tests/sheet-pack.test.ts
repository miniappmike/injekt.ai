import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const h = vi.hoisted(() => ({ getUserTextClient: vi.fn(), run: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: h.getUserTextClient }));

import { currentPack, ensureSheetPack, packFiles, packSig, selectCharacter } from "@/lib/sheet-pack";
import { PACK_V } from "@/lib/ai/prompts/identity";
import { ApiKeyRequiredError } from "@/lib/errors";

const U = "u1";
const BODY = `${U}/characters/c1/body.jpg`;
const FACE = `${U}/characters/c1/face.jpg`;

const analysis = {
  body: [0.05, 0.1, 0.6, 0.95],
  side: [0.62, 0.1, 0.8, 0.95],
  faces: { box: [0.82, 0.1, 0.98, 0.5], rows: 2, cols: 1, front: [0, 0] },
  hair: "jet black, waist length",
  face: "oval face",
  skin: "light olive",
  upper: "fuller bust",
  mid: "narrow waist, wide hips",
  legs: "long legs",
  waist_to_hip: 0.6,
  hip_to_shoulder: 1.3,
  avoid: ["not red hair"],
  sheet_outfit: "a white crop top and shorts",
};

let sheet: Buffer;
beforeEach(async () => {
  vi.clearAllMocks();
  sheet ??= await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#888" } }).jpeg().toBuffer();
  h.run.mockResolvedValue(JSON.stringify(analysis));
  h.getUserTextClient.mockResolvedValue({ client: { run: h.run }, imageMaxEdge: 512 });
});

// A user's Supabase client with one character row and the media bucket.
function fake(opts: { failSave?: boolean } = {}) {
  const calls = { uploads: [] as { path: string; size: { width?: number; height?: number } }[], removed: [] as string[], updates: [] as Record<string, unknown>[], filters: [] as string[] };
  const client = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        calls.updates.push(patch);
        const chain: any = {
          eq: (c: string, v: string) => (calls.filters.push(`${c}=${v}`), chain),
          is: (c: string) => (calls.filters.push(`${c} is null`), chain),
          select: async () => ({ data: opts.failSave ? [] : [{ id: "c1" }], error: null }),
          then: (res: any) => res({ error: null }),
        };
        return chain;
      },
    }),
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array(sheet)]), error: null }),
        upload: async (path: string, bytes: Buffer) => (calls.uploads.push({ path, size: await sharp(bytes).metadata() }), { error: null }),
        remove: async (paths: string[]) => (calls.removed.push(...paths), { error: null }),
      }),
    },
  };
  return { client: client as never, calls };
}

const character = (extra: Record<string, unknown> = {}) => ({ id: "c1", face_sheet_path: null, body_sheet_path: BODY, ...extra });

describe("currentPack", () => {
  it("is the saved pack only when it was read from her current sheets at the current version", () => {
    const pack = { v: PACK_V, sig: packSig(character()), crops: [] };
    expect(currentPack(character({ sheet_pack: pack }))).toBe(pack);
    expect(currentPack(character({ sheet_pack: { ...pack, v: 2 } }))).toBeNull();
    expect(currentPack(character({ sheet_pack: pack, body_sheet_path: `${U}/characters/c1/new.jpg` }))).toBeNull();
    expect(currentPack(character({ sheet_pack: { ...pack, failed: true } }))).toBeNull();
  });
});

describe("ensureSheetPack", () => {
  it("does nothing without a sheet, and falls back quietly without a vision key", async () => {
    const { client } = fake();
    expect(await ensureSheetPack(client, U, character({ body_sheet_path: null }))).toBeNull();
    h.getUserTextClient.mockRejectedValue(new ApiKeyRequiredError("vision"));
    expect(await ensureSheetPack(client, U, character())).toBeNull();
    expect(h.run).not.toHaveBeenCalled();
  });

  it("reads the sheet once, stores the crops and saves the pack only if the sheets are unchanged", async () => {
    const { client, calls } = fake();
    const old = { v: 2, sig: "old", crops: [{ path: `${U}/characters/c1/pack/old.jpg` }, { path: "someone-else/x.jpg" }] };
    const pack = await ensureSheetPack(client, U, character({ sheet_pack: old }));
    expect(h.getUserTextClient).toHaveBeenCalledWith(client, U, "vision", "sheet");
    expect(h.run).toHaveBeenCalledTimes(1);
    const task = h.run.mock.calls[0][0];
    expect(task.prompt).toMatch(/^The attached image is a character reference sheet for one adult woman/);
    expect(task.images).toHaveLength(1);

    expect(pack?.crops.map((c) => c.kind)).toEqual(["front", "faces", "side", "body"]);
    expect(pack?.anchors.prop).toContain("waist about 60% of her hip width");
    expect(pack?.anchors.sheetOutfit).toBe("a white crop top and shorts");
    expect(pack?.sig).toBe(packSig(character()));
    // Crops are cut from the full-size sheet and scaled to the artifact's sizes.
    expect(calls.uploads).toHaveLength(4);
    for (const u of calls.uploads) expect(u.path.startsWith(`${U}/characters/c1/pack/`)).toBe(true);
    expect(Math.min(calls.uploads[0].size.width!, calls.uploads[0].size.height!)).toBe(640);
    expect(calls.updates[0]).toEqual({ sheet_pack: pack });
    expect(calls.filters).toEqual(["id=c1", "face_sheet_path is null", `body_sheet_path=${BODY}`]);
    // The old pack's files go; files outside the user's folder are never touched.
    expect(calls.removed).toEqual([`${U}/characters/c1/pack/old.jpg`]);
  });

  it("reads both sheets when there are two, and asks once more for valid JSON", async () => {
    h.run.mockResolvedValueOnce("not json {").mockResolvedValue(JSON.stringify(analysis));
    const { client } = fake();
    const pack = await ensureSheetPack(client, U, character({ face_sheet_path: FACE }));
    expect(h.run.mock.calls.some(([t]) => t.prompt.endsWith("\nReturn only valid JSON."))).toBe(true);
    expect(pack?.facesFrom).toBe("face");
    expect(pack?.crops[0].role).toBe("a close-up of her face from the front (from her face sheet)");
    expect(pack?.crops.at(-1)?.role).toBe("her full body from the front, side and back (from her body sheet)");
  });

  it("remembers a failure, cleans up what it stored and doesn't pay to retry straight away", async () => {
    const { client, calls } = fake({ failSave: true });
    expect(await ensureSheetPack(client, U, character())).toBeNull();
    expect(calls.removed).toHaveLength(4);
    const marker = calls.updates.at(-1)?.sheet_pack as { failed: boolean; sig: string };
    expect(marker).toMatchObject({ failed: true, v: PACK_V, sig: packSig(character()) });

    h.run.mockClear();
    expect(await ensureSheetPack(client, U, character({ sheet_pack: marker }))).toBeNull();
    expect(h.run).not.toHaveBeenCalled();
  });

  it("reads a sheet only once when two generations ask at the same time", async () => {
    const { client } = fake();
    const [a, b] = await Promise.all([ensureSheetPack(client, U, character()), ensureSheetPack(client, U, character())]);
    expect(a).toBe(b);
    expect(h.run).toHaveBeenCalledTimes(1);
  });
});

describe("selectCharacter", () => {
  it("retries without sheet_pack before migration 0010 has run", async () => {
    const asked: string[] = [];
    const client = {
      from: () => ({
        select: (cols: string) => ({
          eq: () => ({
            maybeSingle: async () => (asked.push(cols), cols.includes("sheet_pack") ? { data: null, error: { message: "column characters.sheet_pack does not exist" } } : { data: { id: "c1" }, error: null }),
          }),
        }),
      }),
    };
    expect(await selectCharacter(client as never, "c1", "id, face_sheet_path, sheet_pack")).toEqual({ id: "c1" });
    expect(asked).toEqual(["id, face_sheet_path, sheet_pack", "id, face_sheet_path"]);
  });
});

describe("packFiles", () => {
  it("lists only the user's own crop files", () => {
    expect(packFiles(U, { crops: [{ path: `${U}/a.jpg` }, { path: "x/b.jpg" }, {}] })).toEqual([`${U}/a.jpg`]);
    expect(packFiles(U, null)).toEqual([]);
  });
});
