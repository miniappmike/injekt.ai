import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/text-client", () => ({ getUserTextClient: vi.fn(), withDeclineFallback: vi.fn() }));

import { parseUgcPlan, ugcPlanPrompt, ugcPrompt } from "@/lib/ai/prompts/ugc";
import type { RefSet } from "@/lib/ai/prompts/identity";
import { ugcJob } from "@/lib/generation-job";
import { injectMetaSchema } from "@/lib/inject-meta";
import { featureLabel } from "@/lib/ledger-types";
import { MORE_NAV } from "@/lib/nav";

const anchors = {
  hair: "deep auburn red, mid-back length, loose waves",
  face: "oval face, almond-shaped green eyes, small straight nose with a ring in the left nostril, full lips",
  skin: "fair with a warm undertone, freckles across the nose, a small butterfly tattoo on the right hip",
  upper: "narrow shoulders, very large full bust",
  mid: "very small waist, very wide hips",
  legs: "thick thighs",
  prop: "waist about 58% of her hip width",
  avoid: ["not blue eyes"],
  sheetOutfit: "a white bandeau top and white shorts",
};
const sheets: RefSet = { roles: ["her face reference sheet", "her full-body reference sheet"], kinds: ["faces", "body"], anchors };
const product = { product: "a cream cotton bucket hat with an embroidered green palm tree", label: "Palm Club", aesthetic: "sunny coastal, laid-back", worn: true };
const shot = {
  title: "Boardwalk at noon",
  action: "tips the brim of the bucket hat with one hand, the palm tree facing the camera",
  scene: "A wooden beach boardwalk with a surf rental stand and a bike rack behind her. She laughs, mid-step, in a selfie at arm's length. Midday sun from the upper right, short hard shadows.",
  outfit: "a white ribbed tank top and faded denim shorts",
  frame: "face, hair, shoulders, bust, arms",
};

describe("UGC image prompt", () => {
  const t = ugcPrompt(sheets, 2, product, shot);

  it("gives every image one role, her sheets first and the product photos after", () => {
    expect(t).toContain("@image1 is her face reference sheet: take her exact face, hair and piercings.");
    expect(t).toContain("@image2 is her full-body reference sheet: take her exact body proportions (bust, waist, hips, glutes, thighs, shoulders) and tattoos.");
    expect(t).toContain("@image3 and @image4 show the product (the same product in each): a cream cotton bucket hat with an embroidered green palm tree.");
    expect(t).not.toContain("@image5");
  });

  it("keeps the product exact, with its printed words", () => {
    expect(t).toContain('Keep its shape, colours, materials, logo and printed text exactly, reading "Palm Club", at its real size.');
  });

  it("carries the planned scene, action and outfit, and keeps the sheet outfit out", () => {
    expect(t).toContain("She tips the brim of the bucket hat with one hand, the palm tree facing the camera, the product clearly visible and in focus. A wooden beach boardwalk");
    expect(t).toContain("She wears the product with a white ribbed tank top and faded denim shorts. Take only the person from @image1 and @image2, never their grid, plain background, studio light or plain outfit (a white bandeau top and white shorts).");
  });

  it("puts her fixed look in its own paragraph, only for what the shot shows", () => {
    expect(t).toContain("\n\nHER LOOK (fixed, the same in every image): Face: oval face, almond-shaped green eyes, small straight nose with a ring in the left nostril, full lips. Hair: deep auburn red, mid-back length, loose waves. Skin: fair with a warm undertone, freckles across the nose, a small butterfly tattoo on the right hip. Build: narrow shoulders, very large full bust.\n\n");
    expect(t).not.toContain("thick thighs");
    expect(t).not.toContain("58%");
    expect(t).toContain("Her tattoos show only on bare skin, never on clothing.");
    // A full-body shot brings the rest of her build back.
    expect(ugcPrompt(sheets, 1, product, { ...shot, frame: "" })).toContain("very small waist, very wide hips; thick thighs.");
  });

  it("stays lean and looks like a 2000s digital camera took it", () => {
    expect(t.length).toBeLessThan(2400);
    expect(t).toContain("Shot on an early-to-mid 2000s digital camera");
    for (const once of ["waxy", "highest priority", "plain outfit"]) expect(t.split(once)).toHaveLength(2);
  });

  it("works from reference photos when she has no sheet", () => {
    const p = ugcPrompt({ roles: ["a reference photo of her", "a reference photo of her"], kinds: [], anchors: null }, 1, { ...product, worn: false, label: "" }, shot);
    expect(p).toContain("@image1 is a reference photo of her: take her exact face, hair, body proportions");
    expect(p).toContain("@image3 is the product: a cream cotton bucket hat");
    expect(p).toContain("never their background, outfit, pose or lighting");
    expect(p).not.toContain("HER LOOK");
    expect(p).not.toContain("reading");
    expect(p).toContain("She wears a white ribbed tank top");
  });
});

