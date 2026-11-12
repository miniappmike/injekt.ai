import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { deleteAccount, deleteUserFiles, USER_BUCKETS } from "@/lib/account-deletion";

// A fake storage: bucket -> file paths. list() shows one folder level, like Supabase (folders have no id).
function fakeDb(files: Record<string, string[]>, opts: { deleteUserError?: boolean } = {}) {
  const removed: Record<string, string[]> = {};
  const deleted: string[] = [];
  const db = {
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string, o: { limit: number; offset: number }) => {
          const under = (files[bucket] ?? []).filter((p) => p.startsWith(prefix + "/")).map((p) => p.slice(prefix.length + 1));
          const names = [...new Set(under.map((r) => r.split("/")[0]))].sort();
          const items = names.map((n) => (under.includes(n) ? { name: n, id: `id-${n}` } : { name: n, id: null }));
          return { data: items.slice(o.offset, o.offset + o.limit), error: null };
        },
        remove: async (paths: string[]) => {
          (removed[bucket] ??= []).push(...paths);
          return { error: null };
        },
      }),
    },
    auth: { admin: { deleteUser: async (id: string) => (deleted.push(id), { error: opts.deleteUserError ? { message: "x" } : null }) } },
  };
  return { db: db as never, removed, deleted };
}

describe("deleting an account", () => {
  it("removes every file in the person's folders, however deep, and nobody else's", async () => {
    const { db, removed } = fakeDb({
      "character-media": ["u1/characters/c1/face.jpg", "u1/characters/c1/refs/a.jpg", "u1/targets/t.jpg", "u2/characters/c9/face.jpg"],
      generations: ["u1/g1.png"],
      references: [],
    });
    expect(await deleteUserFiles(db, "u1")).toBe(4);
    expect(removed["character-media"].sort()).toEqual(["u1/characters/c1/face.jpg", "u1/characters/c1/refs/a.jpg", "u1/targets/t.jpg"]);
    expect(removed.generations).toEqual(["u1/g1.png"]);
    expect(USER_BUCKETS).toContain("references");
  });

  it("deletes the files first, then the login", async () => {
    const { db, removed, deleted } = fakeDb({ generations: ["u1/g1.png"] });
    await deleteAccount(db, "u1");
    expect(removed.generations).toEqual(["u1/g1.png"]);
    expect(deleted).toEqual(["u1"]);
    await expect(deleteAccount(fakeDb({}, { deleteUserError: true }).db, "u1")).rejects.toThrow(/Couldn't delete your account/);
  });
});
