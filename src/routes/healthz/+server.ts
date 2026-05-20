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
  // Phase 9: skip when SA credentials aren't configured. The Drive Files.get
  // probe is preserved temporarily; Task 7+11 will replace it with a Sheets
  // probe (the SA only has Sheets read scope now) or remove it entirely.
  if (!env.googleServiceAccount) return "skip";
  try {
    const auth = getDriveAuth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const driveClient = createDrive({ version: "v3", auth: auth as any });
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
