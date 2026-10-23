export const ROLES = [
  { id: "vision", label: "Vision", description: "Reads images: profile builder, prompt writer, likeness checks." },
  { id: "llm", label: "Text", description: "Writes and plans text. Used for text-only steps." },
  { id: "image", label: "Image", description: "Generates images: inject, direct swap, edits, variants." },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export const isSpicyHost = (url: string | undefined) => {
  try {
    const host = new URL(url ?? "").hostname;
    return host === "spicyapi.ai" || host.endsWith(".spicyapi.ai");
  } catch {
    return false;
  }
};

/** Whether a provider setup can do a job. Only SpicyAPI generates images for now; text jobs work with any provider. */
export function providerSupports(cfg: { provider: string; baseUrl?: string }, role: RoleId): boolean {
  if (role !== "image") return true;
  return cfg.provider === "spicyapi" || (cfg.provider === "custom" && isSpicyHost(cfg.baseUrl));
}

/** A job with its own key and provider. */
export interface OwnRoleConfig {
  provider: string;
  model: string;
  /** Only for provider "custom" (any OpenAI-compatible endpoint). */
  baseUrl?: string;
}

/** A job that reuses another job's key with a model of its own. */
export interface SharedRoleConfig {
  keyFrom: RoleId;
  model: string;
}

export type RoleConfig = OwnRoleConfig | SharedRoleConfig;
export type RolePrefs = Partial<Record<RoleId, RoleConfig>>;

export const isShared = (c: RoleConfig): c is SharedRoleConfig => "keyFrom" in c;

export function readRoles(prefs: unknown): RolePrefs {
  const roles = (prefs as { roles?: Record<string, Record<string, unknown>> } | null)?.roles ?? {};
  const out: RolePrefs = {};
  for (const { id } of ROLES) {
    const c = roles[id];
    if (!c || typeof c.model !== "string") continue;
    if (typeof c.provider === "string") {
      out[id] = { provider: c.provider, model: c.model, ...(typeof c.baseUrl === "string" ? { baseUrl: c.baseUrl } : {}) };
    } else if (ROLES.some((r) => r.id === c.keyFrom)) {
      out[id] = { keyFrom: c.keyFrom as RoleId, model: c.model };
    }
  }
  return out;
}

/**
 * Which provider setup and key a job uses. A shared job borrows its source's provider and key but keeps
 * its own model. A job with no setup falls back to the other one, since one model usually does both.
 */
export function effectiveRole(roles: RolePrefs, role: RoleId): { cfg: OwnRoleConfig; keyRole: RoleId } | null {
  const own = roles[role];
  if (own) {
    if (!isShared(own)) return { cfg: own, keyRole: role };
    const source = roles[own.keyFrom];
    return source && !isShared(source) ? { cfg: { ...source, model: own.model }, keyRole: own.keyFrom } : null;
  }
  // Vision and Text stand in for each other; Image has no stand-in.
  const otherId: RoleId | null = role === "vision" ? "llm" : role === "llm" ? "vision" : null;
  if (!otherId) return null;
  const other = roles[otherId];
  return other && !isShared(other) ? { cfg: other, keyRole: otherId } : null;
}

/** Makes `role` reuse the key of `from`. Fails if `from` has no key of its own. */
export function shareRole(
  roles: RolePrefs,
  role: RoleId,
  from: RoleId,
  model: string,
): { ok: true; roles: RolePrefs } | { ok: false; error: string } {
  if (role === from) return { ok: false, error: "Pick a different job to share a key with" };
  const source = roles[from];
  if (!source || isShared(source)) return { ok: false, error: "Add a key to that job first" };
  if (!providerSupports(source, role)) {
    return { ok: false, error: "That key's provider can't generate images yet. Image works with SpicyAPI keys." };
  }
  return { ok: true, roles: { ...roles, [role]: { keyFrom: from, model } } };
}

/** Removes a job and any job that was borrowing its key. */
export function dropRole(roles: RolePrefs, role: RoleId): RolePrefs {
  const out: RolePrefs = {};
  for (const { id } of ROLES) {
    const c = roles[id];
    if (!c || id === role || (isShared(c) && c.keyFrom === role)) continue;
    out[id] = c;
  }
  return out;
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
