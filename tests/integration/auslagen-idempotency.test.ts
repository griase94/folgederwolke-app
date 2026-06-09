/**
 * Deliverable A — Auslagen submission idempotency (migration 0033).
 *
 * The public Auslage form sends a STABLE `submissionNonce` (UUID) that
 * survives retries. A retried POST (same nonce) must NOT create a second
 * `auslagen_submissions` row, must NOT allocate a second business_id, and
 * must NOT upload the Beleg blob a second time — it resolves to the original
 * submission's business_id and 303-redirects to the same success target.
 *
 * Idempotency model (panel-corrected):
 *   - `submission_nonce uuid` (nullable) + partial UNIQUE index
 *     `WHERE submission_nonce IS NOT NULL`.
 *   - EARLY dedup: at the TOP of the action (before allocateBusinessId +
 *     before runUploadPipeline) we SELECT business_id by nonce; on hit →
 *     303 redirect to the success page. No second blob / counter burn.
 *   - INSERT-time 23505 backstop disambiguated by constraint name: only the
 *     submission_nonce index triggers the idempotent redirect; a business_id
 *     23505 stays a real error.
 *   - NULL nonce (legacy clients) → no dedup, every POST creates a new row.
 *
 * RESET lane, fileParallelism=false (vitest.config.ts). DB is real
 * (app_runtime). Mail provider is no-op. FileStorage is an in-memory stub
 * that counts uploads so we can assert "no second blob".
 *
 * @phase-2
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { registerHandlers } from "$lib/server/events/index.js";
import { InMemoryMockFileStorage } from "$lib/server/files/in-memory-mock-impl.js";
import type { FileStorage } from "$lib/server/files/storage.js";
import { DATENSCHUTZ_VERSION } from "$lib/server/domain/datenschutz.js";
import {
  actions,
  _setFileStorageOverride,
} from "../../src/routes/(public)/auslage-einreichen/+page.server.js";
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  cleanupFilesViaAdmin,
} from "./_helpers/festschreibung-reset.js";

// Real bus handlers (audit-log write on `auslagen.submitted` is critical).
registerHandlers();

// ── Upload-counting FileStorage stub ─────────────────────────────────────────
// Wraps InMemoryMockFileStorage and counts `upload()` calls so we can assert
// the early-dedup path skips the blob upload on a retried nonce.
class CountingFileStorage implements FileStorage {
  uploadCount = 0;
  private readonly inner = new InMemoryMockFileStorage();

  async upload(args: Parameters<FileStorage["upload"]>[0]) {
    this.uploadCount++;
    return this.inner.upload(args);
  }
  download(p: string) {
    return this.inner.download(p);
  }
  downloadStream(p: string) {
    return this.inner.downloadStream(p);
  }
  archive(p: string, y: number) {
    return this.inner.archive(p, y);
  }
  // Internal helpers the upload pipeline may reach for on dedup cleanup.
  _internalDelByPath(p: string) {
    return (
      this.inner as unknown as { _internalDelByPath(x: string): Promise<void> }
    )._internalDelByPath(p);
  }
}

// Smallest valid PDF: the `file-type` sniffer keys on "%PDF-" (0x25 50 44 46 2d)
// at offset 0 — a bare "%PDF" (no trailing dash) is rejected as 415.
function belegFile(name = "beleg.pdf"): File {
  const bytes = new TextEncoder().encode(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\n%%EOF\n",
  );
  return new File([bytes], name, { type: "application/pdf" });
}

interface SubmitOpts {
  nonce?: string | null;
  bezeichnung?: string;
  ip?: string;
}

/**
 * Build a multipart POST and run the real `default` action against the real
 * DB + counting storage. Returns either the thrown redirect (success / early
 * dedup) or the `fail()` ActionFailure object.
 */
