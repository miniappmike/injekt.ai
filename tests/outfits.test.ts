import { describe, expect, it } from "vitest";
import { addOutfit, listOutfits, MAX_OUTFITS } from "@/lib/outfits";

function fake(opts: { count?: number; missingTable?: boolean } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      select: (_cols: string, o?: { head?: boolean }) =>
        o?.head
          ? Promise.resolve({ count: opts.count ?? 0 })
          : { order: () => ({ limit: async () => (opts.missingTable ? { data: null, error: { message: "relation outfits does not exist" } } : { data: [{ id: "1", name: "Gym", text: "t" }], error: null }) }) },
      insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => (inserted.push(row), { data: { id: "n", name: row.name, text: row.text }, error: null }) }) }),
    }),
  };
  return { client: client as never, inserted };
}

describe("saved outfits", () => {
  it("saves a trimmed name and text for the user", async () => {
    const { client, inserted } = fake();
    expect(await addOutfit(client, "u", { name: "  Gym set ", text: " black sports bra " })).toEqual({ id: "n", name: "Gym set", text: "black sports bra" });
    expect(inserted[0]).toEqual({ user_id: "u", name: "Gym set", text: "black sports bra" });
  });
  it("needs a name and text, and stops at the limit", async () => {
    await expect(addOutfit(fake().client, "u", { name: " ", text: "x" })).rejects.toThrow(/name/);
    await expect(addOutfit(fake().client, "u", { name: "x", text: "" })).rejects.toThrow(/no outfit/);
    await expect(addOutfit(fake({ count: MAX_OUTFITS }).client, "u", { name: "x", text: "y" })).rejects.toThrow(/up to 50/);
  });
  it("lists nothing before the migration runs", async () => {
    expect(await listOutfits(fake({ missingTable: true }).client)).toEqual([]);
    expect(await listOutfits(fake().client)).toHaveLength(1);
  });
});
