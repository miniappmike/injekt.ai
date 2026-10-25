import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: { SPICY_API_KEY: "sk-spicy-house" as string | undefined },
  isUnlimited: vi.fn(),
  useAllowance: vi.fn(),
  releaseAllowance: vi.fn(),
  getUserImageConfig: vi.fn(),
  resolveUserImageKey: vi.fn(),
  resolveApiKey: vi.fn(),
  submit: vi.fn(),
  quote: vi.fn(),
  poll: vi.fn(),
  safeFetchBytes: vi.fn(),
  release: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: h.env }));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: vi.fn(async () => {}) }));
vi.mock("@/lib/ssrf", () => ({ safeFetchBytes: h.safeFetchBytes }));
vi.mock("@/lib/key-store", () => ({ keyResolverDeps: {} }));
vi.mock("@/lib/keys", () => ({ resolveApiKey: h.resolveApiKey }));
vi.mock("@/lib/entitlements", () => ({
  entitlements: { isUnlimited: h.isUnlimited, useAllowance: h.useAllowance, releaseAllowance: h.releaseAllowance },
}));
vi.mock("@/lib/ai/image-setup", () => ({ getUserImageConfig: h.getUserImageConfig, resolveUserImageKey: h.resolveUserImageKey }));
vi.mock("@/lib/ai/providers/registry", () => ({ getImageProvider: () => ({ submit: h.submit, quote: h.quote, poll: h.poll }) }));

type Row = Record<string, any>;
const db = { rows: [] as Row[], ledger: [] as Row[], uploads: [] as { path: string; type?: string }[] };

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: (table: string) => ({
      insert: (r: Row) => {
        if (table === "api_ledger") {
          db.ledger.push(r);
          return Promise.resolve({ error: null });
        }
        const row = { id: `g${db.rows.length + 1}`, status: "pending", ...r };
        db.rows.push(row);
        return { select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }) };
      },
      update: (patch: Row) => {
        const q: { id?: string; statuses?: string[] } = {};
        const exec = () => {
          const row = db.rows.find((r) => r.id === q.id);
          if (!row || (q.statuses && !q.statuses.includes(row.status))) return { data: [], error: null };
          Object.assign(row, patch);
          return { data: [{ id: row.id }], error: null };
        };
        const chain: any = {
          eq: (_c: string, id: string) => ((q.id = id), chain),
          in: (_c: string, v: string[]) => ((q.statuses = v), chain),
          select: () => Promise.resolve(exec()),
          then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
        };
        return chain;
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string, _bytes: unknown, opts: { contentType?: string }) => (db.uploads.push({ path, type: opts.contentType }), { error: null }),
      }),
    },
  }),
}));

import { collectGeneration, parseGenerationRequest, quoteGeneration, startGeneration } from "@/lib/generation";
import { ApiKeyRequiredError, LimitReachedError, UserFacingError } from "@/lib/errors";

const U = "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b";
const C = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const verified = { id: U, email_confirmed_at: "2026-01-01T00:00:00Z" };
const unverified = { id: U, email_confirmed_at: null };

// The signed-in user's client: their character, signed links, and their generation rows.
function userClient(opts: { refs?: string[]; noCharacter?: boolean } = {}) {
  const refs = opts.refs ?? [`${U}/characters/${C}/face.jpg`, `${U}/characters/${C}/ref1.jpg`];
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => (table === "characters" ? (opts.noCharacter ? { data: null } : { data: { face_sheet_path: refs[0] ?? null, body_sheet_path: null, reference_paths: refs.slice(1) } }) : { data: db.rows.find((r) => r.id === id) ?? null }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })), error: null }),
        createSignedUrl: async (path: string, _ttl: number, opts?: { download?: boolean }) => ({ data: { signedUrl: `https://signed.test/${path}${opts?.download ? "?dl" : ""}` }, error: null }),
      }),
    },
  } as never;
}

