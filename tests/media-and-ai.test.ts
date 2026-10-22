import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { stripAndNormalize, parseDataUri } from "@/lib/images";
import { isOwnPath, isOwnRawPath } from "@/lib/uploads";
import { validateApiKey } from "@/lib/key-validation";
import { anthropicBackend, openaiCompatBackend, ProviderError } from "@/lib/ai/providers/text";
import { buildProfileTask, parseProfileResponse } from "@/lib/ai/tasks/profile-builder";
import { buildReplacementPromptTask } from "@/lib/ai/tasks/prompt-writer";
import { referenceList } from "@/lib/character-images";

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
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: dataUri } });

    fetchFn = mockFetch({ choices: [{ message: { content: "ok" } }] });
    await openaiCompatBackend("openrouter", "a/b").complete({ system: "S", text: "t", apiKey: "k" });
    [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(2048);
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
