/**
 * LocalFsFileStorage — FileStorage implementation backed by the local
 * filesystem. Used in dev and tests so the app can run offline without
 * Google Drive credentials.
 *
 * Layout under <root>:
 *   <root>/<id>            -- file bytes
 *   <root>/<id>.meta.json  -- { mimeType, name, createdAt }
 *   <root>/archived/<folderName>/<id>  -- post-archive location (file is moved)
 *
 * `id` is derived deterministically from `idempotencyKey` so re-uploads with
 * the same key return the same id without writing a second file.
 */

import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { FileStorage } from "./storage.js";

const SAFE_ID_REGEX = /^[A-Za-z0-9_:-]+$/;

function sanitizeId(id: string): string {
  if (!SAFE_ID_REGEX.test(id)) {
    throw new Error(`LocalFsFileStorage: unsafe id "${id}"`);
  }
  return id;
}

function locate(root: string, id: string): { data: string; meta: string } {
  const safe = sanitizeId(id);
  return {
    data: join(root, safe),
    meta: join(root, `${safe}.meta.json`),
  };
}

async function findById(root: string, id: string): Promise<string | null> {
  const { data } = locate(root, id);
  if (existsSync(data)) return data;

  const archivedRoot = join(root, "archived");
  if (!existsSync(archivedRoot)) return null;
  const folders = await readdir(archivedRoot, { withFileTypes: true });
  for (const f of folders) {
    if (!f.isDirectory()) continue;
    const candidate = join(archivedRoot, f.name, id);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export class LocalFsFileStorage implements FileStorage {
  constructor(private readonly opts: { root: string }) {}

  async upload(opts: {
    buffer: Uint8Array;
    mimeType: string;
    name: string;
    idempotencyKey: string;
  }): Promise<{ id: string; viewUrl: string }> {
    const id = sanitizeId(opts.idempotencyKey);
    await mkdir(this.opts.root, { recursive: true });
    const { data, meta } = locate(this.opts.root, id);

    if (!existsSync(meta)) {
      await writeFile(data, opts.buffer);
      await writeFile(
        meta,
        JSON.stringify({
          mimeType: opts.mimeType,
          name: opts.name,
          createdAt: new Date().toISOString(),
        }),
      );
    }

    return {
      id,
      viewUrl: `file://${data}`,
    };
  }

  async download(id: string): Promise<Uint8Array> {
    sanitizeId(id);
    const path = await findById(this.opts.root, id);
    if (!path) throw new Error(`LocalFsFileStorage: file not found: ${id}`);
    return readFile(path);
  }

  async archive(id: string, folderName: string): Promise<void> {
    sanitizeId(id);
    if (!/^[A-Za-z0-9_ -]+$/.test(folderName)) {
      throw new Error(`LocalFsFileStorage: unsafe folder name "${folderName}"`);
    }
    const src = await findById(this.opts.root, id);
    if (!src) {
      throw new Error(`LocalFsFileStorage: cannot archive missing file: ${id}`);
    }
    const folderPath = join(this.opts.root, "archived", folderName);
    await mkdir(folderPath, { recursive: true });
    const dst = join(folderPath, id);
    if (src !== dst) await rename(src, dst);
  }

  async delete(id: string): Promise<void> {
    sanitizeId(id);
    const path = await findById(this.opts.root, id);
    if (path) await rm(path, { force: true });
    const { meta } = locate(this.opts.root, id);
    await rm(meta, { force: true });
  }
}
