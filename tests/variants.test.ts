import { describe, expect, it } from "vitest";
import {
  attachOrder,
  buildCarouselTask,
  buildVariantTask,
  DEFAULT_VARIANT_COUNT,
  parseCarousel,
  parseVariants,
  VARIANT_OPTIONS,
} from "@/lib/ai/tasks/variants";
import { REALISM_INSTRUCTIONS, withRealism } from "@/lib/ai/tasks/realism";
import { harness } from "@/lib/ai/prompts/harness";
import { REALISM_FIX, TEXT_RULE } from "@/lib/ai/prompts/rules";
import { directSwapPrompt } from "@/lib/ai/tasks/direct-swap";
import { referencesFor, type CharacterImagePaths } from "@/lib/character-images";

const uri = "data:image/jpeg;base64,QUJD";
const refs = [{ label: "face sheet (identity reference)", dataUri: uri }, { label: "body sheet (build reference)", dataUri: uri }];
const image = { label: "image to edit", dataUri: uri };
const character = { name: "Juno", profile: { face: "oval" }, always_keep: "gold chain" };
const R = (p: string) => harness(p).text;

describe("buildVariantTask", () => {
  it("labels the sheets first and the image last", () => {
    const task = buildVariantTask({ character, references: refs, image, options: ["camera", "pose"] });
    expect(task.images).toHaveLength(3);
    expect(task.prompt).toContain("@image3: image to edit");
    expect(task.prompt).toContain('starts with "Edit @image3."');
    expect(task.prompt).toContain("@image1 (face sheet (identity reference)) and @image2 (body sheet (build reference)) as the strict identity reference");
    expect(task.prompt).toContain("Always keep: gold chain");
  });

  it("makes every prompt change all the chosen things together, and keeps the rest", () => {
    const task = buildVariantTask({ character, references: refs, image, options: ["camera", "pose"], count: 3 });
    expect(task.prompt).toContain("write 3 image-editing prompts");
    expect(task.prompt).toContain("Every prompt changes ALL of these together, and nothing else:\n- the pose and body position\n- the camera angle and framing");
    // Not one prompt per change.
    expect(task.prompt).not.toMatch(/one .*per (requested )?variant/i);
    // Unchosen aspects are named as staying the same.
    const keep = task.prompt.slice(task.prompt.indexOf("Everything else stays"));
    expect(keep).toContain("the hairstyle");
    expect(keep).toContain("the lighting and time of day");
    expect(keep).not.toContain("the pose and body position");
    expect(task.prompt).toContain("Exactly 3 entries");
  });

  it("defaults to 4 variants and keeps the count between 1 and 8", () => {
    expect(DEFAULT_VARIANT_COUNT).toBe(4);
    expect(buildVariantTask({ character, references: refs, image, options: ["pose"] }).prompt).toContain("Exactly 4 entries");
    expect(buildVariantTask({ character, references: refs, image, options: ["pose"], count: 50 }).prompt).toContain("Exactly 8 entries");
    expect(buildVariantTask({ character, references: refs, image, options: ["pose"], count: -3 }).prompt).toContain("Exactly 1 entries");
    expect(buildVariantTask({ character, references: refs, image, options: ["pose"], count: 0 }).prompt).toContain("Exactly 4 entries");
  });

  it("asks for the realism line", () => {
    expect(buildVariantTask({ character, references: refs, image, options: ["pose"] }).prompt).toContain(REALISM_INSTRUCTIONS);
  });

  it("works with no character: just the image as @image1", () => {
    const task = buildVariantTask({ character: null, references: [], image, options: ["pose"], note: "beach" });
    expect(task.images).toHaveLength(1);
    expect(task.prompt).toContain("@image1: image to edit");
    expect(task.prompt).toContain("No saved character");
    expect(task.prompt).toContain("beach");
    expect(task.prompt).toContain("no reference sheets");
  });
});

describe("buildCarouselTask", () => {
  const cover = { label: "cover image", dataUri: uri };

  it("briefs the model as a creative director with no fixed list of shots", () => {
    const task = buildCarouselTask({ character, references: refs, cover, slides: 5, note: "seductive goth vibes" });
    expect(task.prompt).toContain("creative director for social media");
    expect(task.prompt).toContain("Instagram carousel");
    expect(task.prompt).toContain("don't follow a formula");
    // The old fixed checklist is gone.
    expect(task.prompt).not.toMatch(/flat lay|outfit detail\s+close-up/);
    expect(task.prompt).toContain("let it steer every slide");
    expect(task.prompt).toContain("Theme from the user: seductive goth vibes");
  });

  it("asks for slides 2 to N as edits of the cover, with the sheets for identity", () => {
    const task = buildCarouselTask({ character, references: refs, cover, slides: 5 });
    expect(task.prompt).toContain("5-slide");
    expect(task.prompt).toContain("Exactly 4 entries");
    expect(task.prompt).toContain("@image3: cover image");
    expect(task.prompt).toContain('starts with "Edit @image3."');
    expect(task.prompt).toContain("@image1 (face sheet (identity reference)) and @image2 (body sheet (build reference))");
    expect(task.prompt).toContain(REALISM_INSTRUCTIONS);
    expect(task.prompt).toContain("No theme given");
  });
});

