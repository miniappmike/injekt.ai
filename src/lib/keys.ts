import { ApiKeyRequiredError } from "./errors";

export type KeySource = "byok" | "server";
export type ProviderId = string;

export interface KeyResolverDeps {
  loadUserKey(userId: string, provider: ProviderId): Promise<string | null>;
  isAdmin(userId: string): Promise<boolean>;
  serverKeys: Partial<Record<ProviderId, string | undefined>>;
}

// BYOK first. The server key is used only for admins. Everyone else is sent to settings.
export async function resolveApiKey(
  deps: KeyResolverDeps,
  userId: string,
  provider: ProviderId,
): Promise<{ key: string; source: KeySource }> {
  const own = await deps.loadUserKey(userId, provider);
  if (own) return { key: own, source: "byok" };

  const serverKey = deps.serverKeys[provider];
  if (serverKey && (await deps.isAdmin(userId))) return { key: serverKey, source: "server" };

  throw new ApiKeyRequiredError(provider);
}
