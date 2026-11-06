import { describe, expect, it } from "vitest";
import { REFERENCES_RUN, revisedRun } from "@/lib/revised-run";

describe("revisedRun", () => {
  it("an Inject prompt runs from her references with its meta, never as a photo edit (that ignores the prompt)", () => {
    const r = revisedRun({ kind: "inject", meta: { edit: "e", frame: "f", target: "u/t.jpg" }, imagePath: "u/t.jpg", extraPaths: [] });
    expect(r.kind).toBe("inject");
    expect(r.meta).toEqual({ edit: "e", frame: "f" });
    expect(r.extraPaths).toEqual([]);
  });
  it("a variant sends its photo and extras again; anything else uses her references alone", () => {
    expect(revisedRun({ kind: "variant", meta: {}, imagePath: "u/p.jpg", extraPaths: ["u/x.jpg"] })).toMatchObject({ kind: "variant", extraPaths: ["u/p.jpg", "u/x.jpg"] });
    expect(revisedRun({ kind: "inject", meta: {}, imagePath: "u/t.jpg", extraPaths: [] })).toBe(REFERENCES_RUN);
    expect(revisedRun({ kind: "carousel", meta: { person: "full" }, imagePath: "u/c.jpg", extraPaths: [] })).toBe(REFERENCES_RUN);
    expect(revisedRun(null)).toEqual({ kind: "edit", extraPaths: [], meta: {}, note: expect.any(String) });
  });
});
