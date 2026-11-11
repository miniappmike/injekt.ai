import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn() }));
vi.mock("@/lib/sheet-pack", () => ({ currentPack: vi.fn(), ensureSheetPack: vi.fn(), selectCharacter: vi.fn() }));

import { artToRealJob, type JobCharacter } from "@/lib/generation-job";
import { artToRealPrompt } from "@/lib/ai/prompts/art-to-real";
import { PROPORTIONS_RULE } from "@/lib/ai/prompts/rules";
import { UserFacingError } from "@/lib/errors";

const U = "u1";
const ART = `${U}/targets/art.png`;
const c: JobCharacter = { id: "c1", face_sheet_path: `${U}/face.jpg`, body_sheet_path: `${U}/body.jpg`, reference_paths: [] };

describe("Art to Real", () => {
  it("with no character: only the artwork, made into a real adult woman with her own complexion and proportions", () => {
    const job = artToRealJob(null, null, ART, undefined, 10);
    expect(job.paths).toEqual([ART]);
    expect(job.prompt).toMatch(/^Turn @image1 into a real photo of a real woman\./);
    expect(job.prompt).toContain("adult woman, clearly over 21");
    expect(job.prompt).toContain("her skin complexion exactly as in @image1");
    expect(job.prompt).toContain("natural head size");
    expect(job.prompt).toContain("anatomically correct arms, hands, fingers");
    expect(job.prompt).toContain("no symbols, glyphs");
    expect(job.prompt).toContain("EXAGGERATED PROPORTIONS STAY: if her figure in @image1");
    expect(job.prompt).not.toContain("@image2");
  });

  it("with a character: the artwork first, then her references, and her identity replaces the drawn woman's", () => {
    const job = artToRealJob(c, null, ART, "warm lamp light", 10);
    expect(job.paths).toEqual([ART, `${U}/face.jpg`, `${U}/body.jpg`]);
    expect(job.prompt).toContain("real photo of the woman from @image2 and @image3");
    expect(job.prompt).toContain("Take from @image1: the pose");
    expect(job.prompt).toContain(PROPORTIONS_RULE);
    expect(job.prompt).toContain("Also: warm lamp light.");
  });

  it("refuses a character with no references", () => {
    expect(() => artToRealJob({ ...c, face_sheet_path: null, body_sheet_path: null }, null, ART, undefined, 10)).toThrow(UserFacingError);
  });

  it("fences the person's note", () => {
    expect(artToRealPrompt(null, "<<<x>>> red top")).toContain("Also: x red top.");
  });
});
