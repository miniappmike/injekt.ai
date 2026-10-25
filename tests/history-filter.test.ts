import { describe, expect, it } from "vitest";
import { filterHistory, historyCharacters } from "@/lib/history-filter";
import { historyGenerationKind, type HistoryItem } from "@/lib/history-types";

const item = (over: Partial<HistoryItem>): HistoryItem => ({
  id: "1",
  characterId: "c1",
  characterName: "Juno",
  kind: "inject",
  label: "Inject · Juno",
  prompt: "Use @image1 as the strict identity reference",
  thumbnail: null,
  imagePath: null,
  extraPaths: [],
  createdAt: "2026-10-23T12:00:00Z",
  ...over,
});

const items = [
  item({ id: "a" }),
  item({ id: "b", characterId: "c2", characterName: "Audra", label: "Variant · Parking lot jump", prompt: "Edit @image2. Keep the person exactly." }),
  item({ id: "c", characterId: null, characterName: "No character", label: "Carousel · slide 2", prompt: "A flat lay of the outfit" }),
];

describe("filterHistory", () => {
  it("returns everything for an empty search and no character", () => {
    expect(filterHistory(items, "", "").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
  it("searches labels and prompts, ignoring case and extra spaces", () => {
    expect(filterHistory(items, "  PARKING ", "").map((i) => i.id)).toEqual(["b"]);
    expect(filterHistory(items, "flat lay", "").map((i) => i.id)).toEqual(["c"]);
    expect(filterHistory(items, "@image1", "").map((i) => i.id)).toEqual(["a"]);
  });
  it("filters by character and combines with search", () => {
    expect(filterHistory(items, "", "c2").map((i) => i.id)).toEqual(["b"]);
    expect(filterHistory(items, "inject", "c2")).toEqual([]);
  });
  it("returns nothing when nothing matches", () => {
    expect(filterHistory(items, "zzz", "")).toEqual([]);
  });
});

describe("historyCharacters", () => {
  it("lists each character once, sorted by name, skipping entries without one", () => {
    expect(historyCharacters([...items, item({ id: "d" })])).toEqual([
      { id: "c2", name: "Audra" },
      { id: "c1", name: "Juno" },
    ]);
  });
});

describe("historyGenerationKind", () => {
  it("runs inject, variant and carousel prompts as their own image job", () => {
    expect(historyGenerationKind("inject")).toBe("inject");
    expect(historyGenerationKind("variant")).toBe("variant");
    expect(historyGenerationKind("carousel")).toBe("carousel");
  });

  it("gives likeness reports and unknown kinds no Generate button", () => {
    for (const k of ["likeness", "profile", "", "toString", "__proto__"]) expect(historyGenerationKind(k)).toBeNull();
  });
});
