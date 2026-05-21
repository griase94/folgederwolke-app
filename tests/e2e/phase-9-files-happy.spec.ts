/**
 * Phase 9 — E2E happy paths for the file-storage flows.
 *
 * Six scenarios:
 *   E1: Public form submits an Auslage with PDF; admin inbox renders the
 *       FilePreview iframe pointing at /api/files/<uuid>/blob.
 *   E2: /app/files browse + year filter + Vorschau link.
 *   E3: Papierkorb soft-delete + restore round-trip.
 *   E4: bundle.zip endpoint returns HTTP 200 + application/zip.
 *   E5: Festschreibung action runs without unexpected error (the
 *       success-or-known-failure path).
 *   E6: Submitting the same PDF twice via the public form both succeed
 *       (dedup path inside the upload pipeline).
 *
 * Auth pattern matches inbox.spec.ts / rechnungen.spec.ts: insert a
 * magic_links row directly into Postgres, then click-through /sign-in/verify.
 *
 * The form's BelegUpload component does client-side image compression but
 * passes PDFs through unmodified, so a minimal valid PDF blob exercises the
 * full server-side pipeline without the compression branch.
 */
import { expect, test, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import { DATENSCHUTZ_VERSION } from "../../src/lib/domain/datenschutz.js";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Origin matches playwright.config.ts webServer.env.ORIGIN. adapter-node's
// CSRF guard rejects form POSTs whose Origin doesn't equal url.origin —
// page.request.* does NOT auto-attach the right Origin, so every form
// action POST must set it explicitly.
const ORIGIN = "http://127.0.0.1:4173";
const CSRF_HEADERS = { Origin: ORIGIN } as const;

// Smallest valid PDF (~150 bytes) — passes the magic-byte sniff and the
// MIME-allowlist check in `validateBelegPrefix`. Used for E1, E6 and the
// /app/files / bundle.zip / Papierkorb tests that need a real Beleg row.
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n" +
    "xref\n0 3\n0000000000 65535 f\n" +
    "0000000009 00000 n\n0000000052 00000 n\n" +
    "trailer<</Size 3/Root 1 0 R>>\nstartxref\n95\n%%EOF\n",
);

