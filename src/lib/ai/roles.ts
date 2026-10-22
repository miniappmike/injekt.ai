export const ROLES = [
  { id: "vision", label: "Vision", description: "Reads images: profile builder, prompt writer, likeness checks." },
  { id: "llm", label: "Text", description: "Writes and plans text. Used for text-only steps." },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export interface RoleConfig {
  provider: string;
  model: string;
  /** Only for provider "custom" (any OpenAI-compatible endpoint). */
  baseUrl?: string;
}

export type RolePrefs = Partial<Record<RoleId, RoleConfig>>;

export function readRoles(prefs: unknown): RolePrefs {
  const roles = (prefs as { roles?: RolePrefs } | null)?.roles ?? {};
  const out: RolePrefs = {};
  for (const { id } of ROLES) {
    const c = roles[id];
    if (c && typeof c.provider === "string" && typeof c.model === "string") out[id] = c;
  }
  return out;
}

/** A role without its own setup falls back to the other one, since one model usually does both. */
export function effectiveRole(roles: RolePrefs, role: RoleId): { cfg: RoleConfig; keyRole: RoleId } | null {
  if (roles[role]) return { cfg: roles[role]!, keyRole: role };
  const other: RoleId = role === "vision" ? "llm" : "vision";
  return roles[other] ? { cfg: roles[other]!, keyRole: other } : null;
}

/** Accepts https://host/v1 or the full .../chat/completions URL. Returns null when unusable. */
export function normalizeBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
  const path = url.pathname.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
  return `${url.origin}${path}`;
}
