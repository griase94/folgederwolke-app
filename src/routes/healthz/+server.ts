import { getDriveAuth } from "$lib/server/drive/auth.js";
import { client } from "$lib/server/db/index.js";
import { env } from "$lib/server/env.js";
import { drive as createDrive } from "@googleapis/drive";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";

async function checkDb(): Promise<"ok" | "fail"> {
  try {
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

  const body = {
    db: dbStatus,
    drive: driveStatus,
    sha: env.COMMIT_SHA || "dev",
    deployedAt: env.DEPLOYED_AT || null,
  };

  const status = dbStatus === "ok" ? 200 : 503;
  return json(body, { status });
};