const request = (over: Record<string, unknown> = {}) => ({
  kind: "inject",
  characterId: C,
  extraPaths: [`${U}/targets/t.jpg`],
  prompt: "Replace the person in @image3 with the person in @image1.",
  resolution: "2k",
  aspectRatio: "auto",
  outputFormat: "jpeg",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.rows.length = db.ledger.length = db.uploads.length = 0;
  h.env.SPICY_API_KEY = "sk-spicy-house";
  h.isUnlimited.mockResolvedValue(false);
  h.useAllowance.mockResolvedValue({ release: h.release });
  h.submit.mockResolvedValue({ jobId: "job_1", estimatedCost: "0.040000" });
  h.quote.mockResolvedValue({ estimatedCost: "0.05" });
  h.safeFetchBytes.mockResolvedValue({ bytes: Buffer.from("png"), contentType: "image/png" });
  h.getUserImageConfig.mockResolvedValue(null);
});

describe("parseGenerationRequest", () => {
  it("accepts a good request and rejects bad ones with a plain message", () => {
    expect(parseGenerationRequest(request()).kind).toBe("inject");
    expect(parseGenerationRequest(request({ kind: "reference_sheet" })).kind).toBe("reference_sheet");
    expect(() => parseGenerationRequest(request({ prompt: "   " }))).toThrow(/Write a prompt/);
    expect(() => parseGenerationRequest(request({ prompt: "x".repeat(5001) }))).toThrow(/too long/);
    expect(() => parseGenerationRequest(request({ resolution: "8k" }))).toThrow(UserFacingError);
    expect(() => parseGenerationRequest(request({ kind: "bogus" }))).toThrow(UserFacingError);
    expect(() => parseGenerationRequest(request({ extraPaths: Array(11).fill("a") }))).toThrow(UserFacingError);
  });
});

