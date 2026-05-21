import { z } from "zod";
import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { authorizeFileAccess } from "$lib/server/files/authorize.js";
import {
  getFileStorage,
  type StorageBackend,
} from "$lib/server/files/storage.js";

const ParamsSchema = z.object({ id: z.string().uuid() });

export const GET: RequestHandler = async ({ params, locals }) => {
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) throw error(400, "invalid file id");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (locals as any).session?.user;
  if (!user) throw error(401);

  const file = await getDb().query.files.findFirst({
    where: eq(files.id, parsed.data.id),
  });
  if (!file) throw error(404);
  if (file.deletedAt) throw error(410, "Gone");

  const decision = await authorizeFileAccess(user, file);
  if (!decision.allowed) throw error(403);

  // PDF without thumbnail → static SVG icon
  if (file.mimeType === "application/pdf" && !file.thumbnailStorageKey) {
    throw redirect(302, "/icons/pdf-thumb.svg");
  }

  if (!file.thumbnailStorageKey) {
    // No thumbnail (e.g. HEIC, or thumbnail upload failed) — fall back to PDF icon as a generic placeholder.
    // Future Task: SVG icons per kind. For now, the PDF icon is the only static asset.
    throw redirect(302, "/icons/pdf-thumb.svg");
  }

  const storage = await getFileStorage(file.storageBackend as StorageBackend);
  const bytes = await storage.download(file.thumbnailStorageKey);
  const body = new Uint8Array(bytes);

  return new Response(body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=3600", // thumbnails are stable; 1h cache is safe
    },
  });
};
