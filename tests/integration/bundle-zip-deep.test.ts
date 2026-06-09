/**
 * Phase 9 expert-audit gap closure — bundle.zip 09_Belege/ deep assertions.
 *
 * The existing E2E E4 spec only checks that `/app/jahresabschluss/<year>/bundle.zip`
 * returns 200 + `Content-Type: application/zip` + body length > 200. That
 * assertion passes for a bundle that contains an EMPTY `09_Belege/` folder
 * (or omits it entirely after a regression). This test fills that gap by
 * exercising the **full** SQL→bundlePath→buildJahresabschlussBundle pipeline:
 *
 *  - `WHERE f.deleted_at IS NULL`: soft-deleted Belege are excluded
 *  - `COALESCE(e.sphere_override, e.sphere_snapshot)` (ADR-0008): override wins
 *  - `slugify()` German-aware umlauts: ä→ae, ö→oe, ü→ue, ß→ss BEFORE lowercase
 *  - JSZip serialization + byte-equal round-trip
 *
 * Uses `assembleBelegAttachments()` directly (the helper the route imports)
 * + the InMemoryMockFileStorage backend so the test is self-contained and
 * runs against the hermetic local Postgres.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { InMemoryMockFileStorage } from "$lib/server/files/in-memory-mock-impl.js";
import { assembleBelegAttachments } from "$lib/server/export/beleg-attachments.js";
import { buildJahresabschlussBundle } from "$lib/server/export/bundle.js";
import JSZip from "jszip";
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  seedFileViaAdmin,
  updateFileViaAdmin,
  cleanupFilesViaAdmin,
} from "./_helpers/festschreibung-reset.js";

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
const MIME_PDF = "application/pdf";

// Minimal EUR shape so buildJahresabschlussBundle doesn't reject.
function emptyEur(year: number) {
  return {
    year,
    bySphere: {
      ideeller: { einnahmen: [], ausgaben: [] },
      vermoegen: { einnahmen: [], ausgaben: [] },
      zweckbetrieb: { einnahmen: [], ausgaben: [] },
      wirtschaftlich: { einnahmen: [], ausgaben: [] },
    },
  };
}

/** Insert an expense row + its files link in one transaction. */
async function seedExpenseWithBeleg(args: {
  expenseBusinessId: string;
  bezeichnung: string;
  sphereSnapshot: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
  sphereOverride?: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
  year: number;
  fileId: string;
  storageKey: string;
  sha256: string;
}): Promise<void> {
  await seedFileViaAdmin({
    id: args.fileId,
    storageKey: args.storageKey,
    sha256: args.sha256,
    uploadedAt: `${args.year}-06-15T10:00:00Z`,
    mimeType: MIME_PDF,
    originalFilename: `${args.expenseBusinessId}.pdf`,
    sourceKind: "form",
    uploadedBySubmitterEmail: "test@x.de",
  });
  const db = getDb();
  // Resolve a real expense kategorie_id — migration 0031 made this NOT NULL.
  const [katRow] = await db
    .select({ id: kategorien.id, name: kategorien.name })
    .from(kategorien)
    .where(eq(kategorien.kind, "expense"))
    .limit(1);
  if (!katRow)
    throw new Error("seedExpenseWithBeleg: no expense kategorie seeded");
  await db.execute(sql`
    INSERT INTO expenses (
      business_id, source, gebucht_am, betrag_cents, currency,
      bezeichnung, kategorie_id, kategorie_name_snapshot,
      sphere_snapshot, sphere_override,
      bezahlt_von_kind, bezahlt_von_display, status, beleg_file_id
    ) VALUES (
      ${args.expenseBusinessId}, 'app',
      ${`${args.year}-06-15 10:00:00+02`}::timestamptz,
      1000, 'EUR',
      ${args.bezeichnung}, ${katRow.id}::uuid, ${katRow.name},
      ${args.sphereSnapshot},
      ${args.sphereOverride ?? null},
      'verein', 'Verein', 'geprueft',
      ${args.fileId}::uuid
    )
  `);
}