async function submit(
  storage: CountingFileStorage,
  opts: SubmitOpts = {},
): Promise<{ redirectLocation?: string; status?: number; data?: unknown }> {
  const fd = new FormData();
  const payload: Record<string, unknown> = {
    bezahlt_von: {
      kind: "extern",
      name: "Jane Doe",
      iban: "DE89370400440532013000",
      email: "jane@example.org",
    },
    bezeichnung: opts.bezeichnung ?? "Bahnticket München → Berlin",
    betragCents: 1250,
    currency: "EUR",
    rechnungsdatum: "2026-03-01",
    wofuer: null,
    consent_text_version: DATENSCHUTZ_VERSION,
  };
  // Only include the nonce when explicitly provided (undefined → omit field
  // to model legacy clients; null → also omit).
  if (opts.nonce) payload["submissionNonce"] = opts.nonce;

  fd.set("data", JSON.stringify(payload));
  fd.set("beleg", belegFile());
  if (opts.nonce) fd.set("submissionNonce", opts.nonce);

  _setFileStorageOverride(storage);

  const event = {
    request: new Request("http://test.local/auslage-einreichen", {
      method: "POST",
      body: fd,
    }),
    getClientAddress: () => opts.ip ?? "203.0.113.7",
    url: new URL("http://test.local/auslage-einreichen"),
  };

  try {
    const result = await (actions.default as (e: unknown) => Promise<unknown>)(
      event,
    );
    // No throw → fail() ActionFailure: { status, data }.
    const af = result as { status?: number; data?: unknown };
    return { status: af.status, data: af.data };
  } catch (thrown) {
    // SvelteKit Redirect: { status, location }.
    const r = thrown as { status?: number; location?: string };
    if (r && typeof r.location === "string") {
      return { redirectLocation: r.location, status: r.status };
    }
    throw thrown;
  }
}

async function submissionCount(): Promise<number> {
  const rows = (await getDb().execute(
    sql`SELECT count(*)::int AS c FROM auslagen_submissions`,
  )) as unknown as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

async function ausCounterValue(year: number): Promise<number | null> {
  const rows = (await getDb().execute(
    sql`SELECT next_value::int AS v FROM id_counters WHERE kind = 'AUS' AND year = ${year}`,
  )) as unknown as Array<{ v: number }>;
  return rows[0]?.v ?? null;
}

function bizIdFromLocation(loc: string | undefined): string | null {
  if (!loc) return null;
  const u = new URL(loc, "http://test.local");
  return u.searchParams.get("id");
}

describe("Auslagen submission idempotency (submission_nonce)", () => {
  beforeAll(() => {
    registerHandlers();
  });

  afterAll(async () => {
    _setFileStorageOverride(undefined);
    await closeAdminConnection();
  });

  beforeEach(async () => {
    _setFileStorageOverride(undefined);
    await resetFestgeschreibungBis();
    await cleanupFilesViaAdmin();
    const db = getDb();
    await db.execute(sql`DELETE FROM auslagen_submissions`);
    await db.execute(sql`DELETE FROM id_counters WHERE kind = 'AUS'`);
    await db.execute(sql`DELETE FROM rate_limit_attempts`);
  });

  it("(a) same nonce twice → ONE row, second returns first's business_id, no 2nd blob/counter", async () => {
    const storage = new CountingFileStorage();
    const nonce = crypto.randomUUID();

    const first = await submit(storage, { nonce, ip: "203.0.113.10" });
    expect(first.status).toBe(303);
    const firstBiz = bizIdFromLocation(first.redirectLocation);
    expect(firstBiz).toMatch(/^AUS-\d{4}-\d{3}$/);
    expect(await submissionCount()).toBe(1);
    expect(storage.uploadCount).toBe(1);

    const year = parseInt(firstBiz!.split("-")[1]!, 10);
    const counterAfterFirst = await ausCounterValue(year);

    // Retry with the SAME nonce — must early-dedup.
    const second = await submit(storage, { nonce, ip: "203.0.113.10" });
    expect(second.status).toBe(303);
    const secondBiz = bizIdFromLocation(second.redirectLocation);
    expect(secondBiz).toBe(firstBiz);

    // Exactly one row, no second blob upload, counter unchanged.
    expect(await submissionCount()).toBe(1);
    expect(storage.uploadCount).toBe(1);
    expect(await ausCounterValue(year)).toBe(counterAfterFirst);
  });

  it("(b) different nonce → two rows", async () => {
    const storage = new CountingFileStorage();
    const first = await submit(storage, {
      nonce: crypto.randomUUID(),
      ip: "203.0.113.20",
    });
    const second = await submit(storage, {
      nonce: crypto.randomUUID(),
      ip: "203.0.113.20",
    });
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    expect(bizIdFromLocation(first.redirectLocation)).not.toBe(
      bizIdFromLocation(second.redirectLocation),
    );
    expect(await submissionCount()).toBe(2);
    expect(storage.uploadCount).toBe(2);
  });

  it("(c) null/absent nonce (legacy clients) → no dedup, two rows", async () => {
    const storage = new CountingFileStorage();
    // Identical content, NO nonce, twice. Legacy path must NOT dedup.
    const first = await submit(storage, { nonce: null, ip: "203.0.113.30" });
    const second = await submit(storage, { nonce: null, ip: "203.0.113.30" });
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    expect(bizIdFromLocation(first.redirectLocation)).not.toBe(
      bizIdFromLocation(second.redirectLocation),
    );
    expect(await submissionCount()).toBe(2);
    expect(storage.uploadCount).toBe(2);
  });
});
