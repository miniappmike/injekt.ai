import { describe, expect, it } from "vitest";
import { buildLikenessTask, LIKENESS_TRAITS, likenessReportText, parseLikenessReport } from "@/lib/ai/tasks/likeness";
import { extractJson } from "@/lib/ai/json";

const dataUri = "data:image/jpeg;base64,QUJD";

describe("parseLikenessReport", () => {
  const good = {
    overall: 80,
    summary: "Close, jaw is softer.",
    traits: [{ name: "Eyes", score: 9, reference: "almond", generated: "almond", fix: "keep almond eyes" }],
    fix_phrases: ["sharper jaw", "keep almond eyes"],
    edit_prompt: "Edit @image3 so the jaw matches @image1.",
  };

  it("reads a report wrapped in a code fence and chatter", () => {
    const r = parseLikenessReport("Here you go:\n```json\n" + JSON.stringify(good) + "\n```");
    expect(r.overall).toBe(80);
    expect(r.traits[0]).toMatchObject({ name: "Eyes", score: 9 });
    expect(r.fixPhrases).toEqual(["sharper jaw", "keep almond eyes"]);
    expect(r.editPrompt).toContain("@image3");
  });

  it("clamps scores, coerces numeric strings and drops unusable traits", () => {
    const r = parseLikenessReport(
      JSON.stringify({
        overall: "104",
        traits: [
          { name: "Nose", score: 15 },
          { name: "Lips", score: -2 },
          { name: "", score: 5 },
          { name: "Brows", score: "not a number" },
        ],
        fix_phrases: ["a", "b", "c", "d", "e", "f", "g", ""],
      }),
    );
    expect(r.overall).toBe(100);
    expect(r.traits).toEqual([
      { name: "Nose", score: 10, reference: "", generated: "", fix: "" },
      { name: "Lips", score: 0, reference: "", generated: "", fix: "" },
    ]);
    expect(r.fixPhrases).toHaveLength(6);
  });

  it("rejects replies with no usable score or no JSON", () => {
    expect(() => parseLikenessReport("no json")).toThrow(/did not return/);
    expect(() => parseLikenessReport("{bad json}")).toThrow(/could not be read/);
    expect(() => parseLikenessReport('{"summary":"x"}')).toThrow();
    expect(() => parseLikenessReport('{"overall":"high"}')).toThrow(/score|format/);
  });
});

describe("buildLikenessTask", () => {
  it("puts references first and the generated image last with matching labels", () => {
    const task = buildLikenessTask({
      character: { name: "Juno", profile: { face: "oval" }, always_keep: "gold chain" },
      references: [{ label: "face sheet", dataUri }, { label: "reference photo 1", dataUri }],
      generated: { label: "generated image", dataUri },
      promptUsed: "a woman in a park",
    });
    expect(task.images).toHaveLength(3);
    expect(task.prompt).toContain("@image3: generated image to check");
    expect(task.prompt).toContain("a woman in a park");
    expect(task.prompt).toContain("Face: oval");
    for (const trait of LIKENESS_TRAITS) expect(task.prompt).toContain(trait);
  });
});

describe("likenessReportText", () => {
  it("keeps the score, fixes and edit prompt for the history list", () => {
    const text = likenessReportText({ overall: 71, summary: "ok", traits: [], fixPhrases: ["sharper jaw"], editPrompt: "Edit it." });
    expect(text).toContain("Overall: 71/100");
    expect(text).toContain("- sharper jaw");
    expect(text).toContain("Edit it.");
  });
});

describe("extractJson", () => {
  it("handles nested braces", () => {
    expect(extractJson('x {"a":{"b":1}} y')).toEqual({ a: { b: 1 } });
  });
});
