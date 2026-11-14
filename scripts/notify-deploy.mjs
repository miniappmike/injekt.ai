// Runs after `next build` (npm "postbuild"). On Vercel it tells the site's /api/webhooks/deploy that a build finished,
// and the ModelSpawn bot messages the admins. It must never fail or slow a build, so every problem is swallowed.
import { createHmac } from "node:crypto";

async function main() {
  const secret = process.env.DEPLOY_WEBHOOK_SECRET;
  const site = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (process.env.VERCEL !== "1" || !secret || !site) return;

  const production = process.env.VERCEL_ENV === "production";
  const body = JSON.stringify({
    env: production ? "production" : "preview",
    repo: process.env.VERCEL_GIT_REPO_SLUG || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    url: production ? site : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  });
  const res = await fetch(`${site}/api/webhooks/deploy`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-modelspawn-build": "1",
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  console.log(`[notify-deploy] ${res.status}`);
}

main().catch((e) => console.log(`[notify-deploy] skipped: ${e instanceof Error ? e.message : e}`));
