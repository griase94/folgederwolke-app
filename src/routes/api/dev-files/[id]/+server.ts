import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { env } from "$lib/server/env.js";
import { getFileStorage } from "$lib/server/files/storage.js";

/**
 * Dev-only proxy endpoint that streams bytes from the LocalFsFileStorage
 * backend. Browsers cannot fetch `file://` URLs, so LocalFsFileStorage.upload
 * returns `/api/dev-files/<id>` as the viewUrl; this handler resolves it.
 *
 * Gated by STORAGE_BACKEND=local-fs: returns 404 in any other backend mode
 * so production never accidentally exposes Drive contents via this route.
 */
export const GET: RequestHandler = async ({ params }) => {
  if (env.STORAGE_BACKEND !== "local-fs") {
    throw error(404, "Not found");
  }
  const { id } = params;
  if (!id) throw error(400, "Missing id");

  try {
    const storage = await getFileStorage();
    const bytes = await storage.download(id);
    // Conservative: octet-stream. The .meta.json sidecar carries the real
    // mime type; we don't expose it here — fine for dev preview via a
    // direct fetch. Copy into a fresh ArrayBuffer so the Response BodyInit
    // sees a plain ArrayBuffer (and not a SharedArrayBuffer view).
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    return new Response(ab, {
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch {
    throw error(404, `File not found: ${id}`);
  }
};
