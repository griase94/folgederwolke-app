import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import { getSheetsClient } from "$lib/server/drive/sheets-client.js";
import { getFileStorage } from "$lib/server/files/storage.js";
import { env } from "$lib/server/env.js";

interface HealthState {
  db: "ok" | "fail";
  sheets: "ok" | "fail";
  blob: "ok" | "fail";
}

// Module-level guard prevents upload storm if probe is missing AND /healthz
// is polled aggressively (UptimeRobot, monitoring, DDoS).
let probeSeeded = false;

async function check(): Promise<HealthState> {
  const db = await getDb()
    .execute(sql`SELECT 1`)
    .then(() => "ok" as const)
    .catch(() => "fail" as const);

  let sheets: "ok" | "fail" = "fail";
  if (env.googleServiceAccount && env.FINANCE_SHEET_ID) {
    try {
      const client = getSheetsClient();
      await client.spreadsheets.get({
        spreadsheetId: env.FINANCE_SHEET_ID,
        fields: "spreadsheetId",
      });
      sheets = "ok";
    } catch {
      sheets = "fail";
    }
  }

  let blob: "ok" | "fail" = "fail";
  try {
    const storage = await getFileStorage();
    try {
      await storage.download("healthz-probe.txt");
      blob = "ok";
      probeSeeded = true;
    } catch {
      // Self-heal ONCE per process. After first success or attempt, never
      // re-upload — even if the probe is genuinely missing on a subsequent
      // failure, a real error (transient network, missing token) is fail-fast.
      if (!probeSeeded) {
        try {
          await storage.upload({
            buffer: new Uint8Array([0x20]),
            mimeType: "text/plain",
            pathname: "healthz-probe.txt",
          });
          probeSeeded = true;
          blob = "ok";
        } catch {
          try {
            await storage.download("healthz-probe.txt");
            blob = "ok";
            probeSeeded = true;
          } catch {
            blob = "fail";
          }
        }
      }
    }
  } catch {
    blob = "fail";
  }

  return { db, sheets, blob };
}

export const GET: RequestHandler = async () => {
  return new Response(JSON.stringify(await check()), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