describe("startGeneration: free plan", () => {
  it("uses the platform key for the one free image, at 1k, with references first and the photo last", async () => {
    const r = await startGeneration(userClient(), verified, request());
    expect(r).toEqual({ generationId: "g1", free: true });
    expect(h.useAllowance).toHaveBeenCalledWith(U, "free_images");
    const call = h.submit.mock.calls[0][0];
    expect(call.apiKey).toBe("sk-spicy-house");
    expect(call.input.resolution).toBe("1k"); // requested 2k, free is capped
    expect(call.input.imageUrls).toEqual([
      `https://signed.test/${U}/characters/${C}/face.jpg`,
      `https://signed.test/${U}/characters/${C}/ref1.jpg`,
      `https://signed.test/${U}/targets/t.jpg`,
    ]);
    expect(call.idempotencyKey).toBe("g1"); // the row id, so a retry cannot start a second job
    expect(call.retentionSeconds).toBe(72 * 3600);
    expect(db.rows[0]).toMatchObject({ status: "processing", provider_job_id: "job_1", cost_usd: "0.040000", user_id: U });
    expect(db.rows[0].params).toMatchObject({ free: true, key_source: "server", resolution: "1k", image_count: 3 });
    expect(JSON.stringify(db.rows[0])).not.toContain("sk-spicy");
  });

  it("needs a confirmed email, and uses nothing up when it is missing", async () => {
    await expect(startGeneration(userClient(), unverified, request())).rejects.toThrow(/Confirm your email/);
    expect(h.useAllowance).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });

  it("does not take the free image when the platform has no key to give", async () => {
    h.env.SPICY_API_KEY = undefined;
    await expect(startGeneration(userClient(), verified, request())).rejects.toThrow(/isn't available/);
    expect(h.useAllowance).not.toHaveBeenCalled();
  });

  it("stops at the free limit", async () => {
    h.useAllowance.mockRejectedValue(new LimitReachedError("free_images"));
    await expect(startGeneration(userClient(), verified, request())).rejects.toBeInstanceOf(LimitReachedError);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("gives the free image back when the job never started", async () => {
    h.submit.mockRejectedValue(new Error("provider down"));
    await expect(startGeneration(userClient(), verified, request())).rejects.toThrow("provider down");
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(db.rows[0]).toMatchObject({ status: "failed", error: "provider down" });
  });

  it("gives it back when something fails before the job is sent", async () => {
    await expect(startGeneration(userClient(), verified, request({ extraPaths: ["someone-else/targets/x.jpg"] }))).rejects.toThrow(/couldn't be used/);
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.submit).not.toHaveBeenCalled();
  });
});

describe("startGeneration: Pro and admin", () => {
  beforeEach(() => h.isUnlimited.mockResolvedValue(true));

  it("uses the person's own Image key and model, at the size they chose", async () => {
    h.getUserImageConfig.mockResolvedValue({ model: "bytedance/seedream-5.0-pro/edit", storedProvider: "spicyapi", keyRole: "image" });
    h.resolveUserImageKey.mockResolvedValue("sk-spicy-theirs");
    const r = await startGeneration(userClient(), verified, request({ resolution: "2k" }));
    expect(r.free).toBe(false);
    expect(h.useAllowance).not.toHaveBeenCalled();
    expect(h.submit.mock.calls[0][0]).toMatchObject({ apiKey: "sk-spicy-theirs", model: "bytedance/seedream-5.0-pro/edit" });
    expect(h.submit.mock.calls[0][0].input.resolution).toBe("2k");
    expect(db.rows[0].params.key_source).toBe("byok");
  });

  it("sends a Pro account with no Image key to add one", async () => {
    h.resolveApiKey.mockRejectedValue(new ApiKeyRequiredError("spicyapi"));
    const err = await startGeneration(userClient(), verified, request()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiKeyRequiredError);
    expect(err.redirectTo).toBe("/settings/api-keys?provider=image");
    expect(db.rows).toHaveLength(0);
  });

  it("lets an admin fall back to the server key", async () => {
    h.resolveApiKey.mockResolvedValue({ key: "sk-spicy-house", source: "server" });
    await startGeneration(userClient(), verified, request());
    expect(h.submit.mock.calls[0][0].apiKey).toBe("sk-spicy-house");
    expect(db.rows[0].params.key_source).toBe("server");
  });
});

describe("startGeneration: inputs", () => {
  it("needs at least one picture and never accepts someone else's files", async () => {
    await expect(startGeneration(userClient({ refs: [] }), verified, request({ extraPaths: [] }))).rejects.toThrow(/at least one image/);
    await expect(startGeneration(userClient(), verified, request({ extraPaths: [`${U}x/a.jpg`] }))).rejects.toThrow(/couldn't be used/);
  });

  describe("reference sheets", () => {
    const sheet = (over: Record<string, unknown> = {}) => request({ kind: "reference_sheet", prompt: "Create a 3x3 character face sheet of the person in @image1", extraPaths: [`${U}/targets/face.jpg`], aspectRatio: "1:1", ...over });

    it("are made only from the pictures given, not from the character's existing references", async () => {
      await startGeneration(userClient(), verified, sheet());
      expect(h.submit.mock.calls[0][0].input.imageUrls).toEqual([`https://signed.test/${U}/targets/face.jpg`]);
      expect(h.submit.mock.calls[0][0].input.aspectRatio).toBe("1:1");
    });

    it("are recorded against the character, so the sheet can be saved to it", async () => {
      await startGeneration(userClient(), verified, sheet());
      expect(db.rows[0]).toMatchObject({ kind: "reference_sheet", character_id: C, user_id: U });
    });

    it("still refuse a character that isn't the person's own", async () => {
      await expect(startGeneration(userClient({ noCharacter: true }), verified, sheet())).rejects.toThrow(/Character not found/);
      expect(db.rows).toHaveLength(0);
      expect(h.submit).not.toHaveBeenCalled();
    });

    it("need a picture to work from", async () => {
      await expect(startGeneration(userClient(), verified, sheet({ extraPaths: [] }))).rejects.toThrow(/at least one image/);
    });

    it("a normal generation still sends the character's references first", async () => {
      await startGeneration(userClient(), verified, request());
      expect(h.submit.mock.calls[0][0].input.imageUrls).toEqual([
        `https://signed.test/${U}/characters/${C}/face.jpg`,
        `https://signed.test/${U}/characters/${C}/ref1.jpg`,
        `https://signed.test/${U}/targets/t.jpg`,
      ]);
    });
  });

  it("carousel and variant images send only the character's sheets, then the photo", async () => {
    for (const kind of ["carousel", "variant"]) {
      h.submit.mockClear();
      await startGeneration(userClient(), verified, request({ kind }));
      // The character has a face sheet and one reference photo; the photo is left out.
      expect(h.submit.mock.calls[0][0].input.imageUrls).toEqual([`https://signed.test/${U}/characters/${C}/face.jpg`, `https://signed.test/${U}/targets/t.jpg`]);
    }
  });

  it("works without a character, using only the pictures given", async () => {
    await startGeneration(userClient(), verified, request({ characterId: null }));
    expect(h.submit.mock.calls[0][0].input.imageUrls).toEqual([`https://signed.test/${U}/targets/t.jpg`]);
  });
});

describe("quoteGeneration", () => {
  it("shows a price to Pro accounts and never uses up the free image", async () => {
    h.isUnlimited.mockResolvedValue(true);
    h.getUserImageConfig.mockResolvedValue({ model: "m", storedProvider: "spicyapi", keyRole: "image" });
    h.resolveUserImageKey.mockResolvedValue("sk-spicy-theirs");
    expect(await quoteGeneration(userClient(), verified, request())).toEqual({ estimatedCost: "0.05" });

    h.isUnlimited.mockResolvedValue(false);
    expect(await quoteGeneration(userClient(), verified, request())).toBeNull();
    expect(h.useAllowance).not.toHaveBeenCalled();
  });
});

describe("collectGeneration", () => {
  async function started(free = true) {
    if (!free) {
      h.isUnlimited.mockResolvedValue(true);
      h.getUserImageConfig.mockResolvedValue({ model: "m", storedProvider: "spicyapi", keyRole: "image" });
      h.resolveUserImageKey.mockResolvedValue("sk-spicy-theirs");
    }
    const { generationId } = await startGeneration(userClient(), verified, request());
    return generationId;
  }

  it("reports a job that is still running without storing anything", async () => {
    const id = await started();
    h.poll.mockResolvedValue({ status: "processing" });
    expect(await collectGeneration(userClient(), verified, id)).toEqual({ state: "processing" });
    expect(db.uploads).toHaveLength(0);
  });

  it("polls with the platform key for a free image and with the person's key otherwise", async () => {
    h.poll.mockResolvedValue({ status: "processing" });
    await collectGeneration(userClient(), verified, await started(true));
    expect(h.poll.mock.calls[0][0]).toEqual({ apiKey: "sk-spicy-house", jobId: "job_1" });
    db.rows.length = 0;
    await collectGeneration(userClient(), verified, await started(false));
    expect(h.poll.mock.calls[1][0]).toEqual({ apiKey: "sk-spicy-theirs", jobId: "job_1" });
  });

  it("stores a finished image, stamps a 72 hour expiry, records the cost once, and is safe to repeat", async () => {
    const id = await started();
    h.poll.mockResolvedValue({ status: "complete", outputUrl: "https://r2.test/out.png", mime: "image/png", cost: "0.04", settled: true });
    const before = Date.now();
    const result = await collectGeneration(userClient(), verified, id);

    expect(result).toMatchObject({ state: "complete", url: `https://signed.test/${U}/${id}.png`, downloadUrl: `https://signed.test/${U}/${id}.png?dl` });
    expect(db.uploads).toEqual([{ path: `${U}/${id}.png`, type: "image/png" }]);
    const row = db.rows[0];
    expect(row).toMatchObject({ status: "complete", output_path: `${U}/${id}.png`, cost_usd: 0.04 });
    const hours = (new Date(row.expires_at).getTime() - before) / 3_600_000;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThan(72.1);
    expect(db.ledger).toEqual([
      {
        user_id: U,
        platform: "spicyapi",
        job: "image",
        feature: "image:inject",
        model: "bytedance/seedream-5.0-pro/edit",
        key_source: "server",
        status: "succeeded",
        input_tokens: null,
        output_tokens: null,
        cost_usd: 0.04,
        cost_known: true,
        cost_source: "provider",
        generation_id: id,
      },
    ]);

    // Two tabs asking again: nothing is stored or charged twice.
    await collectGeneration(userClient(), verified, id);
    expect(db.ledger).toHaveLength(1);
    expect(h.poll).toHaveBeenCalledTimes(1);
  });

  it("only records the cost for the request that actually finished the job", async () => {
    const id = await started();
    // Another request (a second tab) finishes the job while this one is still waiting on the provider.
    h.poll.mockImplementation(async () => {
      Object.assign(db.rows[0], { status: "complete", output_path: `${U}/${id}.png`, expires_at: new Date(Date.now() + 3_600_000).toISOString() });
      return { status: "complete", outputUrl: "https://r2.test/out.png", mime: "image/png", cost: "0.04" };
    });
    const result = await collectGeneration(userClient(), verified, id);
    expect(result.state).toBe("complete");
    expect(db.ledger).toHaveLength(0); // the other request records it, not this one
  });

  it("does not hand a free image back twice when two requests both see the failure", async () => {
    const id = await started();
    h.poll.mockImplementation(async () => {
      Object.assign(db.rows[0], { status: "failed", error: "x" });
      return { status: "failed", error: "x" };
    });
    await collectGeneration(userClient(), verified, id);
    expect(h.releaseAllowance).not.toHaveBeenCalled(); // the other request already handled it
  });

  it("records a failure, gives a free image back once, and explains why", async () => {
    const id = await started();
    h.poll.mockResolvedValue({ status: "failed", error: "The image model declined this request under its own content policy." });
    expect(await collectGeneration(userClient(), verified, id)).toEqual({ state: "failed", error: "The image model declined this request under its own content policy." });
    expect(db.rows[0]).toMatchObject({ status: "failed" });
    expect(h.releaseAllowance).toHaveBeenCalledWith(U, "free_images");

    await collectGeneration(userClient(), verified, id); // asking again does not give it back twice
    expect(h.releaseAllowance).toHaveBeenCalledTimes(1);
  });

  it("does not hand anything back for a Pro account's failure", async () => {
    const id = await started(false);
    h.poll.mockResolvedValue({ status: "failed", error: "x", cost: "0.04" });
    await collectGeneration(userClient(), verified, id);
    expect(h.releaseAllowance).not.toHaveBeenCalled();
    expect(db.ledger).toHaveLength(1); // a provider may still charge for a refusal, and that is recorded
    expect(db.ledger[0]).toMatchObject({ status: "failed", cost_usd: 0.04, cost_known: true, key_source: "byok" });
  });

  it("puts a failed generation on the ledger even when it cost nothing", async () => {
    const id = await started(false);
    h.poll.mockResolvedValue({ status: "failed", error: "x", cost: "0", settled: true });
    await collectGeneration(userClient(), verified, id);
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]).toMatchObject({ status: "failed", cost_usd: 0, cost_known: true, cost_source: "provider", generation_id: id });
    expect(db.rows[0].cost_usd).toBe(0);
  });

  it("records a generation whose cost the provider did not report as unpriced, not as free", async () => {
    const id = await started(false);
    h.poll.mockResolvedValue({ status: "failed", error: "The finished image could not be stored." }); // no cost given
    await collectGeneration(userClient(), verified, id);
    expect(db.ledger[0]).toMatchObject({ status: "failed", cost_usd: 0, cost_known: false, cost_source: null });
    expect(db.rows[0]).not.toHaveProperty("cost_usd", 0);
  });

  it("says so when the generation does not exist", async () => {
    await expect(collectGeneration(userClient(), verified, "nope")).rejects.toThrow(/not found/);
  });
});
