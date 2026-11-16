import { describe, expect, it, vi } from "vitest";
import { GENERATION_RETENTION_HOURS, generationExpiry, neverExpires, RETENTION_NOTICE, shortTimeLeft, timeLeft } from "@/lib/retention";
import { cleanupExpiredGenerations, isAuthorizedCron } from "@/lib/cleanup";

const NOW = new Date("2026-10-23T12:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("retention", () => {
  it("expires generations 72 hours after they are made and says so in the notice", () => {
    expect(GENERATION_RETENTION_HOURS).toBe(72);
    expect(generationExpiry(NOW).toISOString()).toBe("2026-10-26T12:00:00.000Z");
    expect(RETENTION_NOTICE).toContain("72 hours");
  });

  it("keeps reference sheets forever and says so", () => {
    const sheet = generationExpiry(NOW, "reference_sheet");
    expect(sheet.getFullYear()).toBe(NOW.getFullYear() + 100);
    expect(generationExpiry(NOW, "inject").toISOString()).toBe("2026-10-26T12:00:00.000Z");
    expect(neverExpires(sheet, NOW)).toBe(true);
    expect(neverExpires(inHours(72), NOW)).toBe(false);
    expect(timeLeft(sheet, NOW)).toEqual({ expired: false, label: "Never expires" });
    expect(shortTimeLeft(sheet, NOW)).toBe("Never expires");
    expect(shortTimeLeft(inHours(71), NOW)).toBe("71h left");
    expect(shortTimeLeft(new Date(NOW.getTime() + 600_000), NOW)).toBe("under 1h left");
  });

  it("describes time left in days, hours and minutes, and flags expiry", () => {
    expect(timeLeft(inHours(72), NOW)).toEqual({ expired: false, label: "3 days left" });
    expect(timeLeft(inHours(50), NOW)).toEqual({ expired: false, label: "2 days left" });
    expect(timeLeft(inHours(47), NOW)).toEqual({ expired: false, label: "47 hours left" });
    expect(timeLeft(inHours(1), NOW)).toEqual({ expired: false, label: "1 hour left" });
    expect(timeLeft(new Date(NOW.getTime() + 20 * 60_000), NOW)).toEqual({ expired: false, label: "20 minutes left" });
    expect(timeLeft(new Date(NOW.getTime() + 10_000), NOW)).toEqual({ expired: false, label: "1 minute left" });
    expect(timeLeft(NOW, NOW)).toEqual({ expired: true, label: "Expired" });
    expect(timeLeft(inHours(-5), NOW).expired).toBe(true);
    expect(timeLeft("not a date", NOW).expired).toBe(true);
  });
});

describe("isAuthorizedCron", () => {
  const secret = "a-long-enough-secret-123";
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
  });
  it("refuses everything when no usable secret is configured", () => {
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });
});

function fakeDb(batches: { id: string; output_path: string }[][], opts: { removeError?: boolean } = {}) {
  const log = { removed: [] as string[], cleared: [] as string[], cutoff: "" };
  let call = 0;
  const db = {
    from: () => ({
      select: () => ({
        not: () => ({
          lte: (_c: string, cutoff: string) => ({
            limit: async () => ((log.cutoff = cutoff), { data: batches[call++] ?? [], error: null }),
          }),
        }),
      }),
      update: () => ({ in: async (_c: string, ids: string[]) => (log.cleared.push(...ids), { error: null }) }),
    }),
    storage: {
      from: () => ({ remove: async (paths: string[]) => (opts.removeError ? { error: { message: "x" } } : (log.removed.push(...paths), { error: null })) }),
    },
  };
  return { db: db as never, log };
}

describe("cleanupExpiredGenerations", () => {
  it("deletes files, clears the paths and uses the given time as the cutoff", async () => {
    const { db, log } = fakeDb([[{ id: "g1", output_path: "u/g1.png" }, { id: "g2", output_path: "u/g2.png" }]]);
    expect(await cleanupExpiredGenerations(db, NOW, 200)).toEqual({ removed: 2 });
    expect(log.removed).toEqual(["u/g1.png", "u/g2.png"]);
    expect(log.cleared).toEqual(["g1", "g2"]);
    expect(log.cutoff).toBe(NOW.toISOString());
  });

  it("keeps going through full batches and stops when a batch is short", async () => {
    const row = (n: number) => ({ id: `g${n}`, output_path: `u/${n}.png` });
    const { db, log } = fakeDb([[row(1), row(2)], [row(3), row(4)], [row(5)]]);
    expect(await cleanupExpiredGenerations(db, NOW, 2)).toEqual({ removed: 5 });
    expect(log.cleared).toHaveLength(5);
  });

  it("does nothing when nothing has expired", async () => {
    const { db, log } = fakeDb([]);
    expect(await cleanupExpiredGenerations(db, NOW)).toEqual({ removed: 0 });
    expect(log.removed).toEqual([]);
  });

  it("clears nothing if the files could not be deleted, so the next run retries", async () => {
    const { db, log } = fakeDb([[{ id: "g1", output_path: "u/g1.png" }]], { removeError: true });
    await expect(cleanupExpiredGenerations(db, NOW)).rejects.toThrow(/delete/);
    expect(log.cleared).toEqual([]);
  });
});
