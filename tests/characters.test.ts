import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: vi.fn() }));

import { characterInput, parseProfile, profilesEqual } from "@/lib/characters";
import { safeNext } from "@/lib/auth";

describe("characterInput", () => {
  const base = { name: " Juno ", always_keep: "", height: "", weight: "", lore: "", provenance: "on" };

  it("trims and nulls empty optionals", () => {
    const r = characterInput.parse(base);
    expect(r.name).toBe("Juno");
    expect(r.always_keep).toBeNull();
  });

  it("requires the provenance attestation", () => {
    expect(characterInput.safeParse({ ...base, provenance: undefined }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(characterInput.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});

describe("profile helpers", () => {
  it("parses only known fields and skips blanks", () => {
    const fd = new FormData();
    fd.set("profile_face", " oval ");
    fd.set("profile_hair", "  ");
    fd.set("profile_evil", "x");
    expect(parseProfile(fd)).toEqual({ face: "oval" });
  });

  it("detects changes", () => {
    expect(profilesEqual({ face: "a" }, { face: "a" })).toBe(true);
    expect(profilesEqual({ face: "a" }, { face: "b" })).toBe(false);
    expect(profilesEqual({}, { hair: "" })).toBe(true);
  });
});

describe("safeNext", () => {
  it("allows relative paths only", () => {
    expect(safeNext("/inject")).toBe("/inject");
    expect(safeNext("//evil.com")).toBe("/characters");
    expect(safeNext("https://evil.com")).toBe("/characters");
    expect(safeNext(null)).toBe("/characters");
  });
});