describe("extra images", () => {
  const extra = (n: number) => ({ label: "extra image from the user (vibe, outfit or styling reference)", dataUri: `${uri}#${n}` });

  it("come after the main image, in @image order, and the model is told what they're for", () => {
    const task = buildVariantTask({ character, references: refs, image, extras: [extra(1), extra(2)], options: ["pose"] });
    expect(task.images).toEqual([uri, uri, uri, `${uri}#1`, `${uri}#2`]);
    expect(task.prompt).toContain("@image3: image to edit\n@image4: extra image from the user");
    expect(task.prompt).toContain("@image5: extra image from the user");
    expect(task.prompt).toContain('starts with "Edit @image3."');
    expect(task.prompt).toContain("The user added @image4 and @image5 to show");
  });

  it("work in carousel mode too, with the cover staying the image to edit", () => {
    const task = buildCarouselTask({ character, references: refs, cover: { label: "cover image", dataUri: uri }, extras: [extra(1)], slides: 4 });
    expect(task.prompt).toContain("@image3: cover image\n@image4: extra image");
    expect(task.prompt).toContain('starts with "Edit @image3."');
    expect(task.prompt).toContain("The user added @image4 to show");
  });

  it("aren't mentioned when there are none", () => {
    expect(buildVariantTask({ character, references: refs, image, options: ["pose"] }).prompt).not.toContain("The user added");
  });

  it("are listed in the attach order", () => {
    expect(attachOrder(refs, "cover image", [extra(1)]).at(-1)).toBe("@image4: extra image from the user (vibe, outfit or styling reference)");
  });
});

describe("attachOrder", () => {
  it("tells the user which image is which, in order", () => {
    expect(attachOrder(refs, "image to edit")).toEqual([
      "@image1: face sheet (identity reference)",
      "@image2: body sheet (build reference)",
      "@image3: image to edit",
    ]);
    expect(attachOrder([], "cover image")).toEqual(["@image1: cover image"]);
  });
});

describe("parseVariants", () => {
  it("reads variants from a fenced reply, caps the count, fills missing labels and adds the realism line", () => {
    const reply = '```json\n{"variants":[{"label":"Pose · stairs","prompt":"Edit @image3. New pose."},{"label":"","prompt":"Edit @image3. Other"},{"label":"x","prompt":"third"}]}\n```';
    expect(parseVariants(reply, 2)).toEqual([
      { label: "Pose · stairs", prompt: R("Edit @image3. New pose.") },
      { label: "Variant 2", prompt: R("Edit @image3. Other") },
    ]);
  });
  it("drops empty prompts and rejects empty or malformed replies", () => {
    expect(parseVariants('{"variants":[{"label":"a","prompt":""},{"label":"b","prompt":"ok."}]}', 5)).toEqual([{ label: "b", prompt: R("ok.") }]);
    expect(() => parseVariants('{"variants":[]}', 5)).toThrow(/did not write/);
    expect(() => parseVariants('{"nope":1}', 5)).toThrow(/unexpected/);
    expect(() => parseVariants("no json", 5)).toThrow();
  });
});

describe("parseCarousel", () => {
  it("reads slides, caps the count, fills missing titles and adds the realism line", () => {
    const out = parseCarousel('{"slides":[{"title":"New spot","prompt":"p1."},{"title":"","prompt":"p2."},{"title":"x","prompt":"p3"}]}', 2);
    expect(out).toEqual([{ title: "New spot", prompt: R("p1.") }, { title: "Slide 3", prompt: R("p2.") }]);
    expect(() => parseCarousel('{"slides":[]}', 4)).toThrow(/did not plan/);
  });
});

describe("withRealism", () => {
  it("runs a prompt through the artifact harness once", () => {
    const once = withRealism("Edit @image2. New pose");
    expect(once).toContain(REALISM_FIX.quality);
    expect(once).toContain(TEXT_RULE);
    expect(withRealism(once)).toBe(once);
    expect(withRealism("  ")).toBe("");
  });

  it("uses the artifact's realism wording: matte textured skin, real camera imperfections, no gloss", () => {
    for (const phrase of ["visible pores", "sensor noise", "mild JPEG compression", "No smoothing, no glossy, waxy, plastic or porcelain skin", "no beauty filter"]) {
      expect(REALISM_FIX.quality).toContain(phrase);
    }
  });

  it("is on the fixed Direct swap prompt too", () => {
    expect(directSwapPrompt(2)).toContain(REALISM_FIX.quality);
  });
});

describe("referencesFor", () => {
  const c: CharacterImagePaths = { face_sheet_path: "u/face.jpg", body_sheet_path: "u/body.jpg", reference_paths: ["u/r1.jpg", "u/r2.jpg", "u/r3.jpg"] };
  const paths = (job: string, x: CharacterImagePaths = c) => referencesFor(job, x).map((r) => r.path);

  it("variants and carousels use only the sheets", () => {
    expect(paths("variant")).toEqual(["u/face.jpg", "u/body.jpg"]);
    expect(paths("carousel")).toEqual(["u/face.jpg", "u/body.jpg"]);
    expect(paths("carousel", { ...c, body_sheet_path: null })).toEqual(["u/face.jpg"]);
  });

  it("fall back to the reference photos when there are no sheets", () => {
    expect(paths("variant", { ...c, face_sheet_path: null, body_sheet_path: null })).toEqual(["u/r1.jpg", "u/r2.jpg", "u/r3.jpg"]);
  });

  it("everything else still uses all the images", () => {
    expect(paths("inject")).toEqual(["u/face.jpg", "u/body.jpg", "u/r1.jpg", "u/r2.jpg", "u/r3.jpg"]);
    expect(paths("likeness")).toHaveLength(5);
  });
});

describe("VARIANT_OPTIONS", () => {
  it("has unique ids", () => {
    expect(new Set(VARIANT_OPTIONS.map((o) => o.id)).size).toBe(VARIANT_OPTIONS.length);
  });
});
