import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { alertAdmins } from "@/lib/payments/alerts";

/**
 * Telegram alerts when a deployment finishes. Two sources, same message, same secret (`DEPLOY_WEBHOOK_SECRET`):
 * - a Vercel webhook (Pro and Enterprise plans only), signed with HMAC-SHA1 in `x-vercel-signature`;
 * - a GitHub `deployment_status` webhook (works on any plan, because Vercel reports each deploy to GitHub),
 *   signed with HMAC-SHA256 in `x-hub-signature-256`.
 * Only finished deployments are announced (ready or failed), never "building".
 */

export const deployAlertsEnabled = () => !!env.DEPLOY_WEBHOOK_SECRET;

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hmac = (algo: "sha1" | "sha256", raw: string) => createHmac(algo, env.DEPLOY_WEBHOOK_SECRET ?? "").update(raw).digest("hex");

/** Whether the request really came from Vercel or GitHub (checked against the raw body). */
export function validDeploySignature(raw: string, headers: Headers): boolean {
  if (!env.DEPLOY_WEBHOOK_SECRET) return false;
  const vercel = headers.get("x-vercel-signature");
  if (vercel) return safeEqual(vercel, hmac("sha1", raw));
  const github = headers.get("x-hub-signature-256");
  if (github) return safeEqual(github, `sha256=${hmac("sha256", raw)}`);
  return false;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const lines = (head: string, ...rest: (string | null)[]) => [head, ...rest.filter((r): r is string => !!r)].join("\n");

/** The Telegram message for a Vercel webhook body, or null when it isn't a finished deployment. */
export function vercelMessage(body: unknown): string | null {
  const b = obj(body);
  const type = str(b.type);
  const ok = type === "deployment.succeeded" || type === "deployment.ready";
  const failed = type === "deployment.error" || type === "deployment.canceled";
  if (!ok && !failed) return null;
  const p = obj(b.payload);
  const d = obj(p.deployment);
  const meta = obj(d.meta);
  const env_ = p.target === "production" ? "production" : "preview";
  const url = str(d.url);
  const msg = str(meta.githubCommitMessage);
  const head = ok ? `🚀 Deployed to ${env_}` : type === "deployment.canceled" ? `⏹ Deployment canceled (${env_})` : `❌ Deployment failed (${env_})`;
  return lines(head, str(d.name), msg ? clip(msg.split("\n")[0], 100) : null, url ? `https://${url}` : null);
}

/** The Telegram message for a GitHub `deployment_status` body, or null when it isn't a finished deployment. */
export function githubMessage(body: unknown): string | null {
  const b = obj(body);
  const s = obj(b.deployment_status);
  const state = str(s.state);
  if (state !== "success" && state !== "failure" && state !== "error") return null;
  const d = obj(b.deployment);
  const env_ = /production/i.test(str(s.environment) ?? str(d.environment) ?? "") ? "production" : "preview";
  const url = str(s.environment_url) ?? str(s.target_url);
  const head = state === "success" ? `🚀 Deployed to ${env_}` : `❌ Deployment failed (${env_})`;
  return lines(head, str(obj(b.repository).full_name), str(d.description) ?? str(s.description), url);
}

/** Handles one verified webhook: sends the alert if it is a finished deployment. Returns what happened, for the log. */
export async function handleDeployWebhook(headers: Headers, body: unknown): Promise<string> {
  const message = headers.get("x-vercel-signature") ? vercelMessage(body) : headers.get("x-github-event") === "deployment_status" ? githubMessage(body) : null;
  if (!message) return "ignored";
  await alertAdmins(message);
  return "sent";
}
