import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { DEPLOY_WEBHOOK_SECRET: "test-secret-123" } }));
vi.mock("@/lib/payments/alerts", () => ({ alertAdmins: vi.fn(async (t: string) => void h.sent.push(t)) }));

import { githubMessage, handleDeployWebhook, validDeploySignature, vercelMessage } from "@/lib/deploy-alerts";

beforeEach(() => (h.sent.length = 0));

const sign = (algo: "sha1" | "sha256", raw: string) => createHmac(algo, "test-secret-123").update(raw).digest("hex");

describe("deploy alert signatures", () => {
  const raw = JSON.stringify({ a: 1 });
  it("accepts Vercel (sha1) and GitHub (sha256) signatures made with the secret", () => {
    expect(validDeploySignature(raw, new Headers({ "x-vercel-signature": sign("sha1", raw) }))).toBe(true);
    expect(validDeploySignature(raw, new Headers({ "x-hub-signature-256": `sha256=${sign("sha256", raw)}` }))).toBe(true);
  });
  it("rejects a wrong, missing or tampered signature", () => {
    expect(validDeploySignature(raw, new Headers())).toBe(false);
    expect(validDeploySignature(raw, new Headers({ "x-vercel-signature": "nope" }))).toBe(false);
    expect(validDeploySignature(raw + " ", new Headers({ "x-vercel-signature": sign("sha1", raw) }))).toBe(false);
  });
});

describe("deploy alert messages", () => {
  it("Vercel: announces a finished production deploy with the commit and link", () => {
    const m = vercelMessage({ type: "deployment.succeeded", payload: { target: "production", deployment: { name: "injekt-ai", url: "injektai.vercel.app", meta: { githubCommitMessage: "Fix card seam\n\nlong body" } } } });
    expect(m).toBe("🚀 Deployed to production\ninjekt-ai\nFix card seam\nhttps://injektai.vercel.app");
  });
  it("Vercel: failures say so, and building / unknown events stay quiet", () => {
    expect(vercelMessage({ type: "deployment.error", payload: { deployment: { name: "x" } } })).toMatch(/^❌ Deployment failed \(preview\)/);
    expect(vercelMessage({ type: "deployment.created", payload: {} })).toBeNull();
    expect(vercelMessage(null)).toBeNull();
  });
  it("GitHub: only success, failure and error count", () => {
    const body = (state: string) => ({ deployment_status: { state, environment: "Production", environment_url: "https://injektai.vercel.app" }, deployment: { description: "Deployed" }, repository: { full_name: "o/r" } });
    expect(githubMessage(body("success"))).toBe("🚀 Deployed to production\no/r\nDeployed\nhttps://injektai.vercel.app");
    expect(githubMessage(body("failure"))).toMatch(/^❌/);
    expect(githubMessage(body("pending"))).toBeNull();
    expect(githubMessage(body("in_progress"))).toBeNull();
  });
  it("handleDeployWebhook sends once for a finished deploy and nothing for anything else", async () => {
    const ok = { deployment_status: { state: "success", environment: "Production" }, deployment: {}, repository: { full_name: "o/r" } };
    expect(await handleDeployWebhook(new Headers({ "x-github-event": "deployment_status" }), ok)).toBe("sent");
    expect(await handleDeployWebhook(new Headers({ "x-github-event": "ping" }), ok)).toBe("ignored");
    expect(h.sent).toHaveLength(1);
  });
});
