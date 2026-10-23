import { describe, expect, it } from "vitest";
import {
  attachOrder,
  buildCarouselTask,
  buildVariantTask,
  parseCarousel,
  parseVariants,
  VARIANT_OPTIONS,
} from "@/lib/ai/tasks/variants";

const uri = "data:image/jpeg;base64,QUJD";
const refs = [{ label: "face sheet", dataUri: uri }, { label: "reference photo 1", dataUri: uri }];
const image = { label: "image to edit", dataUri: uri };
const character = { name: "Juno", profile: { face: "oval" }, always_keep: "gold chain" };

describe("buildVariantTask", () => {
  it("labels references first and the image last, and lists only the chosen changes in order", () => {
    const task = buildVariantTask({ character, references: refs, image, options: ["camera", "pose"] });
    expect(task.images).toHaveLength(3);
    expect(task.text).toContain("@image3: image to edit");
    expect(task.instructions).toContain('start with "Edit @image3."');
    const pose = task.instructions.indexOf("Pose:");
    const camera = task.instructions.indexOf("Camera angle:");
    expect(pose).toBeGreaterThan(-1);
    expect(pose).toBeLessThan(camera); // order follows VARIANT_OPTIONS, not click order
    expect(task.instructions).not.toContain("Hairstyle:");
    expect(task.text).toContain("Always keep: gold chain");
  });

  it("works with no character: just the image as @image1", () => {
    const task = buildVariantTask({ character: null, references: [], image, options: ["pose"], note: "beach" });
    expect(task.images).toHaveLength(1);
    expect(task.text).toContain("@image1: image to edit");
    expect(task.text).toContain("No saved character");
    expect(task.text).toContain("beach");
  });
});

describe("buildCarouselTask", () => {
  it("asks for slides 2 to N and references the cover", () => {
    const task = buildCarouselTask({ character, references: refs, cover: { label: "cover image", dataUri: uri }, slides: 5 });
    expect(task.instructions).toContain("5-slide");
    expect(task.instructions).toContain("exactly 4 entries");
    expect(task.text).toContain("@image3: cover image");
    expect(task.instructions).toContain("@image1");
  });
});

describe("attachOrder", () => {
  it("tells the user which image is which, in order", () => {
    expect(attachOrder(refs, "image to edit")).toEqual([
      "@image1: face sheet",
      "@image2: reference photo 1",
      "@image3: image to edit",
    ]);
    expect(attachOrder([], "cover image")).toEqual(["@image1: cover image"]);
  });
});

describe("parseVariants", () => {
  it("reads variants from a fenced reply, caps the count and fills missing labels", () => {
    const reply = '```json\n{"variants":[{"label":"Pose · stairs","prompt":"Edit @image3. New pose."},{"label":"","prompt":"Edit @image3. Other."},{"label":"x","prompt":"third"}]}\n```';
    const out = parseVariants(reply, 2);
    expect(out).toEqual([
      { label: "Pose · stairs", prompt: "Edit @image3. New pose." },
      { label: "Variant 2", prompt: "Edit @image3. Other." },
    ]);
  });
  it("drops empty prompts and rejects empty or malformed replies", () => {
    expect(parseVariants('{"variants":[{"label":"a","prompt":""},{"label":"b","prompt":"ok"}]}', 5)).toEqual([{ label: "b", prompt: "ok" }]);
    expect(() => parseVariants('{"variants":[]}', 5)).toThrow(/did not write/);
    expect(() => parseVariants('{"nope":1}', 5)).toThrow(/unexpected/);
    expect(() => parseVariants("no json", 5)).toThrow();
  });
});

describe("parseCarousel", () => {
  it("reads slides, caps the count and fills missing titles", () => {
    const out = parseCarousel('{"slides":[{"title":"New spot","prompt":"p1"},{"title":"","prompt":"p2"},{"title":"x","prompt":"p3"}]}', 2);
    expect(out).toEqual([{ title: "New spot", prompt: "p1" }, { title: "Slide 3", prompt: "p2" }]);
    expect(() => parseCarousel('{"slides":[]}', 4)).toThrow(/did not plan/);
  });
});

describe("VARIANT_OPTIONS", () => {
  it("has unique ids", () => {
    expect(new Set(VARIANT_OPTIONS.map((o) => o.id)).size).toBe(VARIANT_OPTIONS.length);
  });
});
