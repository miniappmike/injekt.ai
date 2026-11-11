import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

import { forgetGeneration, generationsOnPage, latestForRequest, rememberGeneration, requestHash } from "@/lib/pending-generations";

const job = (id: string, over: Partial<Parameters<typeof rememberGeneration>[0]> = {}) => ({
  generationId: id,
  key: `k-${id}`,
  request: "r1",
  path: "/inject",
  label: "Inject",
  prompt: "p",
  startedAt: Date.now(),
  ...over,
});

beforeEach(() => store.clear());

describe("pending generations (survive a reload in this tab)", () => {
  it("remembers jobs per page and per Generate panel, newest first for a panel", () => {
    rememberGeneration(job("a", { startedAt: Date.now() - 5000 }));
    rememberGeneration(job("b"));
    rememberGeneration(job("c", { path: "/variants", request: "r2" }));
    expect(generationsOnPage("/inject").map((p) => p.generationId)).toEqual(["a", "b"]);
    expect(latestForRequest("r1")?.generationId).toBe("b");
    expect(latestForRequest("nope")).toBeNull();
  });
  it("forgets a job, and drops ones older than 30 minutes", () => {
    rememberGeneration(job("a"));
    rememberGeneration(job("old", { startedAt: Date.now() - 31 * 60_000 }));
    expect(generationsOnPage("/inject").map((p) => p.generationId)).toEqual(["a"]);
    forgetGeneration("a");
    expect(generationsOnPage("/inject")).toEqual([]);
  });
  it("fingerprints a request stably, and differently when it changes", () => {
    expect(requestHash('{"prompt":"x"}')).toBe(requestHash('{"prompt":"x"}'));
    expect(requestHash('{"prompt":"x"}')).not.toBe(requestHash('{"prompt":"y"}'));
  });
});