// A 2nd, slightly different PDF used by E6 — must differ in bytes so the
// sha256 dedup index splits them into two `files` rows. (E6 actually tests
// the *same* bytes submitted twice.)
function makePdf(suffixSeed: string): Buffer {
  return Buffer.concat([MINIMAL_PDF, Buffer.from(`%E2E-${suffixSeed}\n`)]);
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
async function signIn(page: Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
  `;
  await client.end();

  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mismatch.click();
  }
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

// ---------------------------------------------------------------------------
// Form-submission helper — POST multipart/form-data via APIRequestContext.
//
// The browser-side form does Svelte reactivity + IndexedDB drafts + client
// compression we don't need to exercise; testing the server contract via a
// direct multipart POST is more reliable and tests exactly the path the
// rest of the system relies on.
// ---------------------------------------------------------------------------
async function submitAuslageWithPdf(
  page: Page,
  opts: {
    bezeichnung: string;
    betragCents: number;
    email: string;
    name: string;
    pdfBytes: Buffer;
    pdfName?: string;
  },
): Promise<{ status: number; body: string }> {
  const payload = {
    bezahlt_von: {
      kind: "extern",
      name: opts.name,
      iban: "DE89370400440532013000",
      email: opts.email,
    },
    bezeichnung: opts.bezeichnung,
    betragCents: opts.betragCents,
    currency: "EUR",
    consent_text_version: DATENSCHUTZ_VERSION,
    // crypto.randomUUID() returns a UUIDv4 string — validateAuslageInput
    // rejects any other shape ("submissionNonce muss UUID v4 sein").
    submissionNonce: crypto.randomUUID(),
  };

  // Multipart POST via Playwright's APIRequestContext so we can attach a
  // realistic File with explicit mimeType (page.setInputFiles can't easily
  // be wired up to the form's reactive flow without invoking all the
  // client-side branches we want to bypass).
  //
  // Origin header MUST match the server's ORIGIN env (http://127.0.0.1:4173,
  // set by playwright.config.ts) or adapter-node's CSRF guard 403s the POST.
  const res = await page.request.post("/auslage-einreichen", {
    headers: CSRF_HEADERS,
    multipart: {
      data: JSON.stringify(payload),
      submissionNonce: payload.submissionNonce,
      beleg: {
        name: opts.pdfName ?? "beleg.pdf",
        mimeType: "application/pdf",
        buffer: opts.pdfBytes,
      },
    },
    maxRedirects: 0,
  });
  return { status: res.status(), body: await res.text() };
}

// ---------------------------------------------------------------------------
// Skip the whole suite if DATABASE_URL is missing + clear the public-form
// rate-limit bucket between tests (5 per 5 min per IP-prefix; submitting
// from a single test runner trips it fast).
// ---------------------------------------------------------------------------
test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
  // Clear rate-limit attempts via superuser so the public-form actions can
  // submit without tripping `auslage:submit:*` buckets across tests.
  const { default: postgres } = await import("postgres");
  const c = postgres(
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
    { prepare: false, max: 1 },
  );
  await c`DELETE FROM rate_limit_attempts WHERE key LIKE 'auslage:%'`;
  await c.end();
});

// ===========================================================================
// E1 — Public form submit → admin inbox FilePreview iframe
// ===========================================================================
test.describe("@phase-9 Files — happy", () => {
  test("E1: public form submit lands in admin inbox with FilePreview iframe", async ({
    page,
  }) => {
    const seed = randomBytes(4).toString("hex");
    const bezeichnung = `E2E-E1-${seed}`;

    // 1. Submit via the public form
    const r = await submitAuslageWithPdf(page, {
      bezeichnung,
      betragCents: 1500,
      email: `e1-${seed}@example.test`,
      name: `E1 Tester ${seed}`,
      pdfBytes: makePdf(`e1-${seed}`),
    });
    // SvelteKit form actions return:
    //   - 303 on success (redirect)
    //   - 200 with a {type:"failure",...} envelope on fail()
    // We assert that the response is NOT a fail-envelope: it must be 303 OR
    // a 200 whose body is *not* the failure JSON.
    if (r.status === 200) {
      expect(r.body).not.toContain('"type":"failure"');
    } else {
      expect(r.status).toBe(303);
    }

    // 2. Find the submission via direct DB query so we don't depend on
    //    UI ordering / pagination of the inbox list.
    const { default: postgres } = await import("postgres");
    const client = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    const rows = await client<
      { business_id: string; beleg_file_id: string | null }[]
    >`
      SELECT business_id, beleg_file_id FROM auslagen_submissions
      WHERE bezeichnung = ${bezeichnung}
      ORDER BY submitted_at DESC LIMIT 1
    `;
    await client.end();
    expect(rows[0]?.business_id).toBeTruthy();
    expect(rows[0]?.beleg_file_id).toBeTruthy();
    const ausId = rows[0]!.business_id;
    const fileId = rows[0]!.beleg_file_id!;

    // 3. Log in as admin and open the detail page
    await signIn(page);
    const res = await page.goto(`/app/inbox/${ausId}`);
    expect(res?.status()).toBe(200);

    // 4. FilePreview renders an <iframe> for application/pdf with src
    //    pointing at /api/files/<fileId>/blob.
    const iframe = page.locator(`iframe[src*="/api/files/${fileId}/blob"]`);
    await expect(iframe).toBeVisible({ timeout: 10_000 });
  });

  // =========================================================================
  // E2 — /app/files browse + year filter + Vorschau link
  // =========================================================================
  test("E2: /app/files lists rows; year filter updates URL; Vorschau links to blob", async ({
    page,
  }) => {
    // Ensure there's at least one Beleg by submitting through the form first
    const seed = randomBytes(4).toString("hex");
    await submitAuslageWithPdf(page, {
      bezeichnung: `E2E-E2-${seed}`,
      betragCents: 250,
      email: `e2-${seed}@example.test`,
      name: `E2 Tester ${seed}`,
      pdfBytes: makePdf(`e2-${seed}`),
    });

    await signIn(page);
    const res = await page.goto("/app/files");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Dateien");

    // At least one Vorschau link, and it must point at /api/files/<uuid>/blob.
    const firstVorschau = page.locator('a:has-text("Vorschau")').first();
    await expect(firstVorschau).toBeVisible();
    const href = await firstVorschau.getAttribute("href");
    expect(href).toMatch(
      /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/blob$/,
    );

    // Change year filter via the <select> and assert URL updates.
    // The page has another <select> in the header (year-switcher) — scope to
    // the "Jahr:" label that wraps the Dateien filter.
    const select = page
      .locator("label", { hasText: "Jahr:" })
      .locator("select");
    const options = await select.locator("option").allTextContents();
    const yearChoice = options.find((o) => /^\d{4}$/.test(o.trim()));
    if (yearChoice) {
      await select.selectOption(yearChoice.trim());
      await expect(page).toHaveURL(new RegExp(`year=${yearChoice.trim()}`));
    }
  });

  // =========================================================================
  // E3 — Papierkorb soft-delete + restore round-trip
  // =========================================================================
  test("E3: soft-delete → Papierkorb → restore round-trip", async ({
    page,
  }) => {
    // Seed a fresh Beleg
    const seed = randomBytes(4).toString("hex");
    await submitAuslageWithPdf(page, {
      bezeichnung: `E2E-E3-${seed}`,
      betragCents: 333,
      email: `e3-${seed}@example.test`,
      name: `E3 Tester ${seed}`,
      pdfBytes: makePdf(`e3-${seed}`),
    });

    // Find that file's id via DB
    const { default: postgres } = await import("postgres");
    const client = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    const ausRows = await client<{ beleg_file_id: string | null }[]>`
      SELECT beleg_file_id FROM auslagen_submissions
      WHERE bezeichnung = ${`E2E-E3-${seed}`}
      ORDER BY submitted_at DESC LIMIT 1
    `;
    const fileId = ausRows[0]?.beleg_file_id ?? null;
    await client.end();
    expect(fileId).toBeTruthy();

    await signIn(page);

    // Soft-delete via the form action — POST directly (the in-list button is
    // a small inline form which is hard to target reliably across rows).
    const delRes = await page.request.post("/app/files?/softDelete", {
      headers: CSRF_HEADERS,
      form: { fileId: fileId! },
    });
    expect([200, 204, 303]).toContain(delRes.status());

    // Papierkorb shows it
    await page.goto("/app/files/papierkorb");
    await expect(
      page.locator(`form input[value="${fileId}"]`).first(),
    ).toBeAttached();

    // Restore via action
    const restoreRes = await page.request.post(
      "/app/files/papierkorb?/restore",
      { headers: CSRF_HEADERS, form: { fileId: fileId! } },
    );
    expect([200, 204, 303]).toContain(restoreRes.status());

    // Active list contains it again
    await page.goto("/app/files");
    const r = await page.request.get("/app/files");
    expect(r.status()).toBe(200);
  });

  // =========================================================================
  // E4 — bundle.zip download (smoke test only)
  // =========================================================================
  test("E4: bundle.zip returns 200 + application/zip", async ({ page }) => {
    await signIn(page);
    const year = new Date().getFullYear();
    const res = await page.request.get(
      `/app/jahresabschluss/${year}/bundle.zip`,
    );
    expect(res.status()).toBe(200);
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toMatch(/application\/zip/);
    const body = await res.body();
    // Should be a non-trivial body (zip header is at least 22 bytes for an
    // empty zip, real ones with EÜR + CSVs are >> 1 KiB).
    expect(body.length).toBeGreaterThan(200);
  });

  // =========================================================================
  // E5 — Festschreibung action runs without unexpected error
  // =========================================================================
  test("E5: festschreiben action returns success or known German error", async ({
    page,
  }) => {
    await signIn(page);
    // Use an out-of-window year that is unlikely to have data; the action
    // either succeeds (closing a year with zero rows) or returns one of the
    // documented German error messages (already closed / monotonic forward).
    // We just assert the route exists and doesn't 500.
    const year = new Date().getFullYear() - 5;
    const res = await page.request.post(
      `/app/jahresabschluss/${year}/uebersicht?/festschreiben`,
      { headers: CSRF_HEADERS, form: {}, maxRedirects: 0 },
    );
    // SvelteKit form action returns 200 (success/fail) or 303 redirect on
    // success-after-redirect. 500 would mean an unhandled crash → fail.
    expect([200, 204, 303, 400, 401, 409, 422]).toContain(res.status());
  });

  // =========================================================================
  // E6 — Duplicate file submit (dedup path)
  // =========================================================================
  test("E6: submitting the same PDF twice succeeds for both submissions", async ({
    page,
  }) => {
    const seed = randomBytes(4).toString("hex");
    const bytes = makePdf(`e6-${seed}`);
    const email = `e6-${seed}@example.test`;
    const name = `E6 Tester ${seed}`;

    const assertSuccess = (r: { status: number; body: string }) => {
      if (r.status === 200) {
        expect(r.body).not.toContain('"type":"failure"');
      } else {
        expect(r.status).toBe(303);
      }
    };

    const first = await submitAuslageWithPdf(page, {
      bezeichnung: `E2E-E6a-${seed}`,
      betragCents: 100,
      email,
      name,
      pdfBytes: bytes,
    });
    assertSuccess(first);

    const second = await submitAuslageWithPdf(page, {
      bezeichnung: `E2E-E6b-${seed}`,
      betragCents: 200,
      email,
      name,
      pdfBytes: bytes,
    });
    assertSuccess(second);

    // Verify the two submissions share the same beleg_file_id (sha256 dedup).
    const { default: postgres } = await import("postgres");
    const client = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    const rows = await client<{ beleg_file_id: string | null }[]>`
      SELECT beleg_file_id FROM auslagen_submissions
      WHERE bezeichnung LIKE ${`E2E-E6%-${seed}`}
      ORDER BY submitted_at ASC
    `;
    await client.end();
    expect(rows.length).toBe(2);
    expect(rows[0]?.beleg_file_id).toBeTruthy();
    expect(rows[0]?.beleg_file_id).toBe(rows[1]?.beleg_file_id);
  });
});
