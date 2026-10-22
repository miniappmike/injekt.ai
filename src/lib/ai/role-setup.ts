import { detectProvider } from "./providers/detect";
import { normalizeBaseUrl, type RoleConfig } from "./roles";
import { validateApiKey } from "@/lib/key-validation";
import { assertPublicHttpsUrl } from "@/lib/ssrf";

export const MODEL_PATTERN = /^[\w./:@-]{1,100}$/;

export type RoleSetup = { ok: true; key: string; config: RoleConfig } | { ok: false; error: string };

// Turns what the user pasted into a provider setup. Known key prefixes pick the provider for them
// unless the user says it is another provider; anything else is treated as an OpenAI-compatible endpoint and needs a base URL and model.
export async function resolveRoleSetup(input: { key: string; model?: string; baseUrl?: string; custom?: boolean }): Promise<RoleSetup> {
  const checked = validateApiKey(input.key);
  if (!checked.ok) return checked;

  const model = input.model?.trim() ?? "";
  if (model && !MODEL_PATTERN.test(model)) return { ok: false, error: "That model name has unexpected characters" };

  // `custom` skips detection: some providers' keys share a prefix with a bigger one (many start with sk-).
  const detected = input.custom ? null : detectProvider(checked.key);
  if (detected) {
    const chosen = model || detected.defaultModel;
    if (!chosen) return { ok: false, error: "Enter a model name for this provider" };
    return { ok: true, key: checked.key, config: { provider: detected.id, model: chosen } };
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl ?? "");
  if (!baseUrl) return { ok: false, error: "Enter the provider's base URL, starting with https://" };
  if (!model) return { ok: false, error: "Enter a model name for this provider" };
  try {
    await assertPublicHttpsUrl(baseUrl);
  } catch {
    return { ok: false, error: "That base URL isn't reachable as a public https address" };
  }
  return { ok: true, key: checked.key, config: { provider: "custom", model, baseUrl } };
}
