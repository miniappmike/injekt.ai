import { describe, expect, it, vi } from "vitest";
import { HISTORY_LIMIT, removeUnusedImages, saveHistory } from "@/lib/history";

// Records the calls a Supabase client would receive and answers the few queries the history code makes.
function fakeSupabase(opts: { extra?: { id: string; image_path: string | null }[]; stillUsed?: string[] } = {}) {
  const calls = { inserted: [] as unknown[], deletedIds: [] as string[], removedFiles: [] as string[], range: [] as number[] };
  const client = {
    from: vi.fn(() => ({
      insert: async (rows: unknown[]) => void calls.inserted.push(...rows),
      select: (cols: string) => {
        if (cols === "id, image_path") {
          return { order: () => ({ range: async (a: number, b: number) => (calls.range.push(a, b), { data: opts.extra ?? [] }) }) };
        }
        return { in: async () => ({ data: (opts.stillUsed ?? []).map((image_path) => ({ image_path })) }) };
      },
      delete: () => ({ in: async (_c: string, ids: string[]) => void calls.deletedIds.push(...ids) }),
    })),
    storage: { from: () => ({ remove: async (paths: string[]) => void calls.removedFiles.push(...paths) }) },
  };
  return { client: client as never, calls };
}

describe("saveHistory", () => {
  it("does nothing for an empty list", async () => {
    const { client, calls } = fakeSupabase();
    await saveHistory(client, "u", []);
    expect(calls.inserted).toEqual([]);
  });

  it("inserts rows for the user and trims long text", async () => {
    const { client, calls } = fakeSupabase();
    await saveHistory(client, "u1", [{ kind: "inject", label: "L".repeat(500), prompt: "P".repeat(30000), characterId: "c1", imagePath: "u1/targets/a.jpg" }]);
    const row = calls.inserted[0] as Record<string, string | null>;
    expect(row).toMatchObject({ user_id: "u1", character_id: "c1", kind: "inject", image_path: "u1/targets/a.jpg" });
    expect(row.label).toHaveLength(200);
    expect(row.prompt).toHaveLength(20000);
  });

  it("drops entries past the limit and deletes only images nothing else uses", async () => {
    const { client, calls } = fakeSupabase({
      extra: [{ id: "old1", image_path: "u/a.jpg" }, { id: "old2", image_path: "u/shared.jpg" }, { id: "old3", image_path: null }],
      stillUsed: ["u/shared.jpg"],
    });
    await saveHistory(client, "u", [{ kind: "likeness", label: "l", prompt: "p" }]);
    expect(calls.range[0]).toBe(HISTORY_LIMIT);
    expect(calls.deletedIds).toEqual(["old1", "old2", "old3"]);
    expect(calls.removedFiles).toEqual(["u/a.jpg"]);
  });
});

describe("removeUnusedImages", () => {
  it("skips empty input and removes duplicates once", async () => {
    const { client, calls } = fakeSupabase();
    await removeUnusedImages(client, [null, null]);
    expect(calls.removedFiles).toEqual([]);
    await removeUnusedImages(client, ["u/a.jpg", "u/a.jpg"]);
    expect(calls.removedFiles).toEqual(["u/a.jpg"]);
  });
});
