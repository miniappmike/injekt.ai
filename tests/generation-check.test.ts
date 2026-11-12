import { beforeEach, describe, expect, it, vi } from "vitest";

const check = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/generate/actions", () => ({ checkImageGeneration: check }));

import { checkGeneration, resetGenerationChecks } from "@/lib/generation-check";

beforeEach(() => {
  vi.useFakeTimers();
  resetGenerationChecks();
  check.mockReset();
});

describe("checkGeneration (one check shared by the Generate panel, the tray and History)", () => {
  it("shares one server request between callers within a few seconds, then checks again", async () => {
    check.mockResolvedValue({ ok: true, state: "processing" });
    await Promise.all([checkGeneration("g1"), checkGeneration("g1"), checkGeneration("g1")]);
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(8000);
    await checkGeneration("g1");
    expect(check).toHaveBeenCalledTimes(2);
    await checkGeneration("g2");
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("keeps a finished answer, so nothing asks the server about it again", async () => {
    check.mockResolvedValue({ ok: true, state: "complete", url: "u", downloadUrl: "d", expiresAt: null });
    await checkGeneration("g1");
    vi.advanceTimersByTime(60_000);
    expect(await checkGeneration("g1")).toMatchObject({ state: "complete" });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("tries again straight away after a dropped request", async () => {
    check.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, state: "processing" });
    await expect(checkGeneration("g1")).rejects.toThrow("offline");
    await checkGeneration("g1");
    expect(check).toHaveBeenCalledTimes(2);
  });
});
