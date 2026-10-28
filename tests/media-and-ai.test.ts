import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { stripAndNormalize, parseDataUri } from "@/lib/images";
import { isOwnPath, isOwnRawPath, isPendingPath, readDraftImages } from "@/lib/uploads";
import { validateApiKey } from "@/lib/key-validation";
import { anthropicBackend, describeProviderError, openaiCompatBackend, readUsage, spicyapiBackend, ProviderError } from "@/lib/ai/providers/text";
import { buildProfileTask, parseProfileResponse, profileBlock, PROFILE_ROLES } from "@/lib/ai/tasks/profile-builder";
import { referenceList } from "@/lib/character-images";
import { detectProvider } from "@/lib/ai/providers/detect";
import { dropRole, effectiveRole, normalizeBaseUrl, readRoles, shareRole } from "@/lib/ai/roles";
import { resolveRoleSetup } from "@/lib/ai/role-setup";
import { getTextBackend } from "@/lib/ai/providers/text";

// Hostnames resolve to a public address so tests never touch real DNS.
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34" }]) }));

afterEach(() => vi.unstubAllGlobals());

describe("stripAndNormalize", () => {
  it("removes EXIF metadata and keeps a valid JPEG", async () => {
    const withExif = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#888" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-owner", Make: "SecretCam" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();

    const clean = await stripAndNormalize(withExif);
    const meta = await sharp(clean).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(clean.includes(Buffer.from("secret-owner"))).toBe(false);
  });

  it("applies EXIF orientation before dropping it", async () => {
    const rotated = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#444" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const meta = await sharp(await stripAndNormalize(rotated)).metadata();
    expect(meta.width).toBe(40);
    expect(meta.height).toBe(80);
  });

  it("rejects non-image and unsupported input", async () => {
    await expect(stripAndNormalize(Buffer.from("not an image"))).rejects.toThrow();
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer();
    await expect(stripAndNormalize(gif)).rejects.toThrow(/Unsupported/);
  });
});

describe("upload paths", () => {
  it("only accepts the caller's own raw uploads", () => {
    expect(isOwnRawPath("u1", "u1/raw/abc")).toBe(true);
    expect(isOwnRawPath("u1", "u2/raw/abc")).toBe(false);
    expect(isOwnRawPath("u1", "u1/raw/../../u2/x")).toBe(false);
    expect(isOwnRawPath("u1", "u1/characters/x.jpg")).toBe(false);
    expect(isOwnPath("u1", "u1/characters/c/x.jpg")).toBe(true);
    expect(isOwnPath("u1", "u10/characters/x.jpg")).toBe(false);
  });
});

describe("validateApiKey", () => {
  it("accepts a normal key and trims whitespace", () => {
    expect(validateApiKey("  sk-ant-abc123456  ")).toEqual({ ok: true, key: "sk-ant-abc123456" });
  });
  it("rejects masked bullets, spaces and short keys", () => {
    expect(validateApiKey("sb_secret_g5sLX••••••••••").ok).toBe(false);
    expect(validateApiKey("sk-abc def 12345").ok).toBe(false);
    expect(validateApiKey("short").ok).toBe(false);
  });
});

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const dataUri = "data:image/jpeg;base64,QUJD";

