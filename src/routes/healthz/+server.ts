import { getDriveAuth } from "$lib/server/drive/auth.js";
import { getClient } from "$lib/server/db/index.js";
import { env } from "$lib/server/env.js";
import { drive as createDrive } from "@googleapis/drive";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";

async function checkDb(): Promise<"ok" | "fail"> {
  try {
    if (!env.DATABASE_URL) return "fail";
    const client = getClient();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    await client`SELECT 1`;
    clearTimeout(timer);
    return "ok";
  } catch {
    return "fail";
  }
}

async function checkDrive(): Promise<"ok" | "skip" | "fail"> {
  if (!env.GOOGLE_OAUTH_REFRESH_TOKEN) return "skip";
  try {
    const auth = getDriveAuth();
    const driveClient = createDrive({ version: "v3", auth });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    await driveClient.files.get({ fileId: env.TEMPLATE_DOC_ID, fields: "id" });
    clearTimeout(timer);
    return "ok";
  } catch {
    return "fail";
  }
}

export const GET: RequestHandler = async () => {
  const [dbStatus, driveStatus] = await Promise.all([checkDb(), checkDrive()]);

  // Vercel automatically injects `VERCEL_GIT_COMMIT_SHA` at runtime — prefer
  // it over `env.COMMIT_SHA` because the latter defaults to the literal
  // string `"dev"` in `env.ts:171`. Without this precedence order the
  // fallback chain would always short-circuit to `"dev"` (since the default
  // is truthy), and the post-deploy smoke workflow
  // (`.github/workflows/post-deploy-smoke.yml`) — which compares the
  // deployed git SHA against this field — would never match. Local dev
  // (no Vercel env vars set) falls through to `env.COMMIT_SHA = "dev"`.
  const sha =
    process.env["VERCEL_GIT_COMMIT_SHA"]?.slice(0, 7) ||
    env.COMMIT_SHA ||
    "dev";

  const body = {
    db: dbStatus,
    drive: driveStatus,
    sha,
    deployedAt: env.DEPLOYED_AT || null,
  };

  const status = dbStatus === "ok" ? 200 : 503;
  return json(body, { status });
};
