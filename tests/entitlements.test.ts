import { describe, expect, it, vi } from "vitest";
import { createEntitlements, isEmailVerified, type EntitlementDeps } from "@/lib/entitlements-core";
import { FREE_LIMITS, limitMessage } from "@/lib/limits";
import { LimitReachedError } from "@/lib/errors";
import { toFailure } from "@/lib/ai/failure";

function setup(profile: { plan: "free" | "pro"; is_admin: boolean } | null, used: Record<string, number> = {}) {
  const counts = { ...used };
  const deps: EntitlementDeps = {
    getProfile: vi.fn(async () => profile),
    consume: vi.fn(async (_u, key, limit) => {
      if ((counts[key] ?? 0) >= limit) return false;
      counts[key] = (counts[key] ?? 0) + 1;
      return true;
    }),
    release: vi.fn(async (_u, key) => {
      counts[key] = Math.max((counts[key] ?? 0) - 1, 0);
    }),
    getUsage: vi.fn(async () => counts),
  };
  return { deps, counts, ent: createEntitlements(deps) };
}

describe("free plan allowances", () => {
  it("allows the free number of profile builds, then throws LimitReachedError", async () => {
    const { ent } = setup({ plan: "free", is_admin: false });
    for (let i = 0; i < FREE_LIMITS.profile_builds; i++) await ent.useAllowance("u", "profile_builds");
    await expect(ent.useAllowance("u", "profile_builds")).rejects.toBeInstanceOf(LimitReachedError);
  });

  it("gives a unit back on release, only once", async () => {
    const { ent, deps, counts } = setup({ plan: "free", is_admin: false });
    const a = await ent.useAllowance("u", "free_images");
    expect(counts.free_images).toBe(1);
    await a.release();
    await a.release();
    expect(counts.free_images).toBe(0);
    expect(deps.release).toHaveBeenCalledTimes(1);
    await ent.useAllowance("u", "free_images");
  });

  it("does not count pro or admin accounts", async () => {
    for (const profile of [{ plan: "pro" as const, is_admin: false }, { plan: "free" as const, is_admin: true }]) {
      const { ent, deps } = setup(profile);
      for (let i = 0; i < 20; i++) await (await ent.useAllowance("u", "profile_builds")).release();
      expect(deps.consume).not.toHaveBeenCalled();
      expect(await ent.remaining("u")).toEqual({ profile_builds: null, free_images: null });
    }
  });

  it("treats a missing profile as free", async () => {
    const { ent } = setup(null);
    expect(await ent.isUnlimited("u")).toBe(false);
  });

  it("reports what is left and never below zero", async () => {
    const { ent } = setup({ plan: "free", is_admin: false }, { profile_builds: 3, free_images: 5 });
    expect(await ent.remaining("u")).toEqual({ profile_builds: FREE_LIMITS.profile_builds - 3, free_images: 0 });
  });

  it("does not hand out an allowance when the check itself fails", async () => {
    const { deps, ent } = setup({ plan: "free", is_admin: false });
    (deps.consume as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db down"));
    await expect(ent.useAllowance("u", "profile_builds")).rejects.toThrow("db down");
  });
});

describe("Pro-only features", () => {
  it("blocks prompt writing on the free plan and allows pro and admin", async () => {
    await expect(setup({ plan: "free", is_admin: false }).ent.requirePro("u", "prompt_writer")).rejects.toBeInstanceOf(LimitReachedError);
    await expect(setup(null).ent.requirePro("u", "prompt_writer")).rejects.toBeInstanceOf(LimitReachedError);
    await expect(setup({ plan: "pro", is_admin: false }).ent.requirePro("u", "prompt_writer")).resolves.toBeUndefined();
    await expect(setup({ plan: "free", is_admin: true }).ent.requirePro("u", "prompt_writer")).resolves.toBeUndefined();
  });

  it("keeps the free plan to 1 character and 3 profile generations", () => {
    expect(FREE_LIMITS.characters).toBe(1);
    expect(FREE_LIMITS.profile_builds).toBe(3);
    expect(toFailure(new LimitReachedError("prompt_writer"))).toEqual({ ok: false, error: limitMessage("prompt_writer"), stop: "limit" });
    expect(limitMessage("profile_builds")).toContain("3 free profile generations");
  });
});

describe("limits copy and errors", () => {
  it("turns a limit error into a friendly, specific message", () => {
    expect(toFailure(new LimitReachedError("profile_builds"))).toEqual({ ok: false, error: limitMessage("profile_builds"), stop: "limit" });
    expect(limitMessage("profile_builds")).toContain(String(FREE_LIMITS.profile_builds));
    expect(limitMessage("characters")).toContain("1 character");
  });
  it("knows whether an email is confirmed", () => {
    expect(isEmailVerified({ email_confirmed_at: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(isEmailVerified({ email_confirmed_at: null })).toBe(false);
    expect(isEmailVerified({})).toBe(false);
  });
});
