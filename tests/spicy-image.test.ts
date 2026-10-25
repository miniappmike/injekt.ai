import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSpicyInput, describeTaskFailure, spicyapi, translateImageRefs } from "@/lib/ai/providers/spicyapi";
import { ProviderError } from "@/lib/ai/providers/text";
import type { ImageJobInput } from "@/lib/ai/providers/types";

afterEach(() => vi.unstubAllGlobals());

const input: ImageJobInput = {
  prompt: "Replace the person in @image3 with the person in @image1 to @image2. Keep @IMAGE3 lighting.",
  imageUrls: ["https://x.test/a.jpg", "https://x.test/b.jpg", "https://x.test/c.jpg"],
  resolution: "1.5k",
  aspectRatio: "4:5",
  outputFormat: "png",
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
}

// Answers like SpicyAPI: JSON envelopes, with the paths the SDK uses.
function fakeSpicy(handlers: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k.toLowerCase()] = v));
      const call: Call = { url: String(url), method: init?.method ?? "GET", headers, body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      const { status = 200, body } = handlers(call);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const ok = (data: unknown) => ({ body: { code: 200, msg: "success", request_id: "req_1", data } });

describe("prompt and input mapping", () => {
  it("turns @imageN labels into the Image N wording Seedream understands", () => {
    expect(translateImageRefs("Use @image1 and @IMAGE12, not @imagery")).toBe("Use Image 1 and Image 12, not @imagery");
  });

  it("builds only documented fields", () => {
    const out = buildSpicyInput(input);
    expect(Object.keys(out).sort()).toEqual(["aspect_ratio", "background", "image_urls", "output_format", "prompt", "resolution"]);
    expect(out).toMatchObject({ resolution: "1.5k", aspect_ratio: "4:5", output_format: "png", background: "opaque" });
    expect(out.prompt).toBe("Replace the person in Image 3 with the person in Image 1 to Image 2. Keep Image 3 lighting.");
    expect(out.image_urls).toEqual(input.imageUrls);
  });

  it("caps the prompt at the documented 5,000 characters", () => {
    expect(buildSpicyInput({ ...input, prompt: "x".repeat(6000) }).prompt).toHaveLength(5000);
  });
});

describe("spicyapi image provider", () => {
  it("submits to createTask with the key, an idempotency key and a shortened retention", async () => {
    const calls = fakeSpicy(() => ({ status: 202, body: { code: 200, msg: "success", data: { taskId: "job_1", state: "queued", estimatedCost: "0.040000" } } }));
    const job = await spicyapi.submit({ apiKey: "sk-spicy-abc", model: "bytedance/seedream-5.0-pro/edit", input, idempotencyKey: "gen-1", retentionSeconds: 259200 });
    expect(job).toEqual({ jobId: "job_1", estimatedCost: "0.040000" });
    const call = calls[0];
    expect(call.url).toBe("https://api.spicyapi.ai/api/v1/jobs/createTask");
    expect(call.method).toBe("POST");
    expect(call.headers.authorization).toBe("Bearer sk-spicy-abc");
    expect(call.headers["idempotency-key"]).toBe("gen-1");
    expect(call.headers["x-spicy-retention"]).toBe("259200");
    expect(call.body.model).toBe("bytedance/seedream-5.0-pro/edit");
    expect(call.body.input.prompt).toContain("Image 3");
  });

  it("maps task states to simple statuses and waits while files are still being copied", async () => {
    const state = (s: string, extra = {}) => ({ taskId: "job_1", model: "m", state: s, cost: "0.04", settled: false, createdAt: "2026-10-23T00:00:00Z", ...extra });
    const poll = async (record: unknown) => {
      fakeSpicy(() => ok(record));
      return spicyapi.poll({ apiKey: "k", jobId: "job_1" });
    };
    expect(await poll(state("queued"))).toEqual({ status: "pending" });
    expect(await poll(state("running"))).toEqual({ status: "processing" });
    // Succeeded, but the file is still being copied: not done yet.
    expect(await poll(state("succeeded", { output: { assets: [{ pending: true, mime: "image/png" }] } }))).toEqual({ status: "processing" });
    const done = await poll(state("succeeded", { settled: true, output: { assets: [{ url: "https://r2.test/out.png", mime: "image/png", expiresAt: "x" }] } }));
    expect(done).toEqual({ status: "complete", outputUrl: "https://r2.test/out.png", mime: "image/png", cost: "0.04", settled: true });
  });

  it("explains failures in plain words and never invents a result", async () => {
    const poll = async (record: unknown) => {
      fakeSpicy(() => ok(record));
      return spicyapi.poll({ apiKey: "k", jobId: "job_1" });
    };
    const base = { taskId: "job_1", model: "m", cost: "0", settled: true, createdAt: "x" };
    const refused = await poll({ ...base, state: "failed", errorCode: "content_rejected" });
    expect(refused.status).toBe("failed");
    expect(refused.error).toContain("content policy");
    expect((await poll({ ...base, state: "expired", errorCode: "timeout" })).error).toContain("took too long");
    const lost = await poll({ ...base, state: "succeeded", output: { assets: [{ unavailable: true }] } });
    expect(lost.status).toBe("failed");
    expect(describeTaskFailure(undefined, "raw message")).toBe("raw message");
    expect(describeTaskFailure()).toContain("couldn't be generated");
  });

  it("checks a key with a free balance request", async () => {
    const calls = fakeSpicy(() => ok({ available: "4.93", held: "0", total: "4.93" }));
    expect(await spicyapi.check({ apiKey: "k" })).toEqual({ detail: "Available balance: $4.93" });
    expect(calls[0].method).toBe("GET");
  });

  it("turns the common API errors into advice, branching on the code", async () => {
    const failWith = async (status: number, code: number, msg = "x") => {
      fakeSpicy(() => ({ status, body: { code, msg, request_id: "req_9" } }));
      return spicyapi
        .submit({ apiKey: "k", model: "m", input, idempotencyKey: "i" })
        .then(() => null)
        .catch((e) => e);
    };
    const balance = await failWith(402, 40201);
    expect(balance).toBeInstanceOf(ProviderError);
    expect(balance.message).toContain("balance is too low");
    expect((await failWith(402, 40202)).message).toContain("spend cap");
    expect((await failWith(403, 40301)).message).toContain("allowed to use that image model");
    expect((await failWith(401, 401)).message).toContain("rejected this API key");
    expect((await failWith(400, 400, "unknown field")).message).toContain("unknown field");
  });
});
