/**
 * @aurora-impl-d-abschluss — the D-Flow (Jahresabschluss/EÜR/GoBD) cross-probe
 * numeric-equality gate + the Festschreib UI round-trip.
 *
 * The headline gate (flow brief §1, ratified seed-agnostic): the same Überschuss
 * reads identically across Hub · EÜR-Übersicht · Sphären-Matrix, and the
 * Buchungslisten-Feed reconciles to the EÜR via the single-source
 * Mitgliedsbeitrag component:
 *
 *   Hub-Mini-EÜR == EÜR-Hero == Matrix-Σ                      (always)
 *   Feed-Fuß + EÜR-Beitragskomponente == EÜR-Überschuss       (reconciliation)
 *   gobd-Zähler (einnahmen/ausgaben/spenden) == Buchungslisten-Art-Zähler
 *
 * No hard-coded numbers — every value is read from the rendered DOM and asserted
 * equal to the others, so the gate survives any seed change (team-lead ruling).
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
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

/** "1.234,56 €" / "−94,23 €" → integer cents. */
function euroToCents(raw: string): number {
  const neg = /[-−]/.test(raw);
  const m = raw.replace(/\s/g, "").match(/([\d.]+),(\d{2})/);
  if (!m) throw new Error(`unparseable euro string: "${raw}"`);
  const cents =
    parseInt(m[1]!.replace(/\./g, ""), 10) * 100 + parseInt(m[2]!, 10);
  return neg ? -cents : cents;
}

/** Leading integer of "2 Einnahmen" → 2. */
function leadingInt(raw: string): number {
  const m = raw.trim().match(/(\d+)/);
  if (!m) throw new Error(`no integer in "${raw}"`);
  return parseInt(m[1]!, 10);
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@aurora-impl-d-abschluss D-Flow cross-probe", () => {
  test("Überschuss is identical across Hub, EÜR-Hero and Matrix-Σ; feed reconciles to the EÜR; gobd counts match the Art counts", async ({
    page,
  }) => {
    await signIn(page);

    // ── Hub: read the abschlussbereite Karte (year + Überschuss) ──────────────
    await page.goto("/app/jahresabschluss");
    const ready = page.locator('[data-testid="year-card"][data-state="ready"]');
    await expect(ready).toBeVisible();
    const year = leadingInt(await ready.locator(".yc-year").innerText());
    const hubCents = euroToCents(
      await ready.getByTestId("yc-ueberschuss").innerText(),
    );

    // ── EÜR-Übersicht: Hero + Matrix-Σ ───────────────────────────────────────
    await page.goto(`/app/jahresabschluss/${year}/uebersicht`);
    const heroCents = euroToCents(
      await page.getByTestId("ueberschuss-hero").innerText(),
    );
    const matrixCents = euroToCents(
      await page.getByTestId("matrix-total-ueberschuss").innerText(),
    );
    // The always-true equalities (both from the single EÜR composer).
    expect(matrixCents).toBe(heroCents);
    expect(hubCents).toBe(heroCents);
    // The kreuzprobe ✓-footer must render (Σ Sphären == EÜR).
    await expect(page.getByTestId("kreuzprobe")).toBeVisible();

    // ── Buchungsliste: feed-foot == EÜR ──────────────────────────────────────
    // Since S3 the feed carries paid Mitgliedsbeiträge as a fourth arm, so the
    // foot equals the EÜR-Überschuss directly. The earlier form of this check
    // added a "+ X Mitgliedsbeiträge" note on top, because the list was missing
    // that money; the note and its testid are gone, and adding it back would
    // now double-count.
    await page.goto(`/app/jahresabschluss/${year}/buchungsliste`);
    const footCents = euroToCents(
      await page
        .locator('[data-testid="buchungsliste-foot"] .lf-amt')
        .innerText(),
    );
    // The list is complete, so the honest "= EÜR ✓" must render — before S3 it
    // could never appear in a year where anyone had paid their Beitrag.
    await expect(page.getByTestId("foot-kreuzprobe")).toBeVisible();
    expect(footCents).toBe(heroCents);

    // Art-chip counts (feed).
    const feedIncome = leadingInt(
      await page.getByTestId("filter-kind-income").locator(".cnt").innerText(),
    );
    const feedExpense = leadingInt(
      await page.getByTestId("filter-kind-expense").locator(".cnt").innerText(),
    );
    const feedDonation = leadingInt(
      await page
        .getByTestId("filter-kind-donation")
        .locator(".cnt")
        .innerText(),
    );

    // ── gobd-export: Zähler == Art-Zähler ────────────────────────────────────
    await page.goto(`/app/jahresabschluss/${year}/gobd-export`);
    const countsText = await page.getByTestId("gobd-counts").innerText();
    const [gEin, gAus, gSpe] = [
      ...countsText.matchAll(/(\d+)\s+(?:Einnahmen|Ausgaben|Spenden)/g),
    ].map((m) => parseInt(m[1]!, 10));
    expect(gEin).toBe(feedIncome);
    expect(gAus).toBe(feedExpense);
    expect(gSpe).toBe(feedDonation);
  });

  test("Hub Festschreib round-trip: ready card → modal facts + friction gate (no mutation)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/jahresabschluss");
    const ready = page.locator('[data-testid="year-card"][data-state="ready"]');
    await expect(ready).toBeVisible();

    // The close CTA lives ONLY at the Hub (D1a).
    const openBtn = page.getByTestId("hub-festschreiben-open");
    const blockedBtn = page.getByTestId("hub-festschreiben-blocked");
    // Exactly one of them shows depending on canFestschreiben.
    const canClose = await openBtn.isVisible().catch(() => false);
    if (!canClose) {
      await expect(blockedBtn).toBeVisible();
      return; // year has open blockers — the disabled state is the whole story
    }

    await openBtn.click();
    const modal = page.getByTestId("festschreibung-modal");
    await expect(modal).toBeVisible();
    // Friction gate: submit disabled until the confirm checkbox is checked.
    const submit = page.getByTestId("hub-festschreiben-submit");
    await expect(submit).toBeDisabled();
    // Check the ConfirmCheck (sr-only native checkbox) — then submit enables.
    await modal
      .locator('input[type="checkbox"]')
      .first()
      .check({ force: true });
    await expect(submit).toBeEnabled();
    // Do NOT submit — closing the year would mutate shared seed state.
  });
});
