import { randomUUID } from "node:crypto";
import { parseDataUri } from "@/lib/images";
import { assertPublicHttpsUrl } from "@/lib/ssrf";
import { isSpicyHost } from "../roles";
import type { TokenUsage } from "@/lib/pricing";
import type { TextBackend } from "./types";

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const TIMEOUT_MS = 55_000;

// Providers report token use under different names. Anything that is not a plain number counts as not reported.
export function readUsage(input: unknown, output: unknown): TokenUsage | undefined {
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  return ok(input) && ok(output) ? { inputTokens: input, outputTokens: output } : undefined;
}

// Turns a provider failure into a message a user can act on. The key itself is never included.
export function describeProviderError(provider: string, status: number, detail: string, model: string, apiKey: string): string {
  const safe = apiKey ? detail.split(apiKey).join("[key]") : detail;
  const said = safe ? ` Provider message: ${safe}` : "";
  if (status === 401) return `This API key was rejected. Check that it was copied in full and is still active.${said}`;
  if (status === 402) return `This key is out of credit or has hit its spend cap.${said}`;
  if (status === 403) return `This key isn't allowed to use the model "${model}" (or lacks access). Check the key's allowed models, then update the model on the API keys page.${said}`;
  if (status === 404) return `The model "${model}" wasn't found. Check the model name on the API keys page.${said}`;
  if (status === 429) return `This key is being rate limited. Wait a moment and try again.${said}`;
  return `${provider} error (${status}).${said}`;
}

async function post(
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: { model: string } & Record<string, unknown>,
  apiKey: string,
) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new ProviderError(provider, 0, `${provider} did not respond in time. Try again.`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = String(json?.error?.message ?? json?.message ?? res.statusText ?? "");
    throw new ProviderError(provider, res.status, describeProviderError(provider, res.status, detail, body.model, apiKey));
  }
  return json;
}

export function anthropicBackend(model: string): TextBackend {
  return {
    id: "anthropic",
    async complete({ system, text, images = [], apiKey }) {
      const content = [
        ...images.map((uri) => {
          const { mediaType, data } = parseDataUri(uri);
          return { type: "image", source: { type: "base64", media_type: mediaType, data } };
        }),
        { type: "text", text },
      ];
      const json = await post(
        "anthropic",
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        { model, max_tokens: 2048, system, messages: [{ role: "user", content }] },
        apiKey,
      );
      const out = (json?.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
      if (!out) throw new ProviderError("anthropic", 200, "anthropic returned no text");
      return { text: out, usage: readUsage(json?.usage?.input_tokens, json?.usage?.output_tokens) };
    },
  };
}

const BASES = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
} as const;

// OpenAI, OpenRouter, Google and any "other" provider share the chat completions format.
// A custom base URL is user supplied, so it is checked to be a public https address on every call.
export function openaiCompatBackend(id: "openai" | "openrouter" | "google" | "custom", model: string, baseUrl?: string): TextBackend {
  const base = id === "custom" ? baseUrl : BASES[id];
  if (!base) throw new Error("A base URL is required for this provider");
  return {
    id,
    async complete({ system, text, images = [], apiKey }) {
      if (id === "custom") await assertPublicHttpsUrl(base);
      const userContent = [
        { type: "text", text },
        ...images.map((uri) => ({ type: "image_url", image_url: { url: uri } })),
      ];
      const json = await post(
        id,
        `${base}/chat/completions`,
        { authorization: `Bearer ${apiKey}` },
        {
          model,
          [id === "openai" ? "max_completion_tokens" : "max_tokens"]: 4096,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        },
        apiKey,
      );
      const out = json?.choices?.[0]?.message?.content;
      if (typeof out !== "string" || !out) throw new ProviderError(id, 200, `${id} returned no text`);
      return { text: out, usage: readUsage(json?.usage?.prompt_tokens, json?.usage?.completion_tokens) };
    },
  };
}

// SpicyAPI: OpenAI-style chat completions. The endpoint rejects unknown fields, so only documented
// ones are sent. Thinking shares the max_tokens budget, hence the roomy cap and low effort.
// Its docs list a 6000 image-token limit, so images are shrunk harder than for other providers.
export function spicyapiBackend(model: string, baseUrl = "https://api.spicyapi.ai/v1"): TextBackend {
  return {
    id: "spicyapi",
    imageMaxEdge: 768,
    async complete({ system, text, images = [], apiKey }) {
      await assertPublicHttpsUrl(baseUrl);
      const json = await post(
        "spicyapi",
        `${baseUrl}/chat/completions`,
        { authorization: `Bearer ${apiKey}`, "idempotency-key": randomUUID() },
        {
          model,
          max_tokens: 4096,
          reasoning_effort: "low",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: [{ type: "text", text }, ...images.map((uri) => ({ type: "image_url", image_url: { url: uri } }))],
            },
          ],
        },
        apiKey,
      );
      const out = json?.choices?.[0]?.message?.content;
      if (typeof out !== "string" || !out) throw new ProviderError("spicyapi", 200, "spicyapi returned no text");
      return { text: out, usage: readUsage(json?.usage?.prompt_tokens, json?.usage?.completion_tokens) };
    },
  };
}

export function getTextBackend(provider: string, model: string, baseUrl?: string): TextBackend {
  if (provider === "anthropic") return anthropicBackend(model);
  if (provider === "openai" || provider === "openrouter" || provider === "google") return openaiCompatBackend(provider, model);
  if (provider === "spicyapi") return spicyapiBackend(model);
  if (provider === "custom") {
    if (!baseUrl) throw new Error("A base URL is required for this provider");
    // SpicyAPI rejects unknown fields and needs reasoning kept low, so it gets its own request shape.
    if (isSpicyHost(baseUrl)) return spicyapiBackend(model, baseUrl);
    return openaiCompatBackend("custom", model, baseUrl);
  }
  throw new Error(`Unknown text provider: ${provider}`);
}
