import { randomUUID } from "node:crypto";
import { parseDataUri } from "@/lib/images";
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

async function post(provider: string, url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ProviderError(provider, 0, `${provider} did not respond in time. Try again.`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json?.error?.message ?? json?.message ?? res.statusText;
    const hint = res.status === 401 || res.status === 403 ? " Check your API key." : "";
    throw new ProviderError(provider, res.status, `${provider} error (${res.status}): ${detail}.${hint}`);
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
      );
      const out = (json?.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
      if (!out) throw new ProviderError("anthropic", 200, "anthropic returned no text");
      return out;
    },
  };
}

// OpenAI and OpenRouter share the chat completions format.
export function openaiCompatBackend(id: "openai" | "openrouter", model: string): TextBackend {
  const base = id === "openai" ? "https://api.openai.com/v1" : "https://openrouter.ai/api/v1";
  return {
    id,
    async complete({ system, text, images = [], apiKey }) {
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
          [id === "openai" ? "max_completion_tokens" : "max_tokens"]: 2048,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        },
      );
      const out = json?.choices?.[0]?.message?.content;
      if (typeof out !== "string" || !out) throw new ProviderError(id, 200, `${id} returned no text`);
      return out;
    },
  };
}

// SpicyAPI: OpenAI-style chat completions. The endpoint rejects unknown fields, so only documented
// ones are sent. Thinking shares the max_tokens budget, hence the roomy cap and low effort.
// Its docs list a 6000 image-token limit, so images are shrunk harder than for other providers.
export function spicyapiBackend(model: string): TextBackend {
  return {
    id: "spicyapi",
    imageMaxEdge: 768,
    async complete({ system, text, images = [], apiKey }) {
      const json = await post(
        "spicyapi",
        "https://api.spicyapi.ai/v1/chat/completions",
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
      );
      const out = json?.choices?.[0]?.message?.content;
      if (typeof out !== "string" || !out) throw new ProviderError("spicyapi", 200, "spicyapi returned no text");
      return out;
    },
  };
}

export function getTextBackend(provider: string, model: string): TextBackend {
  if (provider === "spicyapi") return spicyapiBackend(model);
  if (provider === "anthropic") return anthropicBackend(model);
  if (provider === "openai" || provider === "openrouter") return openaiCompatBackend(provider, model);
  throw new Error(`Unknown text provider: ${provider}`);
}