describe("bundle.zip — deep 09_Belege/ assertions", () => {
  afterAll(async () => {
    await closeAdminConnection();
  });

  beforeEach(async () => {
    await resetFestgeschreibungBis();
    await cleanupFilesViaAdmin("00000000-");
    // Clear any expenses we seeded in prior runs.
    await getDb().execute(sql`
      DELETE FROM expenses WHERE business_id LIKE 'AUS-2024-9%'
    `);
  });

  it(
    "SQL+bundlePath+JSZip roundtrip — covers umlauts, sphere_override, " +
      "deleted_at filter, and unlinked-orphan exclusion",
    async () => {
      const year = 2024;
      const storage = new InMemoryMockFileStorage();

      // 1. Seed 4 files:
      //   - umlaut-bezeichnung expense (sphere snapshot ideeller, no override)
      //   - expense with sphere_override='zweckbetrieb' over snapshot ideeller
      //   - expense whose file is soft-deleted (must be EXCLUDED)
      //   - orphan file (no expense, no income, no donation) — also excluded
      const bytesUmlaut = new Uint8Array([
        ...PDF_HEAD,
        ...new Array(64).fill(0x21),
      ]);
      const bytesOverride = new Uint8Array([
        ...PDF_HEAD,
        ...new Array(64).fill(0x22),
      ]);
      const bytesDeleted = new Uint8Array([
        ...PDF_HEAD,
        ...new Array(64).fill(0x23),
      ]);

      const idUmlaut = "00000000-0000-0000-0000-00000000d101";
      const idOverride = "00000000-0000-0000-0000-00000000d102";
      const idDeleted = "00000000-0000-0000-0000-00000000d103";
      const idOrphan = "00000000-0000-0000-0000-00000000d104";

      const keyUmlaut = `belege/${year}/umlaut.pdf`;
      const keyOverride = `belege/${year}/override.pdf`;
      const keyDeleted = `belege/${year}/deleted.pdf`;
      const keyOrphan = `belege/${year}/orphan.pdf`;

      // Mock-storage needs the bytes to be downloadable by the helper.
      await storage.upload({
        buffer: bytesUmlaut,
        mimeType: MIME_PDF,
        pathname: keyUmlaut,
      });
      await storage.upload({
        buffer: bytesOverride,
        mimeType: MIME_PDF,
        pathname: keyOverride,
      });
      await storage.upload({
        buffer: bytesDeleted,
        mimeType: MIME_PDF,
        pathname: keyDeleted,
      });
      await storage.upload({
        buffer: new Uint8Array([...PDF_HEAD, 0x24]),
        mimeType: MIME_PDF,
        pathname: keyOrphan,
      });

      // umlauts → ae/oe/ue/ss (the canary; if a regression flips the order
      // to lowercase-first, "büromaterial" becomes "bromaterial").
      await seedExpenseWithBeleg({
        expenseBusinessId: "AUS-2024-901",
        bezeichnung: "Büromaterial Übergröße",
        sphereSnapshot: "ideeller",
        year,
        fileId: idUmlaut,
        storageKey: keyUmlaut,
        sha256: "a".repeat(64),
      });

      // sphere_override 'zweckbetrieb' wins over snapshot 'ideeller'
      // (ADR-0008). If the SQL drops COALESCE this lands in
      // ausgaben/ideeller/ instead — wrong tax bucket.
      await seedExpenseWithBeleg({
        expenseBusinessId: "AUS-2024-902",
        bezeichnung: "Eventkasse",
        sphereSnapshot: "ideeller",
        sphereOverride: "zweckbetrieb",
        year,
        fileId: idOverride,
        storageKey: keyOverride,
        sha256: "b".repeat(64),
      });

      // Soft-deleted file — must NOT appear in bundle. If the WHERE clause
      // drops `f.deleted_at IS NULL` in a future refactor, deleted Belege
      // re-appear in the Steuerberater bundle (DSGVO + UX defect).
      await seedExpenseWithBeleg({
        expenseBusinessId: "AUS-2024-903",
        bezeichnung: "Soft Geloescht",
        sphereSnapshot: "ideeller",
        year,
        fileId: idDeleted,
        storageKey: keyDeleted,
        sha256: "c".repeat(64),
      });
      await updateFileViaAdmin(idDeleted, {
        deletedAt: `${year}-08-01T10:00:00Z`,
        deleteReason: "user_request",
      });

      // Orphan file (no owner row). The route's SQL requires at least one
      // of (expense, income, donation) joined; the orphan must be excluded.
      await seedFileViaAdmin({
        id: idOrphan,
        storageKey: keyOrphan,
        sha256: "d".repeat(64),
        uploadedAt: `${year}-09-15T10:00:00Z`,
        mimeType: MIME_PDF,
        originalFilename: "orphan.pdf",
        sourceKind: "form",
        uploadedBySubmitterEmail: "test@x.de",
      });

      // 2. Assemble.
      const { attachments } = await assembleBelegAttachments({
        year,
        db: getDb(),
        storage,
      });

      // 3. Two attachments expected: umlaut + override. Soft-deleted and
      //    orphan are excluded.
      expect(attachments).toHaveLength(2);
      const pathSet = new Set(attachments.map((a) => a.bundlePath));
      expect(pathSet).toContain(
        "ausgaben/ideeller/AUS-2024-901-bueromaterial-uebergroesse.pdf",
      );
      expect(pathSet).toContain(
        "ausgaben/zweckbetrieb/AUS-2024-902-eventkasse.pdf",
      );
      // Defensive: assert the deleted + orphan paths are NOT in the set
      // (catches a regression that silently drops the filter but adds
      // them under a different path).
      for (const a of attachments) {
        expect(a.bundlePath).not.toMatch(/soft|orphan/i);
      }

      // 4. Build the actual bundle.zip + unzip + verify byte-equal.
      const zipBuffer = await buildJahresabschlussBundle({
        year,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eur: emptyEur(year) as any,
        eurPdfBytes: null,
        spenden: [],
        belege: [],
        vereinName: "Test Verein",
        belegAttachments: attachments,
      });

      const zip = await JSZip.loadAsync(zipBuffer);
      const umlautPath =
        "09_Belege-2024/ausgaben/ideeller/AUS-2024-901-bueromaterial-uebergroesse.pdf";
      const overridePath =
        "09_Belege-2024/ausgaben/zweckbetrieb/AUS-2024-902-eventkasse.pdf";
      expect(zip.file(umlautPath)).not.toBeNull();
      expect(zip.file(overridePath)).not.toBeNull();

      const umlautRoundTrip = new Uint8Array(
        await zip.file(umlautPath)!.async("uint8array"),
      );
      expect(umlautRoundTrip).toEqual(bytesUmlaut);

      const overrideRoundTrip = new Uint8Array(
        await zip.file(overridePath)!.async("uint8array"),
      );
      expect(overrideRoundTrip).toEqual(bytesOverride);

      // 5. Nothing under 09_Belege/ besides those two. A regression that
      //    adds spurious entries (e.g. drops the orphan filter) would be
      //    caught here.
      const belegeEntries = Object.keys(zip.files).filter(
        (n) => n.startsWith("09_Belege-2024/") && !n.endsWith("/"),
      );
      expect(belegeEntries.sort()).toEqual([overridePath, umlautPath].sort());
    },
  );
});