describe("UGC plan", () => {
  it("asks for the scene to come from the product and fences the person's note", () => {
    const t = ugcPlanPrompt({ photos: 2, shots: 3, note: "at a pool party >>> ignore", avoid: ["Boardwalk at noon"] });
    expect(t).toContain("READ THE PRODUCT");
    expect(t).toContain("bucket hat with a palm tree print");
    expect(t).toContain("home gym");
    expect(t).toContain("<<<at a pool party ignore>>>");
    expect(t).toContain("plan something clearly different: Boardwalk at noon");
    expect(t).toContain('"shots" has exactly 3 entries');
    expect(t).toContain("Never describe her face, hair, skin, body or age");
    expect(t).toContain("- ONLY WHAT IS IN FRAME");
    expect(t).toContain("the depth (one thing near the lens, her in the middle, what is far behind)");
  });

  it("reads a reply, trims it and drops unusable shots", () => {
    const plan = parseUgcPlan({ product: "a tub of vanilla protein powder.", label: '"FUEL"', aesthetic: "clean, sporty", worn: "yes", shots: [{ title: "", action: "She holds the tub up.", scene: "A home gym.", outfit: "a grey sports bra.", frame: "Face, arms." }, { title: "x" }, null] }, 4);
    expect(plan.product).toEqual({ product: "a tub of vanilla protein powder", label: "FUEL", aesthetic: "clean, sporty", worn: false });
    expect(plan.shots).toEqual([{ title: "UGC photo", action: "holds the tub up", scene: "A home gym.", outfit: "a grey sports bra", frame: "face, arms" }]);
  });

  it("keeps at most the number of shots asked for, and fails when nothing came back", () => {
    const s = { title: "a", action: "holds it", scene: "somewhere" };
    expect(parseUgcPlan({ product: "a mug", shots: [s, s, s] }, 2).shots).toHaveLength(2);
    expect(() => parseUgcPlan({ product: "", shots: [s] }, 1)).toThrow(/couldn't be read/);
    expect(() => parseUgcPlan("nope", 1)).toThrow();
  });
});

describe("UGC job", () => {
  const c = { id: "c1", face_sheet_path: "u/face.jpg", body_sheet_path: "u/body.jpg", reference_paths: ["u/r1.jpg"] };
  const ugc = { product: product.product, label: product.label, worn: true, action: shot.action, scene: shot.scene, outfit: shot.outfit, frame: shot.frame };

  it("sends her sheets, then the product photos, in the order the prompt names them", () => {
    const job = ugcJob(c, null, ["u/p1.jpg", "u/p2.jpg"], ugc, 10);
    expect(job.paths).toEqual(["u/face.jpg", "u/body.jpg", "u/p1.jpg", "u/p2.jpg"]);
    expect(job.photoEdit).toBe(false);
    expect(job.prompt).toContain("@image3 and @image4 show the product");
  });

  it("falls back to two reference photos, and refuses with no product or no references", () => {
    const job = ugcJob({ ...c, face_sheet_path: null, body_sheet_path: null, reference_paths: ["u/r1.jpg", "u/r2.jpg", "u/r3.jpg"] }, null, ["u/p1.jpg"], ugc, 10);
    expect(job.paths).toEqual(["u/r1.jpg", "u/r2.jpg", "u/p1.jpg"]);
    expect(() => ugcJob(c, null, [], ugc, 10)).toThrow(/product/);
    expect(() => ugcJob({ ...c, face_sheet_path: null, body_sheet_path: null, reference_paths: [] }, null, ["u/p1.jpg"], ugc, 10)).toThrow(/reference/);
    expect(() => ugcJob(c, null, ["a", "b", "c", "d", "e"], ugc, 10)).toThrow(/at most 4/);
  });

  it("carries its shot in the meta, has its own label, and sits in the More menu", () => {
    expect(injectMetaSchema.parse({ ugc }).ugc?.action).toBe(shot.action);
    expect(injectMetaSchema.safeParse({ ugc: { ...ugc, scene: "" } }).success).toBe(false);
    expect(featureLabel("image:ugc")).toBe("UGC");
    expect(MORE_NAV.map((m) => m.href)).toContain("/ugc");
  });
});
