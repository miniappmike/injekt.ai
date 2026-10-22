import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { stripAndNormalize, parseDataUri } from "@/lib/images";
import { isOwnPath, isOwnRawPath } from "@/lib/uploads";
import { validateApiKey } from "@/lib/key-validation";
import { anthropicBackend, openaiCompatBackend, spicyapiBackend, ProviderError } from "@/lib/ai/providers/text";
import { buildProfileTask, parseProfileResponse } from "@/lib/ai/tasks/profile-builder";
import { buildReplacementPromptTask } from "@/lib/ai/tasks/prompt-writer";
import { referenceList } from "@/lib/character-images";
import { detectProvider } from "@/lib/ai/providers/detect";
import { effectiveRole, normalizeBaseUrl } from "@/lib/ai/roles";
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
    const fetchFn = mockFetch({ content: [{ type: "text", text: "hello" }] });
    const out = await anthropicBackend("claude-x").complete({ system: "SYS", text: "hi", images: [dataUri], apiKey: "k-123" });
    expect(out).toBe("hello");
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
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: dataUri } });

    fetchFn = mockFetch({ choices: [{ message: { content: "ok" } }] });
    await openaiCompatBackend("openrouter", "a/b").complete({ system: "S", text: "t", apiKey: "k" });
    [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(4096);
  });

  it("sends SpicyAPI requests with only documented fields, an idempotency key and roomy limits", async () => {
    const fetchFn = mockFetch({ choices: [{ message: { content: "ok" } }] });
    const backend = spicyapiBackend("anthropic/claude-sonnet-5.5/chat");
    expect(await backend.complete({ system: "S", text: "t", images: [dataUri], apiKey: "k-1" })).toBe("ok");
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
    expect(err.message).toContain("Check your API key");
    expect(err.message).not.toContain("super-secret-key");
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
  });
  it("labels images and includes known details", () => {
    const task = buildProfileTask(
      { name: "Juno", height: "5'7", always_keep: "gold chain" },
      [{ label: "face sheet", dataUri }, { label: "reference photo 1", dataUri }],
    );
    expect(task.text).toContain("@image1: face sheet");
    expect(task.text).toContain("@image2: reference photo 1");
    expect(task.text).toContain("Always keep: gold chain");
    expect(task.images).toHaveLength(2);
  });
});

describe("prompt writer", () => {
  it("puts references first and the target last, with matching labels", () => {
    const task = buildReplacementPromptTask({
      character: { name: "Juno", profile: { face: "oval face" }, always_keep: "gold chain" },
      references: [{ label: "face sheet", dataUri }, { label: "reference photo 1", dataUri }],
      target: { label: "target photo", dataUri },
      outfit: "red dress",
      style: "sectioned",
    });
    expect(task.images).toHaveLength(3);
    expect(task.text).toContain("@image3: target photo");
    expect(task.text).toContain("Face: oval face");
    expect(task.text).toContain("red dress");
    expect(task.instructions).toContain("Identity:");
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
    expect(out).toBe("hi");
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
