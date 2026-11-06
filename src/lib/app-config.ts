import "server-only";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/env";
import { DAILY_LIMITS } from "@/lib/limits";

const cap = z.coerce.number().int().min(0).max(100000);
const price = z.coerce.number().min(0).max(1000);

/** What the admin can change on the site. Anything left out uses the defaults (DAILY_LIMITS, SERVER_VISION_MODEL). */
export const appConfigSchema = z.object({
  caps: z
    .object({
      free: z.object({ runs: cap, likeness: cap }),
      pro: z.object({ runs: cap, likeness: cap }),
    })
    .optional(),
  /** The model the platform's key uses for prompt writing, sheets and likeness checks. */
  serverModel: z.string().trim().min(3).max(200).optional(),
  /** Dollars per million tokens for that model, so its calls are priced on the admin page. */
  serverPrice: z.object({ input: price, output: price }).nullable().optional(),
});
export type AppConfigInput = z.infer<typeof appConfigSchema>;

export interface AppConfig {
  caps: { free: { runs: number; likeness: number }; pro: { runs: number; likeness: number } };
  serverModel: string;
  serverPrice: { input: number; output: number } | null;
}

export const defaultConfig = (): AppConfig => ({
  caps: { free: { ...DAILY_LIMITS.free }, pro: { ...DAILY_LIMITS.pro } },
  serverModel: env.SERVER_VISION_MODEL,
  serverPrice: null,
});

export function mergeConfig(raw: unknown): AppConfig {
  const d = defaultConfig();
  const p = appConfigSchema.safeParse(raw ?? {});
  if (!p.success) return d;
  return { caps: p.data.caps ?? d.caps, serverModel: p.data.serverModel ?? d.serverModel, serverPrice: p.data.serverPrice ?? d.serverPrice };
}

// Read on most AI calls, so kept for a few seconds per server instance; saving clears it.
let cached: { at: number; config: AppConfig } | null = null;
const TTL_MS = 15_000;

/** The current settings, or the defaults when the table isn't there yet (before migration 0013). */
export async function getAppConfig(): Promise<AppConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
  let config: AppConfig;
  try {
    const { data, error } = await adminClient().from("app_settings").select("config").eq("id", 1).maybeSingle();
    config = error ? defaultConfig() : mergeConfig(data?.config);
  } catch {
    config = defaultConfig();
  }
  cached = { at: Date.now(), config };
  return config;
}

export async function saveAppConfig(input: AppConfigInput, userId: string): Promise<AppConfig> {
  const parsed = appConfigSchema.parse(input);
  const { error } = await adminClient().from("app_settings").upsert({ id: 1, config: parsed, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(/app_settings/.test(error.message) ? "Run migration 0013 in Supabase first, then save again." : "Couldn't save the settings. Try again.");
  cached = null;
  return mergeConfig(parsed);
}
