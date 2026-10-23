export interface DetectedProvider {
  id: "anthropic" | "openai" | "openrouter" | "google" | "spicyapi";
  label: string;
  /** Default model for the Vision and Text jobs. */
  defaultModel: string;
  /** Default model for the Image job, when the provider offers one. */
  defaultImageModel?: string;
}

export const SPICY_TEXT_MODEL = "anthropic/claude-sonnet-5.5/chat";
export const SPICY_IMAGE_MODEL = "bytedance/seedream-5.0-pro/edit";

// Safe to import in the browser: pure string checks, no secrets leave the page.
export function detectProvider(key: string): DetectedProvider | null {
  const k = key.trim();
  // Checked before the generic "sk-" rule below, which would call it OpenAI.
  if (k.startsWith("sk-spicy-")) {
    return { id: "spicyapi", label: "SpicyAPI", defaultModel: SPICY_TEXT_MODEL, defaultImageModel: SPICY_IMAGE_MODEL };
  }
  if (k.startsWith("sk-ant-")) return { id: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-5-5" };
  if (k.startsWith("sk-or-")) return { id: "openrouter", label: "OpenRouter", defaultModel: "" };
  if (k.startsWith("AIza")) return { id: "google", label: "Google Gemini", defaultModel: "gemini-2.5-flash" };
  if (k.startsWith("sk-")) return { id: "openai", label: "OpenAI", defaultModel: "gpt-4o" };
  return null;
}

/** The model to prefill for a job; empty when the provider has no default for it. */
export const defaultModelFor = (p: DetectedProvider, role: "vision" | "llm" | "image") =>
  role === "image" ? (p.defaultImageModel ?? "") : p.defaultModel;

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  google: "Google Gemini",
  spicyapi: "SpicyAPI",
  custom: "Other provider",
};
