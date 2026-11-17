import { describe, expect, it } from "vitest";
import { copyName, planDuplicate, type DuplicateSource } from "@/lib/character-duplicate";

const src: DuplicateSource = {
  name: "Ava Monroe",
  lore: "Lives in Lisbon",
  always_keep: "small mole under left eye",
  height: "170 cm",
  weight: "58 kg",
  profile: { identity_line: "A woman in her mid twenties", face: "oval face" },
  profile_photo_path: "u1/characters/c1/p.jpg",
  face_sheet_path: "u1/characters/c1/face.png",
  body_sheet_path: "u1/characters/c1/body.jpg",
  reference_paths: ["u1/characters/c1/r1.jpg", "u1/pinned/c1/r2.jpg", "someone-else/characters/x/r3.jpg"],
  provenance_attested_at: "2026-11-01T00:00:00Z",
  sheet_pack: {
    v: 3,
    sig: "u1/characters/c1/body.jpg|u1/characters/c1/face.png",
    face: "oval face, green eyes",
    crops: [{ kind: "face", role: "front", path: "u1/characters/c1/pack/a.jpg" }],
    at: "2026-11-02T00:00:00Z",
  },
};

describe("duplicating a character", () => {
  it("names the copy and stays inside the name limit", () => {
    expect(copyName("Ava")).toBe("Ava (copy)");
    expect(copyName("x".repeat(80))).toHaveLength(80);
  });

  it("keeps the profile build word for word", () => {
    const { row } = planDuplicate("u1", "c2", src);
    expect(row.profile).toEqual(src.profile);
    expect(row).toMatchObject({ lore: src.lore, always_keep: src.always_keep, height: src.height, weight: src.weight, user_id: "u1", id: "c2" });
    expect(row.provenance_attested_at).toBe(src.provenance_attested_at);
  });

  it("gives every image its own file under the new character", () => {
    const { row, copies } = planDuplicate("u1", "c2", src);
    expect(row.profile_photo_path).toMatch(/^u1\/characters\/c2\/[\w-]+\.jpg$/);
    expect(row.face_sheet_path).toMatch(/^u1\/characters\/c2\/[\w-]+\.png$/);
    // Order is kept (the first is her cover), pinned photos go to the copy's pinned folder, foreign paths are dropped.
    expect(row.reference_paths).toHaveLength(2);
    expect(row.reference_paths[0]).toMatch(/^u1\/characters\/c2\//);
    expect(row.reference_paths[1]).toMatch(/^u1\/pinned\/c2\//);
    expect(copies).toHaveLength(6);
    expect(copies.every((c) => c.from.startsWith("u1/") && c.to.startsWith("u1/") && !c.to.includes("/c1/"))).toBe(true);
  });

  it("carries the read sheet pack over, pointed at the copy's files", () => {
    const { row, sheet_pack } = planDuplicate("u1", "c2", src);
    const pack = sheet_pack as { sig: string; face: string; crops: { path: string; role: string }[] };
    expect(pack.face).toBe("oval face, green eyes");
    expect(pack.sig).toBe(`${row.body_sheet_path}|${row.face_sheet_path}`);
    expect(pack.crops[0].role).toBe("front");
    expect(pack.crops[0].path).toMatch(/^u1\/characters\/c2\/pack\//);
  });

  it("leaves out a failed or stale pack", () => {
    expect(planDuplicate("u1", "c2", { ...src, sheet_pack: { v: 3, sig: "x", failed: true, at: "" } }).sheet_pack).toBeNull();
    expect(planDuplicate("u1", "c2", { ...src, face_sheet_path: "u1/characters/c1/newer.jpg" }).sheet_pack).toBeNull();
  });
});
