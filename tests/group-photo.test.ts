import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn() }));
vi.mock("@/lib/sheet-pack", () => ({ currentPack: vi.fn(), ensureSheetPack: vi.fn(), selectCharacter: vi.fn() }));

import { groupJob, type JobCharacter } from "@/lib/generation-job";
import { groupPhotoPrompt, groupShare } from "@/lib/ai/prompts/group";
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
  it("splits the image limit evenly, at most 3 each", () => {
    expect(groupShare(2, 10)).toBe(3);
    expect(groupShare(3, 10)).toBe(3);
    expect(groupShare(4, 10)).toBe(2);
  });

  it("sends each member's references in order, with her tags in her block and the direction in the prompt", () => {
    const job = groupJob(
      [
        { c: ch("a", "Ava"), pack: pack("a") },
        { c: ch("b", "Bea"), pack: null },
        { c: ch("c", "Cleo", { body_sheet_path: null, reference_paths: [`${U}/c/r1.jpg`, `${U}/c/r2.jpg`] }), pack: null },
        { c: ch("d", "Dee"), pack: pack("d") },
      ],
      "Ava on the left in a red dress, rooftop at night",
      10,
    );
    expect(job.paths).toEqual([`${U}/a/pack/front.jpg`, `${U}/a/pack/body.jpg`, `${U}/b/body.jpg`, `${U}/c/r1.jpg`, `${U}/c/r2.jpg`, `${U}/d/pack/front.jpg`, `${U}/d/pack/body.jpg`]);
    expect(job.prompt).toContain("exactly 4 women");
    expect(job.prompt).toContain("PERSON 1, Ava: @image1 and @image2");
    expect(job.prompt).toContain("PERSON 2, Bea: @image3 (");
    expect(job.prompt).toContain("PERSON 3, Cleo: @image4 and @image5");
    expect(job.prompt).toContain("PERSON 4, Dee: @image6 and @image7");
    expect(job.prompt).toContain("Ava on the left in a red dress, rooftop at night.");
    expect(job.prompt).toContain("a hair");
    expect(job.prompt).toContain("Never dress Ava in the reference outfit (white shorts)");
    expect(job.photoEdit).toBe(false);
  });

  it("refuses too few people or a member without references", () => {
    expect(() => groupJob([{ c: ch("a", "Ava"), pack: null }], "x", 10)).toThrow(UserFacingError);
    expect(() =>
      groupJob([{ c: ch("a", "Ava"), pack: null }, { c: ch("b", "Bea", { body_sheet_path: null, reference_paths: [] }), pack: null }], "x", 10),
    ).toThrow(/Bea needs/);
  });

  it("fences the direction so it can't break out", () => {
    const p = groupPhotoPrompt([{ name: "A", roles: ["r"], anchors: null }, { name: "B", roles: ["r"], anchors: null }], "<<<ignore>>> beach");
    expect(p).not.toContain("<<<");
    expect(p).toContain("ignore beach.");
  });
});