describe("text backends", () => {
  it("sends Anthropic requests with the key in a header and images as base64 blocks", async () => {
    const fetchFn = mockFetch({ content: [{ type: "text", text: "hello" }], usage: { input_tokens: 12, output_tokens: 3 } });
    const out = await anthropicBackend("claude-x").complete({ system: "SYS", text: "hi", images: [dataUri], apiKey: "k-123" });
    expect(out.text).toBe("hello");
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k-123");
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("SYS");
    expect(body.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
    expect(body.messages[0].content[1]).toEqual({ type: "text", text: "hi" });
  });

  it("sends OpenAI-style requests, using max_completion_tokens only for OpenAI", async () => {
    let fetchFn = mockFetch({ choices: [{ message: { content: "ok" } }] });
    await openaiCompatBackend("openai", "m").complete({ system: "S", text: "t", images: [dataUri], apiKey: "k" });
    let [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    let body = JSON.parse(init.body as string);
    expect(body.max_completion_tokens).toBe(8192);
    expect(body.max_tokens).toBeUndefined();
    // Images first, then the text, as the prompts expect ("the first attached image").
    expect(body.messages[1].content).toEqual([{ type: "image_url", image_url: { url: dataUri } }, { type: "text", text: "t" }]);

    fetchFn = mockFetch({ choices: [{ message: { content: "ok" } }] });
    await openaiCompatBackend("openrouter", "a/b").complete({ system: "S", text: "t", apiKey: "k" });
    [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(8192);

    // A reply cut off at the output limit says so.
    mockFetch({ choices: [{ message: { content: "half" }, finish_reason: "length" }] });
    expect((await openaiCompatBackend("openai", "m").complete({ text: "t", apiKey: "k" })).truncated).toBe(true);
    mockFetch({ content: [{ type: "text", text: "half" }], stop_reason: "max_tokens" });
    expect((await anthropicBackend("m").complete({ text: "t", apiKey: "k" })).truncated).toBe(true);
    mockFetch({ content: [{ type: "text", text: "all" }], stop_reason: "end_turn" });
    expect((await anthropicBackend("m").complete({ text: "t", apiKey: "k" })).truncated).toBe(false);

    // No system message when there is none: the SCOPE guard travels in the user turn.
    fetchFn = mockFetch({ choices: [{ message: { content: "ok" } }] });
    await openaiCompatBackend("openai", "m").complete({ text: "t", apiKey: "k" });
    body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "t" }] }]);
  });

  it("sends SpicyAPI requests with only documented fields, an idempotency key and roomy limits", async () => {
    const fetchFn = mockFetch({ choices: [{ message: { content: "ok" } }] });
    const backend = spicyapiBackend("anthropic/claude-sonnet-5.5/chat");
    expect((await backend.complete({ system: "S", text: "t", images: [dataUri], apiKey: "k-1" })).text).toBe("ok");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://api.spicyapi.ai/v1/chat/completions");
    expect(headers.authorization).toBe("Bearer k-1");
    expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    const body = JSON.parse(init.body as string);
    // the endpoint rejects unknown fields
    const allowed = ["model", "messages", "max_tokens", "reasoning_effort", "stop", "tools", "tool_choice", "parallel_tool_calls", "stream"];
    expect(Object.keys(body).every((k) => allowed.includes(k))).toBe(true);
    expect(body.max_tokens).toBeGreaterThanOrEqual(4000);
    expect(body.reasoning_effort).toBe("low");
    expect(backend.imageMaxEdge).toBe(768);
  });

  it("turns provider errors into ProviderError without leaking the key", async () => {
    mockFetch({ error: { message: "invalid x-api-key" } }, 401);
    const err = await anthropicBackend("m").complete({ system: "s", text: "t", apiKey: "super-secret-key" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toContain("was rejected");
    expect(err.message).not.toContain("super-secret-key");
  });
});

