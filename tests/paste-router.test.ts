import { describe, expect, it, vi } from "vitest";
import { clipboardImages, nearestTarget } from "@/components/paste-router";
import { buildProfileTask } from "@/lib/ai/tasks/profile-builder";
import { PROPORTIONS_WORDS } from "@/lib/ai/prompts/rules";

vi.stubGlobal("innerWidth", 1200);
vi.stubGlobal("innerHeight", 800);
const box = (name: string, left: number, top: number, w = 100, h = 100) =>
  ({ name, getBoundingClientRect: () => ({ left, top, right: left + w, bottom: top + h, width: w, height: h }) }) as unknown as HTMLElement & { name: string };

describe("paste fallback: the box nearest the mouse", () => {
  const a = box("a", 0, 0);
  const b = box("b", 500, 0);
  const c = box("c", 0, 500);
  it("picks the box under or nearest the point", () => {
    expect((nearestTarget([a, b, c], 50, 50) as unknown as { name: string }).name).toBe("a");
    expect((nearestTarget([a, b, c], 450, 40) as unknown as { name: string }).name).toBe("b");
    expect((nearestTarget([a, b, c], 30, 420) as unknown as { name: string }).name).toBe("c");
  });
  it("skips hidden and off-screen boxes", () => {
    const hidden = box("hidden", 40, 40, 0, 0);
    const below = box("below", 0, 2000);
    expect((nearestTarget([hidden, below, b], 50, 50) as unknown as { name: string }).name).toBe("b");
    expect(nearestTarget([hidden, below], 50, 50)).toBeNull();
  });
});

describe("clipboardImages", () => {
  const png = { type: "image/png" } as File;
  it("reads image files, or falls back to file items", () => {
    expect(clipboardImages({ files: [png, { type: "text/plain" }], items: [] } as unknown as DataTransfer)).toEqual([png]);
    expect(clipboardImages({ files: [], items: [{ kind: "file", type: "image/png", getAsFile: () => png }] } as unknown as DataTransfer)).toEqual([png]);
    expect(clipboardImages(null)).toEqual([]);
  });
});

describe("profile builder keeps exaggerated proportions", () => {
  it("asks for full-strength wording, not mild, and counts an extreme figure as a trait", () => {
    const t = buildProfileTask({ name: "A", height: null, weight: null, always_keep: null } as never, [{ role: "her BODY reference sheet (full-body views and portraits)", dataUri: "data:" }]);
    const text = JSON.stringify(t);
    expect(text).toContain(PROPORTIONS_WORDS.slice(0, 60));
    expect(text).not.toContain("use mild");
    expect(text).toContain("Neutral wording never means smaller");
  });
});
