import type { KeyKind } from "@/lib/key-store-types";

export interface ProviderInfo {
  id: string;
  label: string;
  kind: KeyKind;
  /** Text providers also need a model name. */
  defaultModel?: string;
  modelRequired?: boolean;
  keyUrl?: string;
  note?: string;
}

// One key per provider. A text provider's key powers both vision and language calls.
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "llm",
    defaultModel: "claude-sonnet-5-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    note: "Reads images and writes prompts.",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "llm",
    defaultModel: "gpt-4o",
    keyUrl: "https://platform.openai.com/api-keys",
    note: "Reads images and writes prompts. Use a vision-capable model.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "llm",
    modelRequired: true,
    keyUrl: "https://openrouter.ai/keys",
    note: "Pick any vision-capable model, for example anthropic/claude-sonnet-4.5 or openai/gpt-4o.",
  },
  {
    id: "spicyapi",
    label: "SpicyAPI",
    kind: "llm",
    defaultModel: "anthropic/claude-sonnet-5.5/chat",
    keyUrl: "https://spicyapi.ai",
    note: "Claude Sonnet 5.5 at $2 in / $10 out per 1M tokens. The same key will be used for image generation later.",
  },
];

export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id);
export const textProviders = () => PROVIDERS.filter((p) => p.kind === "llm");
