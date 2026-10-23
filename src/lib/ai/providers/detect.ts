export interface DetectedProvider {
  id: "anthropic" | "openai" | "openrouter" | "google";
  label: string;
  defaultModel: string;
}

// Safe to import in the browser: pure string checks, no secrets leave the page.
export function detectProvider(key: string): DetectedProvider | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return { id: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-5-5" };
  if (k.startsWith("sk-or-")) return { id: "openrouter", label: "OpenRouter", defaultModel: "" };
  if (k.startsWith("AIza")) return { id: "google", label: "Google Gemini", defaultModel: "gemini-2.5-flash" };
  if (k.startsWith("sk-")) return { id: "openai", label: "OpenAI", defaultModel: "gpt-4o" };
  return null;
}

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  google: "Google Gemini",
  custom: "Other provider",
};
