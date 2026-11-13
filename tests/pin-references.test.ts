import { describe, expect, it } from "vitest";
import { parsePinCheck, PIN_CHECK_PROMPT } from "@/lib/ai/prompts/pin";
import { isPinnedPath, MAX_REFERENCE_PHOTOS, pinnedFolder } from "@/lib/uploads";

describe("pinning generated images to a character", () => {
  it("allows up to 5 reference photos", () => {
    expect(MAX_REFERENCE_PHOTOS).toBe(5);
  });

  it("only pins when the check clearly says there is no nudity", () => {
    expect(parsePinCheck({ nudity: false })).toEqual({ clear: true, reason: "" });
    expect(parsePinCheck({ nudity: true, reason: "visible nipples" })).toEqual({ clear: false, reason: "visible nipples" });
    // Unreadable or missing answers never pin.
    expect(parsePinCheck(null).clear).toBe(false);
    expect(parsePinCheck({ nudity: "no" }).clear).toBe(false);
    expect(PIN_CHECK_PROMPT).toContain("visible genitals");
    expect(PIN_CHECK_PROMPT).toContain("Swimwear, lingerie, underwear");
  });

  it("pinned files are kept when taken off her references", () => {
    const pinned = `u1/${pinnedFolder("c1")}/a.jpg`;
    expect(isPinnedPath(pinned)).toBe(true);
    expect(isPinnedPath("u1/characters/c1/b.jpg")).toBe(false);
  });
});
