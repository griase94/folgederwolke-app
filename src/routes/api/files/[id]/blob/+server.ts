import { z } from "zod";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { authorizeFileAccess } from "$lib/server/files/authorize.js";
import {
  getFileStorage,
  type StorageBackend,
} from "$lib/server/files/storage.js";
import { formatContentDisposition } from "$lib/server/files/content-disposition.js";

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

  const storage = await getFileStorage(file.storageBackend as StorageBackend);
  const bytes = await storage.download(file.storageKey);
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the Response body type
  // is unambiguous (some impls return Uint8Array<ArrayBufferLike> which TS
  // does not accept as BodyInit).
  const body = new Uint8Array(bytes);

  // CSP WITHOUT `sandbox` so Safari's built-in PDF viewer can render PDFs in iframes.
  // Cache-Control: private, max-age=0, must-revalidate — Safari iframe-PDF needs
  // cacheable response (no-store breaks PDF iframe rendering).
  return new Response(body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": formatContentDisposition(
        "inline",
        file.originalFilename,
      ),
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "frame-ancestors 'self'; default-src 'none'; object-src 'self'",
    },
  });
};