describe("token usage from providers", () => {
  it("reads usage under each provider's own names", async () => {
    mockFetch({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });
    expect((await openaiCompatBackend("openai", "m").complete({ system: "s", text: "t", apiKey: "k" })).usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    mockFetch({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 7, completion_tokens: 1 } });
    expect((await spicyapiBackend("m").complete({ system: "s", text: "t", apiKey: "k" })).usage).toEqual({ inputTokens: 7, outputTokens: 1 });
  });

  it("leaves usage out when a provider does not report it or reports nonsense", async () => {
    mockFetch({ choices: [{ message: { content: "ok" } }] });
    expect((await openaiCompatBackend("openai", "m").complete({ system: "s", text: "t", apiKey: "k" })).usage).toBeUndefined();
    mockFetch({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: "lots", completion_tokens: -1 } });
    expect((await openaiCompatBackend("openai", "m").complete({ system: "s", text: "t", apiKey: "k" })).usage).toBeUndefined();
    expect(readUsage(5, undefined)).toBeUndefined();
    expect(readUsage(0, 0)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("profile builder", () => {
  it("parses JSON wrapped in fences and chatter, keeping only known non-empty fields", () => {
    const reply = 'Sure!\n```json\n{"identity_line":" Tall brunette ","face":"oval","hair":"","evil":"x"}\n```';
    expect(parseProfileResponse(reply)).toEqual({ identity_line: "Tall brunette", face: "oval" });
  });
  it("throws a friendly error on bad output", () => {
    expect(() => parseProfileResponse("no json here")).toThrow(/did not return/);
    expect(() => parseProfileResponse("{not json}")).toThrow(/could not be read/);
    expect(() => parseProfileResponse('{"face": 5}')).toThrow(/unexpected/);
    expect(() => parseProfileResponse('{"hair": "  "}')).toThrow(/unexpected/);
  });
  it("is the artifact prompt: image roles in order, fenced notes, measurements, definitive wording", () => {
    const task = buildProfileTask({ height: "5'7", always_keep: "gold <<<chain>>>" }, [
      { role: PROFILE_ROLES.faceSheet, dataUri },
      { role: PROFILE_ROLES.bodySheet, dataUri },
      { role: PROFILE_ROLES.photo, dataUri },
    ]);
    expect(task.prompt).toContain(`The 3 attached images show the same character: image 1 is ${PROFILE_ROLES.faceSheet}; image 2 is ${PROFILE_ROLES.bodySheet}; image 3 is a reference photo.`);
    expect(task.prompt).toContain("The reference sheets are the source of truth: take the face, eyes, brows");
    expect(task.prompt).toContain("The user says these must always be kept: <<<gold chain>>>");
    expect(task.prompt).toContain("written in visual terms: height 5'7");
    expect(task.prompt).toContain("DEFINITIVE WORDING, required for every trait");
    expect(task.prompt).toContain('{"identity": "2 to 3 sentences');
    expect(task.images).toHaveLength(3);
  });
  it("with photos only, goes with what appears most often", () => {
    const task = buildProfileTask({}, [{ role: PROFILE_ROLES.photo, dataUri }]);
    expect(task.prompt).toContain("The 1 attached image shows the same character: image 1 is a reference photo.");
    expect(task.prompt).toContain("If images disagree, go with what appears most often.");
    expect(task.prompt).not.toContain("must always be kept");
  });
  it("maps the artifact's keys onto the saved profile fields", () => {
    const reply = '{"identity":"Id","face":"F","hair":"H","skin":"S","body":"B","traits":"T","accessories":"A"}';
    expect(parseProfileResponse(reply)).toEqual({
      identity_line: "Id", face: "F", hair: "H", skin: "S", body: "B", distinctive_traits: "T", signature_accessories: "A",
    });
  });
  it("writes the profile block with the artifact's labels", () => {
    const block = profileBlock({ profile: { identity_line: "Id", skin: "S", distinctive_traits: "T" }, always_keep: "chain", height: "5'6\"" });
    expect(block).toBe("Identity line: Id\nSkin, freckles and marks: S\nDistinctive traits: T\nAlways keep: chain\nHeight: 5'6\"");
  });
});

describe("referenceList", () => {
  it("orders face sheet, body sheet, then references and never includes the profile photo", () => {
    const list = referenceList({ face_sheet_path: "a", body_sheet_path: null, reference_paths: ["b", "c"] });
    expect(list.map((i) => i.path)).toEqual(["a", "b", "c"]);
  });
});

describe("parseDataUri", () => {
  it("splits media type and data", () => {
    expect(parseDataUri(dataUri)).toEqual({ mediaType: "image/jpeg", data: "QUJD" });
    expect(() => parseDataUri("http://x")).toThrow();
  });
});

describe("detectProvider", () => {
  it("recognises the big providers by prefix", () => {
    expect(detectProvider("sk-ant-api03-abc")?.id).toBe("anthropic");
    expect(detectProvider("sk-or-v1-abc")?.id).toBe("openrouter");
    expect(detectProvider("sk-proj-abc")?.id).toBe("openai");
    expect(detectProvider("sk-abc")?.id).toBe("openai");
    expect(detectProvider("AIzaSyAbc")?.id).toBe("google");
    expect(detectProvider("  sk-ant-abc  ")?.id).toBe("anthropic");
  });
  it("returns null for unrecognised keys", () => {
    expect(detectProvider("spicy_abcdef123456")).toBeNull();
    expect(detectProvider("")).toBeNull();
  });
});

describe("normalizeBaseUrl", () => {
  it("accepts https URLs and strips the chat completions suffix and trailing slashes", () => {
    expect(normalizeBaseUrl("https://api.groq.com/openai/v1/")).toBe("https://api.groq.com/openai/v1");
    expect(normalizeBaseUrl("https://api.spicyapi.ai/v1/chat/completions")).toBe("https://api.spicyapi.ai/v1");
    expect(normalizeBaseUrl("https://example.com")).toBe("https://example.com");
  });
  it("rejects http, credentials, queries and junk", () => {
    expect(normalizeBaseUrl("http://example.com/v1")).toBeNull();
    expect(normalizeBaseUrl("https://user:pw@example.com/v1")).toBeNull();
    expect(normalizeBaseUrl("https://example.com/v1?x=1")).toBeNull();
    expect(normalizeBaseUrl("not a url")).toBeNull();
  });
});

describe("resolveRoleSetup", () => {
  it("uses the detected provider and its default model", async () => {
    const r = await resolveRoleSetup({ key: "sk-ant-abcdefgh12345" });
    expect(r).toMatchObject({ ok: true, config: { provider: "anthropic", model: "claude-sonnet-5-5" } });
  });
  it("requires a model when the provider has no default (OpenRouter)", async () => {
    expect((await resolveRoleSetup({ key: "sk-or-v1-abcdefgh" })).ok).toBe(false);
    expect(await resolveRoleSetup({ key: "sk-or-v1-abcdefgh", model: "anthropic/claude-sonnet-4.5" })).toMatchObject({ ok: true });
  });
  it("treats unknown keys as OpenAI-compatible and needs a base URL and model", async () => {
    expect((await resolveRoleSetup({ key: "unknownkey12345" })).ok).toBe(false);
    expect((await resolveRoleSetup({ key: "unknownkey12345", baseUrl: "https://1.1.1.1/v1" })).ok).toBe(false);
    const ok = await resolveRoleSetup({ key: "unknownkey12345", baseUrl: "https://1.1.1.1/v1/", model: "m-1" });
    expect(ok).toMatchObject({ ok: true, config: { provider: "custom", model: "m-1", baseUrl: "https://1.1.1.1/v1" } });
  });
  it("lets the user override detection when a provider's key looks like another one's (sk-)", async () => {
    const r = await resolveRoleSetup({ key: "sk-abcdefgh12345", custom: true, baseUrl: "https://1.1.1.1/v1", model: "m" });
    expect(r).toMatchObject({ ok: true, config: { provider: "custom", baseUrl: "https://1.1.1.1/v1" } });
    expect((await resolveRoleSetup({ key: "sk-abcdefgh12345", custom: true })).ok).toBe(false);
  });
  it("refuses private or non-https base URLs and masked keys", async () => {
    expect((await resolveRoleSetup({ key: "unknownkey12345", baseUrl: "https://127.0.0.1/v1", model: "m" })).ok).toBe(false);
    expect((await resolveRoleSetup({ key: "unknownkey12345", baseUrl: "https://169.254.169.254/v1", model: "m" })).ok).toBe(false);
    expect((await resolveRoleSetup({ key: "unknownkey12345", baseUrl: "http://1.1.1.1/v1", model: "m" })).ok).toBe(false);
    expect((await resolveRoleSetup({ key: "sk-ant-••••••••••" })).ok).toBe(false);
  });
});

describe("custom backends", () => {
  it("posts to the user's base URL with a bearer key", async () => {
    const fetchFn = mockFetch({ choices: [{ message: { content: "hi" } }] });
    const out = await getTextBackend("custom", "m", "https://1.1.1.1/v1").complete({ system: "s", text: "t", apiKey: "k" });
    expect(out.text).toBe("hi");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://1.1.1.1/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(init.redirect).toBe("error");
  });
  it("refuses to call a private address even if one was saved", async () => {
    const fetchFn = mockFetch({});
    await expect(getTextBackend("custom", "m", "https://10.0.0.5/v1").complete({ system: "s", text: "t", apiKey: "k" })).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("routes spicyapi.ai base URLs to the SpicyAPI request shape", () => {
    expect(getTextBackend("custom", "m", "https://api.spicyapi.ai/v1").id).toBe("spicyapi");
    expect(getTextBackend("custom", "m", "https://api.groq.com/openai/v1").id).toBe("custom");
  });
});

describe("effectiveRole", () => {
  const cfg = { provider: "anthropic", model: "m" };
  it("uses the role's own setup, else falls back to the other, else null", () => {
    expect(effectiveRole({ vision: cfg }, "vision")).toEqual({ cfg, keyRole: "vision" });
    expect(effectiveRole({ llm: cfg }, "vision")).toEqual({ cfg, keyRole: "llm" });
    expect(effectiveRole({ vision: cfg }, "llm")).toEqual({ cfg, keyRole: "vision" });
    expect(effectiveRole({}, "vision")).toBeNull();
  });
});

describe("shared keys between jobs", () => {
  const own = { provider: "custom", model: "anthropic/claude-sonnet-5.5/chat", baseUrl: "https://api.spicyapi.ai/v1" };

  it("lets a job reuse another job's key with its own model", () => {
    const shared = shareRole({ vision: own }, "llm", "vision", "moonshot/kimi-k3/chat");
    expect(shared).toEqual({ ok: true, roles: { vision: own, llm: { keyFrom: "vision", model: "moonshot/kimi-k3/chat" } } });
    if (!shared.ok) throw new Error("unreachable");
    expect(effectiveRole(shared.roles, "llm")).toEqual({
      cfg: { ...own, model: "moonshot/kimi-k3/chat" },
      keyRole: "vision",
    });
    expect(effectiveRole(shared.roles, "vision")?.cfg.model).toBe(own.model);
  });

  it("refuses to share from a job with no key of its own, itself, or a shared job", () => {
    expect(shareRole({}, "llm", "vision", "m").ok).toBe(false);
    expect(shareRole({ vision: own }, "vision", "vision", "m").ok).toBe(false);
    expect(shareRole({ vision: { keyFrom: "llm", model: "m" } }, "llm", "vision", "m").ok).toBe(false);
  });

  it("treats a shared job whose source is gone as not set up", () => {
    expect(effectiveRole({ llm: { keyFrom: "vision", model: "m" } }, "llm")).toBeNull();
  });

  it("removing a job also removes the jobs borrowing its key", () => {
    const roles = { vision: own, llm: { keyFrom: "vision" as const, model: "m" } };
    expect(dropRole(roles, "vision")).toEqual({});
    expect(dropRole(roles, "llm")).toEqual({ vision: own });
  });

  it("reads saved prefs defensively", () => {
    expect(readRoles({ roles: { vision: own, llm: { keyFrom: "vision", model: "m" }, bogus: { provider: "x" } } })).toEqual({
      vision: own,
      llm: { keyFrom: "vision", model: "m" },
    });
    expect(readRoles({ roles: { llm: { keyFrom: "nope", model: "m" }, vision: { provider: 5, model: "m" } } })).toEqual({});
    expect(readRoles(null)).toEqual({});
  });
});

describe("provider error messages", () => {
  it("explains restricted keys, missing models, credit and bad keys", () => {
    expect(describeProviderError("spicyapi", 403, "model not allowed", "x/y", "k")).toContain('allowed to use the model "x/y"');
    expect(describeProviderError("openai", 404, "no such model", "gpt-x", "k")).toContain('model "gpt-x" wasn\'t found');
    expect(describeProviderError("openai", 402, "", "m", "k")).toContain("spend cap");
    expect(describeProviderError("openai", 401, "bad", "m", "k")).toContain("was rejected");
    expect(describeProviderError("openai", 429, "", "m", "k")).toContain("rate limited");
  });

  it("never echoes the API key back, even if the provider does", async () => {
    mockFetch({ error: { message: "Invalid key super-secret-key-123 for model" } }, 401);
    const err = await openaiCompatBackend("openai", "m").complete({ system: "s", text: "t", apiKey: "super-secret-key-123" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).not.toContain("super-secret-key-123");
    expect(err.message).toContain("[key]");
  });

  it("surfaces a model restriction from a real 403 response", async () => {
    mockFetch({ error: { message: "Model not enabled for this key" } }, 403);
    const err = await spicyapiBackend("bytedance/other").complete({ system: "s", text: "t", apiKey: "k-12345678" }).catch((e) => e);
    expect(err.message).toContain('"bytedance/other"');
    expect(err.message).toContain("Model not enabled for this key");
  });
});

describe("draft images on the new-character form", () => {
  const form = (entries: [string, string][]) => {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  };
  const p = (n: string) => `u1/characters/pending/${n}.jpg`;

  it("only treats the user's own holding-folder uploads as pending", () => {
    expect(isPendingPath("u1", p("a"))).toBe(true);
    expect(isPendingPath("u2", p("a"))).toBe(false);
    expect(isPendingPath("u1", "u1/characters/c1/a.jpg")).toBe(false);
    expect(isPendingPath("u1", "u1/targets/a.jpg")).toBe(false);
    expect(isPendingPath("u1", "u1/characters/pending/../../u2/x.jpg")).toBe(false);
  });

  it("reads the submitted images, ignoring blanks and repeats", () => {
    const r = readDraftImages(
      form([["image_profile_photo", p("a")], ["image_face_sheet", ""], ["image_reference", p("b")], ["image_reference", p("b")], ["image_reference", p("c")]]),
      "u1",
    );
    expect(r).toEqual({
      ok: true,
      images: { profile_photo_path: p("a"), face_sheet_path: null, body_sheet_path: null, reference_paths: [p("b"), p("c")] },
    });
  });

  it("is fine with no images at all", () => {
    expect(readDraftImages(form([]), "u1")).toEqual({
      ok: true,
      images: { profile_photo_path: null, face_sheet_path: null, body_sheet_path: null, reference_paths: [] },
    });
  });

  it("rejects other people's paths, other folders and more than 3 references", () => {
    expect(readDraftImages(form([["image_face_sheet", "u2/characters/pending/x.jpg"]]), "u1").ok).toBe(false);
    expect(readDraftImages(form([["image_body_sheet", "u1/targets/x.jpg"]]), "u1").ok).toBe(false);
    expect(readDraftImages(form([["image_reference", p("a")], ["image_reference", p("b")], ["image_reference", p("c")], ["image_reference", p("d")]]), "u1").ok).toBe(false);
  });
});
