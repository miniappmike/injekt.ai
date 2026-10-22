import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { RateLimitError } from "./errors";

const buckets = new Map<string, number[]>();

// In-memory fallback for local dev when Upstash is not configured.
function memoryLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return Math.ceil((windowMs - (now - hits[0])) / 1000);
  hits.push(now);
  buckets.set(key, hits);
  return 0;
}

const limiters = new Map<string, Ratelimit>();

export async function enforceRateLimit(userId: string, action: string, limit = 20, windowSec = 60) {
  const id = `${action}:${userId}`;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const name = `${action}:${limit}:${windowSec}`;
    let rl = limiters.get(name);
    if (!rl) {
      rl = new Ratelimit({
        redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
        limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
        prefix: "modelspawn",
      });
      limiters.set(name, rl);
    }
    const r = await rl.limit(id);
    if (!r.success) throw new RateLimitError(Math.ceil((r.reset - Date.now()) / 1000));
    return;
  }
  const retry = memoryLimit(id, limit, windowSec * 1000);
  if (retry) throw new RateLimitError(retry);
}
