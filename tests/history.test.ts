import { describe, expect, it, vi } from "vitest";
import { HISTORY_LIMIT, historyRowImages, removeUnusedImages, saveHistory } from "@/lib/history";

type Row = { id: string; image_path: string | null; extra_image_paths?: string[] };

// Records the calls a Supabase client would receive and answers the few queries the history code makes.
// `stillUsed` / `stillUsedAsExtra` are images other history rows still point to. `noExtrasColumn` acts like a database
// where migration 0009 hasn't run; `lookupFails` makes the main lookup error.
function fakeSupabase(
  opts: { extra?: Row[]; stillUsed?: string[]; stillUsedAsExtra?: string[]; noExtrasColumn?: boolean; lookupFails?: boolean; extrasLookupFails?: boolean; noMetaColumn?: boolean } = {},
) {
  const calls = { inserted: [] as Record<string, unknown>[], deletedIds: [] as string[], removedFiles: [] as string[], range: [] as number[] };
  const client = {
    from: vi.fn(() => ({
      insert: async (rows: Record<string, unknown>[]) => {
        if (opts.noMetaColumn && rows.some((r) => "meta" in r)) return { error: { message: "Could not find the 'meta' column of 'prompt_history'" } };
        calls.inserted.push(...rows);
        return { error: null };
      },
      select: (cols: string) => {
        if (cols === "*") {
          return { order: () => ({ range: async (a: number, b: number) => (calls.range.push(a, b), { data: opts.extra ?? [] }) }) };
        }
        if (cols === "extra_image_paths") {
          return {
            overlaps: async () =>
              opts.noExtrasColumn
                ? { data: null, error: { message: "column prompt_history.extra_image_paths does not exist" } }
                : opts.extrasLookupFails
                  ? { data: null, error: { message: "canceling statement due to statement timeout" } }
                  : { data: [{ extra_image_paths: opts.stillUsedAsExtra ?? [] }], error: null },
          };
        }
        return {
          in: async () => (opts.lookupFails ? { data: null, error: { message: "timeout" } } : { data: (opts.stillUsed ?? []).map((image_path) => ({ image_path })), error: null }),
        };
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

  it("leaves the extra-images column out when nothing has extras, so saving works before migration 0009", async () => {
    const { client, calls } = fakeSupabase();
    await saveHistory(client, "u", [{ kind: "variant", label: "a", prompt: "p", imagePath: "u/a.jpg" }, { kind: "variant", label: "b", prompt: "p", extraPaths: [] }]);
    for (const row of calls.inserted) expect(row).not.toHaveProperty("extra_image_paths");
  });

  it("saves extra images, and gives every row in the batch the column", async () => {
    const { client, calls } = fakeSupabase();
    await saveHistory(client, "u", [
      { kind: "carousel", label: "a", prompt: "p", imagePath: "u/cover.jpg", extraPaths: ["u/x1.jpg", "u/x2.jpg", "u/x3.jpg"] },
      { kind: "carousel", label: "b", prompt: "p", imagePath: "u/cover.jpg" },
    ]);
    expect(calls.inserted[0].extra_image_paths).toEqual(["u/x1.jpg", "u/x2.jpg"]);
    expect(calls.inserted[1].extra_image_paths).toEqual([]);
  });

  it("saves an Inject prompt's meta, and still saves the prompt before migration 0010 adds the column", async () => {
    const meta = { edit: "New pose", frame: "face" };
    const { client, calls } = fakeSupabase();
    await saveHistory(client, "u", [{ kind: "inject", label: "a", prompt: "p", meta }, { kind: "inject", label: "b", prompt: "p" }]);
    expect(calls.inserted[0].meta).toEqual(meta);
    expect(calls.inserted[1]).not.toHaveProperty("meta");
    const old = fakeSupabase({ noMetaColumn: true });
    await saveHistory(old.client, "u", [{ kind: "inject", label: "a", prompt: "p", meta }]);
    expect(old.calls.inserted).toEqual([expect.not.objectContaining({ meta })]);
    expect(old.calls.inserted[0]).toMatchObject({ label: "a", prompt: "p" });
  });

  it("drops entries past the limit and deletes only images nothing else uses, extras included", async () => {
    const { client, calls } = fakeSupabase({
      extra: [
        { id: "old1", image_path: "u/a.jpg", extra_image_paths: ["u/x.jpg", "u/kept-extra.jpg"] },
        { id: "old2", image_path: "u/shared.jpg" },
        { id: "old3", image_path: null },
      ],
      stillUsed: ["u/shared.jpg"],
      stillUsedAsExtra: ["u/kept-extra.jpg"],
    });
    await saveHistory(client, "u", [{ kind: "likeness", label: "l", prompt: "p" }]);
    expect(calls.range[0]).toBe(HISTORY_LIMIT);
    expect(calls.deletedIds).toEqual(["old1", "old2", "old3"]);
    expect(calls.removedFiles).toEqual(["u/a.jpg", "u/x.jpg"]);
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

  it("keeps a file another entry still uses as an extra image", async () => {
    const { client, calls } = fakeSupabase({ stillUsedAsExtra: ["u/b.jpg"] });
    await removeUnusedImages(client, ["u/a.jpg", "u/b.jpg"]);
    expect(calls.removedFiles).toEqual(["u/a.jpg"]);
  });

  it("still works before migration 0009, checking only the main image", async () => {
    const { client, calls } = fakeSupabase({ noExtrasColumn: true, stillUsed: ["u/b.jpg"] });
    await removeUnusedImages(client, ["u/a.jpg", "u/b.jpg"]);
    expect(calls.removedFiles).toEqual(["u/a.jpg"]);
  });

  it("deletes nothing when it can't tell what is still in use", async () => {
    const { client, calls } = fakeSupabase({ lookupFails: true });
    await removeUnusedImages(client, ["u/a.jpg"]);
    expect(calls.removedFiles).toEqual([]);
  });

  it("deletes nothing when the extra-images lookup fails for any other reason", async () => {
    const { client, calls } = fakeSupabase({ extrasLookupFails: true });
    await removeUnusedImages(client, ["u/a.jpg"]);
    expect(calls.removedFiles).toEqual([]);
  });
});

describe("historyRowImages", () => {
  it("lists the main image and any extras, with or without the column", () => {
    expect(historyRowImages({ image_path: "a", extra_image_paths: ["b", "c"] })).toEqual(["a", "b", "c"]);
    expect(historyRowImages({ image_path: null })).toEqual([null]);
  });
});
