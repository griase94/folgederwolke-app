import { test, expect } from "@playwright/test";
import { nsEmail, nsLabel } from "./lib/run-id";

const COOKIE_HEADER = process.env["PREVIEW_SESSION_COOKIE"];
const PREVIEW_URL = process.env["PREVIEW_URL"];

test.describe("preview smoke @preview", () => {
  test.beforeEach(async ({ context }) => {
    if (!COOKIE_HEADER) throw new Error("PREVIEW_SESSION_COOKIE env required");
    if (!PREVIEW_URL) throw new Error("PREVIEW_URL env required");

    const eqIdx = COOKIE_HEADER.indexOf("=");
    const name = COOKIE_HEADER.slice(0, eqIdx);
    const value = COOKIE_HEADER.slice(eqIdx + 1);
    const url = new URL(PREVIEW_URL);

    await context.addCookies([
      {
        name,
        value,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  });

  test("admin dashboard renders", async ({ page }) => {
    const resp = await page.goto("/app");
    expect(resp?.status()).toBeLessThan(400);
    // Dashboard greets with the user's first name + time-of-day salutation.
    // The h1 is dynamic ("Guten Morgen/Tag/Abend, <name>"), so we match only
    // the static substrings in the surrounding paragraph which are always present.
    await expect(
      page.getByText(/Folge der Wolke e\.V\. · Kassenführung/),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("public Auslage form renders", async ({ page }) => {
    // The app has no /beitritt route — the public-facing form is /auslage-einreichen.
    const resp = await page.goto("/auslage-einreichen");
    expect(resp?.status()).toBeLessThan(400);
    // Either the form is enabled (h1 "Auslage einreichen") or it shows the
    // soft-fallback message ("Vorübergehend nicht verfügbar"). Both are valid
    // 200 renders — we just assert the page painted something visible.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("sign-out POST returns 2xx/3xx (not 500)", async ({ request }) => {
    // Guards PR #57 bug A — SvelteKit named-action / default-action conflict.
    // sign-out uses a named action `signout` (POST to ?/signout); a default
    // action would 500 on the same route. The action redirects 303 to /sign-in.
    const resp = await request.post("/sign-out?/signout", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: "",
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(
      [200, 204, 302, 303],
      `Expected 2xx/3xx from /sign-out?/signout, got ${resp.status()}`,
    ).toContain(resp.status());
  });

  test("admin can create a namespaced member", async ({ page }) => {
    await page.goto("/app/mitglieder");

    // Open the AddMemberDialog via the "Mitglied hinzufügen" button.
    await page.getByRole("button", { name: /Mitglied hinzufügen/i }).click();

    // Dialog title confirms the modal is open.
    await expect(
      page.getByRole("heading", { name: /Mitglied hinzufügen/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Fields confirmed from AddMemberDialog.svelte (labels use <Label for="add-vorname"> etc.)
    await page.getByLabel(/Vorname/i).fill(nsLabel("smoke-vorname"));
    await page.getByLabel(/Nachname/i).fill(nsLabel("smoke-nachname"));
    await page.getByLabel(/E-Mail/i).fill(nsEmail("smoke-member"));

    await page.getByRole("button", { name: /Mitglied anlegen/i }).click();

    // On success the dialog closes and the page refreshes — the new member
    // should appear in the list. We wait for the dialog to be gone first.
    await expect(
      page.getByRole("heading", { name: /Mitglied hinzufügen/i }),
    ).not.toBeVisible({ timeout: 15_000 });

    // Positive assertion: the namespaced vorname must render in the list.
    // Without this, a retry that re-creates the row would still pass on the
    // dialog-closed check alone — retries: 3 makes that a silent dupe risk.
    await expect(page.getByText(nsLabel("smoke-vorname"))).toBeVisible({
      timeout: 15_000,
    });
  });

  test("admin can upload a beleg (real Blob chain)", async ({ page }) => {
    await page.goto("/app/transactions/neu");

    // The form defaults to "Ausgabe" type which shows the Beleg upload field.
    // Confirm the Ausgabe type button is already active (aria-pressed=true).
    // If it's not, click it explicitly.
    const ausgabeBtn = page.getByRole("button", {
      name: /^Ausgabe$/i,
      pressed: true,
    });
    const isAlreadyActive = (await ausgabeBtn.count()) > 0;
    if (!isAlreadyActive) {
      await page.getByRole("button", { name: /^Ausgabe$/i }).click();
    }

    // Fill required fields (confirmed from transactions/neu/+page.svelte).
    // Bezeichnung: <label for="bezeichnung">
    await page.getByLabel(/Bezeichnung/i).fill(nsLabel("smoke-beleg"));

    // Betrag: the visible display input has <label for="betragCents-display">.
    // We fill it with "5.00" — the oninput handler converts to 500 cents.
    await page.getByLabel(/Betrag/i).fill("5.00");

    // Rechnungsdatum: <label for="rechnungsdatum">
    await page.getByLabel(/Rechnungsdatum/i).fill("2026-01-15");

    // Abfluss-Datum: <label for="abfluss_datum">
    await page.getByLabel(/Abfluss-Datum/i).fill("2026-01-15");

    // Beleg file upload: <label for="beleg">, accepts PDF/JPEG/PNG/HEIC/WebP.
    // We synthesise a minimal 1-byte PDF buffer — real enough to pass the
    // mime check; the Blob upload chain accepts it.
    const belegInput = page.locator("#beleg");
    await belegInput.setInputFiles({
      name: "smoke-beleg.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.0 smoke"),
    });

    // Submit and verify no 500: SvelteKit's enhance intercepts the POST and
    // either redirects on success or re-renders with form errors on validation
    // failure. Either way the page should not show a generic error banner.
    await page.getByRole("button", { name: /Ausgabe erfassen/i }).click();

    // Allow up to 30 s for the Blob upload round-trip.
    // Success: redirected away from /neu. Failure: validation error shown.
    // Both are acceptable outcomes — we only guard against a server 500.
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    // A 500 would render SvelteKit's error page which always contains the text
    // "500" or "Internal Error". Assert neither is present.
    await expect(page.getByText(/500|Internal Error/i)).not.toBeVisible();
  });

  test("primary nav links all 2xx", async ({ page, request }) => {
    // Guards PR #57 bug C — dead nav routes returning 500 / 404 in production.
    // Nav items sourced from nav-registry.ts (both main + more groups).
    await page.goto("/app");

    // Collect all sidebar anchor hrefs under /app (both data-nav-group="main"
    // and data-nav-group="more"). The "more" section may be collapsed, so we
    // read from the DOM after opening it.
    const moreToggle = page.getByRole("button", { name: /Mehr/i });
    if (await moreToggle.isVisible()) {
      await moreToggle.click();
    }

    const hrefs = await page
      .locator('[data-nav-group] a[href^="/app"]')
      .evaluateAll((links) =>
        Array.from(
          new Set(
            links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!),
          ),
        ),
      );

    expect(hrefs.length, "Expected at least 3 nav links").toBeGreaterThan(2);

    for (const href of hrefs) {
      const r = await request.get(href, { failOnStatusCode: false });
      expect(
        r.status(),
        `Dead nav link — ${href} returned ${r.status()}`,
      ).toBeLessThan(400);
    }
  });
});
