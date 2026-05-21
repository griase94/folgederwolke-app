/**
 * GET /app/einstellungen/backup-export — admin-only ZIP download of a full
 * lossless CSV-per-table snapshot of the database.
 *
 * Auth model:
 *   - hooks.server.ts already protects `/app/*` for unauthenticated callers.
 *   - This handler additionally rejects non-admin sessions (`steuerberater` /
 *     `member_self_service`) because the dump includes member and customer
 *     PII that those roles must not extract wholesale.
 *
 * Production gate (P1-B3): Neon's `app_export` role is NOLOGIN; the regex
 * password derivation in `buildBackupZip()` cannot work there. Until
 * Vercel-side env injection of a per-route `BACKUP_EXPORT_DATABASE_URL` is
 * wired up, this endpoint returns 404 in production.
 */

import type { RequestHandler } from "./$types.js";
import { error } from "@sveltejs/kit";
import { buildBackupZip } from "$lib/server/backup/build-zip.js";

export const GET: RequestHandler = async ({ locals }) => {
  // P1-B3 dev/test only gate. See build-zip.ts docstring for the prod
  // enablement TODO. process.env is used directly (env.ts does not expose
  // NODE_ENV in its Zod schema).
  if ((process.env["NODE_ENV"] ?? "").toLowerCase() === "production") {
    error(404, "Backup-Export ist in dieser Umgebung nicht verfügbar.");
  }

  if (!locals.session?.user) {
    error(401, "Nicht angemeldet");
  }
  // Defense-in-depth: dump contains member/customer PII — only admins.
  if (locals.session.user.role !== "admin") {
    error(403, "Nicht berechtigt");
  }

  const bytes = await buildBackupZip();
  const filename = `folgederwolke-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  // Cast mirrors src/routes/app/jahresabschluss/[year]/bundle.zip — SvelteKit's
  // Response BodyInit typing rejects Uint8Array<ArrayBufferLike> at the type
  // level even though the platform accepts it at runtime.
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
};
