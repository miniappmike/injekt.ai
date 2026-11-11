import { describe, expect, it, vi } from "vitest";

const noop = () => {};
vi.stubGlobal("document", { visibilityState: "visible", addEventListener: noop, removeEventListener: noop });
vi.stubGlobal("window", { addEventListener: noop, removeEventListener: noop });

import { awaitOrRecover } from "@/lib/recoverable";

const never = new Promise<string>(() => {});

describe("awaitOrRecover (long calls a phone can cut off)", () => {
  it("returns the call's own answer when it arrives", async () => {
    const recover = vi.fn(async () => "saved");
    await expect(awaitOrRecover(Promise.resolve("answer"), recover, { firstCheckMs: 30, everyMs: 10 })).resolves.toBe("answer");
    expect(recover).not.toHaveBeenCalled();
  });
  it("picks up what the server saved when the call never answers", async () => {
    const recover = vi.fn().mockResolvedValueOnce(null).mockResolvedValue("saved");
    await expect(awaitOrRecover(never, recover, { firstCheckMs: 20, everyMs: 10, timeoutMs: 2000 })).resolves.toBe("saved");
    expect(recover).toHaveBeenCalledTimes(2);
  });
  it("recovers after the call fails on the way back, and gives up with its error when nothing was saved", async () => {
    await expect(awaitOrRecover(Promise.reject(new Error("Load failed")), async () => "saved", { firstCheckMs: 5000, everyMs: 10 })).resolves.toBe("saved");
    await expect(awaitOrRecover(Promise.reject(new Error("Load failed")), async () => null, { firstCheckMs: 10, everyMs: 10, timeoutMs: 60 })).rejects.toThrow("Load failed");
  });
});
