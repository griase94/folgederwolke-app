#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { isNull } from "drizzle-orm";
import { getFileStorage } from "$lib/server/files/storage.js";

const args = process.argv.slice(2);

// Accept both --dest=PATH and --dest PATH styles.
function getFlag(name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return undefined;
}

const destArg = getFlag("--dest");
const dryRun = args.includes("--dry-run");
const verify = args.includes("--verify");

async function main() {
  if (!destArg && !dryRun) {
    console.error(
      "Usage: backup-files.ts --dest <path> [--verify] [--dry-run]",
    );
    process.exit(1);
  }
  const dest = destArg ?? "/tmp/backup-dry-run";

  const db = getDb();
  const rows = await db.select().from(files).where(isNull(files.deletedAt));
  console.log(`[backup] ${rows.length} active files`);

  const manifest: {
    id: string;
    storage_key: string;
    sha256: string;
    byte_size: string;
  }[] = [];
  const storage = await getFileStorage();
  let verified = 0;
  let failed = 0;

  for (const r of rows) {
    if (dryRun) {
      manifest.push({
        id: r.id,
        storage_key: r.storageKey,
        sha256: r.sha256,
        byte_size: String(r.byteSize),
      });
      continue;
    }
    try {
      const bytes = await storage.download(r.storageKey);
      const actualSha = createHash("sha256").update(bytes).digest("hex");
      if (verify && actualSha !== r.sha256) {
        console.error(
          `[backup] SHA mismatch for ${r.id}: db=${r.sha256} actual=${actualSha}`,
        );
        failed++;
        continue;
      }
      const target = join(dest, r.storageKey);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      manifest.push({
        id: r.id,
        storage_key: r.storageKey,
        sha256: r.sha256,
        byte_size: String(r.byteSize),
      });
      verified++;
    } catch (e) {
      console.error(`[backup] failed for ${r.id}:`, e);
      failed++;
    }
  }

  if (!dryRun) {
    const manifestPath = join(dest, "manifest.csv");
    await mkdir(dest, { recursive: true });
    const csv = ["id,storage_key,sha256,byte_size"]
      .concat(
        manifest.map(
          (m) => `${m.id},${m.storage_key},${m.sha256},${m.byte_size}`,
        ),
      )
      .join("\n");
    await writeFile(manifestPath, csv);
  }

  console.log(
    `[backup] done. verified=${verified} failed=${failed} total=${rows.length}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
