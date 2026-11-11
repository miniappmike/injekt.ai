import "server-only";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/env";
import { DAILY_LIMITS } from "@/lib/limits";

/** Images paid with credits are made with this unless the admin page sets another. */
export const DEFAULT_SERVER_IMAGE_MODEL = "bytedance/seedream-5.0-pro/edit";

const cap = z.coerce.number().int().min(0).max(100000);
const price = z.coerce.number().min(0).max(1000);

/** What the admin can change on the site. Anything left out uses the defaults (DAILY_LIMITS, SERVER_VISION_MODEL). */
export const appConfigSchema = z.object({
  caps: z
    .object({
      free: z.object({ runs: cap, likeness: cap, images: cap.optional() }),
      // Pro has no daily limits now; older saved settings may still carry these.
      pro: z.object({ runs: cap, likeness: cap, images: cap.optional() }).optional(),
    })
    .optional(),
  /** The image model used for images paid with credits (on the platform's key). */
  serverImageModel: z.string().trim().min(3).max(200).optional(),
  /** The model the platform's key uses for prompt writing, sheets and likeness checks. */
  serverModel: z.string().trim().min(3).max(200).optional(),
  /** Dollars per million tokens for that model, so its calls are priced on the admin page. */
  serverPrice: z.object({ input: price, output: price }).nullable().optional(),
});
export type AppConfigInput = z.infer<typeof appConfigSchema>;

type Caps = { runs: number; likeness: number; images: number };
export interface AppConfig {
  caps: { free: Caps; pro: Caps };
  serverModel: string;
  serverImageModel: string;
  serverPrice: { input: number; output: number } | null;
}

export const defaultConfig = (): AppConfig => ({
  caps: { free: { ...DAILY_LIMITS.free }, pro: { ...DAILY_LIMITS.pro } },
  serverModel: env.SERVER_VISION_MODEL,
  serverImageModel: DEFAULT_SERVER_IMAGE_MODEL,
  serverPrice: null,
});

export function mergeConfig(raw: unknown): AppConfig {
  const d = defaultConfig();
  const p = appConfigSchema.safeParse(raw ?? {});
  if (!p.success) return d;
  const caps = p.data.caps
    ? { free: { ...d.caps.free, ...p.data.caps.free, images: p.data.caps.free.images ?? d.caps.free.images }, pro: d.caps.pro }
    : d.caps;
  return {
    caps,
    serverModel: p.data.serverModel ?? d.serverModel,
    serverImageModel: p.data.serverImageModel ?? d.serverImageModel,
    serverPrice: p.data.serverPrice ?? d.serverPrice,
  };
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
