import { describe, expect, it } from "vitest";
import { listingPitchPrompt, parseListingPitch, PITCH_BIO_MAX } from "@/lib/ai/prompts/listing-pitch";
import { PREVIEW_SOURCES } from "@/lib/marketplace/listing-input";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";

describe("listing pitch", () => {
  it("asks for an AI niche tagline and a short bio from her header", () => {
    const p = listingPitchPrompt({ name: "Soo-jin", header: "A young woman with a sleek pink and black bob.", lore: null });
    expect(p).toContain("Soo-jin");
    expect(p).toContain("sleek pink and black bob");
    expect(p).toContain('"AI Gamer"');
    expect(p).toContain(`at most ${PITCH_BIO_MAX} characters`);
  });

  it("keeps the tagline as AI plus a niche and the bio within 50 characters", () => {
    expect(parseListingPitch({ tagline: "Gamer", bio: "x" })).toEqual({ tagline: "AI Gamer", bio: "x" });
    expect(parseListingPitch({ tagline: "ai alt girl.", bio: "#pink hair, dark heart 🖤" }).tagline).toBe("AI alt girl");
    const long = parseListingPitch({ tagline: "AI Traveler", bio: "Chasing sunsets and street food across Seoul and Tokyo every week 🌸" });
    expect(Array.from(long.bio).length).toBeLessThanOrEqual(PITCH_BIO_MAX);
    expect(long.bio).toBe("Chasing sunsets and street food across Seoul and");
    expect(parseListingPitch(null)).toEqual({ tagline: "", bio: "" });
  });

  it("offers every reference photo she can have as a preview", () => {
    expect(PREVIEW_SOURCES).toContain(`reference:${MAX_REFERENCE_PHOTOS - 1}`);
    expect(PREVIEW_SOURCES).toHaveLength(3 + MAX_REFERENCE_PHOTOS);
  });
});
