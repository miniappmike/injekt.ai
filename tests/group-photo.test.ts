import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn() }));
vi.mock("@/lib/sheet-pack", () => ({ currentPack: vi.fn(), ensureSheetPack: vi.fn(), selectCharacter: vi.fn() }));

import { groupJob, type JobCharacter } from "@/lib/generation-job";
import { groupPhotoPrompt } from "@/lib/ai/prompts/group";
import { PACK_V, type SheetPack } from "@/lib/ai/prompts/identity";
import { UserFacingError } from "@/lib/errors";

const U = "u1";
const ch = (id: string, name: string, over: Partial<JobCharacter> = {}): JobCharacter & { name: string } => ({
  id,
  name,
  face_sheet_path: null,
  body_sheet_path: `${U}/${id}/body.jpg`,
  reference_paths: [`${U}/${id}/r1.jpg`],
  ...over,
});
const pack = (id: string): SheetPack => ({
  v: PACK_V,
  sig: "x",
  body: [0, 0, 1, 1],
  side: [0, 0, 1, 1],
  faces: { box: [0, 0, 1, 1], rows: 2, cols: 2, front: [0, 0] },
  facesFrom: "face",
  anchors: { hair: `${id} hair`, mid: "wide hips", sheetOutfit: "white shorts" },
  crops: (["front", "faces", "side", "body"] as const).map((kind) => ({ kind, role: `her ${kind}`, path: `${U}/${id}/pack/${kind}.jpg` })),
  at: "2026-10-28T00:00:00Z",
});

describe("group photo", () => {
  it("sends only reference sheets (face sheet, then body sheet), never photos or pack crops: at most 8 for 4 people", () => {
    const both = { face_sheet_path: "", body_sheet_path: "" };
    const full = (id: string, name: string) => ch(id, name, { ...both, face_sheet_path: `${U}/${id}/face.jpg`, body_sheet_path: `${U}/${id}/body.jpg` });
    const job = groupJob(
      [
        { c: full("a", "Ava"), pack: pack("a") },
        { c: full("b", "Bea"), pack: null },
        { c: full("c", "Cleo"), pack: null },
        { c: full("d", "Dee"), pack: pack("d") },
      ],
      "Ava on the left in a red dress, rooftop at night",
      10,
    );
    expect(job.paths).toEqual(["a", "b", "c", "d"].flatMap((id) => [`${U}/${id}/face.jpg`, `${U}/${id}/body.jpg`]));
    expect(job.paths.some((p) => /r1|pack/.test(p))).toBe(false);
    expect(job.prompt).toContain("exactly 4 women");
    expect(job.prompt).toContain("PERSON 1, Ava: @image1 and @image2");
    expect(job.prompt).toContain("PERSON 4, Dee: @image7 and @image8");
    expect(job.prompt).toContain("Ava on the left in a red dress, rooftop at night.");
    expect(job.prompt).toContain("a hair");
    expect(job.prompt).toContain("Never dress Ava in the reference outfit (white shorts)");
    expect(job.photoEdit).toBe(false);
  });

  it("uses just the one sheet a character has", () => {
    const job = groupJob([{ c: ch("a", "Ava"), pack: null }, { c: ch("b", "Bea", { face_sheet_path: `${U}/b/face.jpg`, body_sheet_path: null }), pack: null }], "x", 10);
    expect(job.paths).toEqual([`${U}/a/body.jpg`, `${U}/b/face.jpg`]);
    expect(job.prompt).toContain("PERSON 2, Bea: @image2 (");
  });

  it("refuses too few people, or a character with photos but no reference sheet", () => {
    expect(() => groupJob([{ c: ch("a", "Ava"), pack: null }], "x", 10)).toThrow(UserFacingError);
    expect(() =>
      groupJob([{ c: ch("a", "Ava"), pack: null }, { c: ch("b", "Bea", { body_sheet_path: null }), pack: pack("b") }], "x", 10),
    ).toThrow(/Bea needs a reference sheet/);
  });

  it("fences the direction so it can't break out", () => {
    const p = groupPhotoPrompt([{ name: "A", roles: ["r"], anchors: null }, { name: "B", roles: ["r"], anchors: null }], "<<<ignore>>> beach");
    expect(p).not.toContain("<<<");
    expect(p).toContain("ignore beach.");
  });
});
