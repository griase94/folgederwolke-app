/**
 * Julia's review — round 3: detail pages, sub-routes, error pages, form-submission deep-dive.
 */
import { test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { DATENSCHUTZ_VERSION } from "../../src/lib/domain/datenschutz.js";

const DEV_BASE = "http://127.0.0.1:5175";
const SHOTS_DIR =
  "/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/docs/reviews/2026-05-19-julia-screenshots";
const ADMIN_EMAIL = "juliaschwarz97@web.de";

test.use({ baseURL: DEV_BASE });

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function insertMagicLink(
  email: string,
): Promise<{ rawToken: string; tokenHash: string }> {
  const { default: postgres } = await import("postgres");
  const url =
    process.env["DATABASE_URL"] ??
    "postgresql://neondb_owner:npg_WeOF7x0IjnsH@ep-spring-bread-alp6fezs-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  const client = postgres(url, { prepare: false, max: 1 });
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${email}, ${expiresAt})
  `;
  await client.end();
  return { rawToken, tokenHash };
}

async function authAsJulia(
  page: import("@playwright/test").Page,
): Promise<void> {
  const { rawToken } = await insertMagicLink(ADMIN_EMAIL);
  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const continueBtn = page
    .locator('button:has-text("Weiter als"), button[type="submit"]')
    .first();
  await continueBtn.click();
  await page.waitForURL(/\/app/, { timeout: 15_000 });
}

async function shot(
  page: import("@playwright/test").Page,
  name: string,
): Promise<void> {
  await mkdir(SHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: join(SHOTS_DIR, `${name}.png`),
    fullPage: true,
  });
}

interface Finding {
  severity: "MUST" | "SHOULD" | "NICE";
  page: string;
  tried: string;
  happened: string;
  expected: string;
  fix: string;
  shot?: string;
}
const findings: Finding[] = [];
function note(f: Finding) {
  findings.push(f);
  console.log(`[${f.severity}] ${f.page} → ${f.tried} → ${f.happened}`);
}
test.afterAll(async () => {
  await mkdir(SHOTS_DIR, { recursive: true });
  await appendFile(
    join(SHOTS_DIR, "..", "2026-05-19-julia-findings-3.json"),
    JSON.stringify(findings, null, 2),
  );
});

test.describe("@julia-3", () => {
  test("empty-submit form: validate() catches before POST?", async ({
    page,
  }) => {
    await page.goto("/auslage-einreichen");
    // Don't fill anything. Click submit. Should NOT post to server.
    const submit = page.locator(
      'button[type="submit"]:has-text("Auslage einreichen")',
    );
    // Listen to navigation (kept for trace context — not asserted here)
    page.on("framenavigated", () => {
      // intentional no-op: navigation observed via URL polling below
    });
    await submit.click();
    await page.waitForTimeout(800);
    const urlAfter = page.url();
    const errCount = await page.locator(".text-destructive").count();
    note({
      severity:
        urlAfter.includes("/auslage-einreichen") &&
        !urlAfter.includes("?/default")
          ? "NICE"
          : "MUST",
      page: "/auslage-einreichen",
      tried: "Mit komplett leerem Formular auf 'Auslage einreichen' klicken",
      happened: `URL nach Klick: ${urlAfter}, ${errCount} rote Hinweise`,
      expected: "Inline-Fehler, KEIN POST, KEINE 500-Seite",
      fix: "validate() muss e.preventDefault() VOR jeglichem submit-Verhalten aufrufen",
      shot: "no-shot",
    });
  });

  test("auslagen-submission: missing rechnungsdatum but with all required → server 500?", async ({
    page,
  }) => {
    await page.goto("/auslage-einreichen");
    await page.fill("#bezeichnung", "Test ohne Datum");
    await page.fill("#betrag", "5,00");
    await page.fill("#rechnungsdatum", "");
    await page.check('input[name="datenschutz_consent"]');
    await page
      .locator('button[type="submit"]:has-text("Auslage einreichen")')
      .click();
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const text = (await page.locator("body").textContent()) ?? "";
    const hasSuccess = url.includes("/auslage-eingereicht");
    const has500 = /500|Internal Error|Ein Fehler/.test(text);
    note({
      severity: has500 ? "MUST" : hasSuccess ? "NICE" : "SHOULD",
      page: "/auslage-einreichen",
      tried: "Form ausgefüllt aber Rechnungsdatum leer gelassen",
      happened: has500
        ? "500 Internal Error"
        : hasSuccess
          ? "Erfolg, akzeptiert"
          : `URL: ${url}, Text: ${text.slice(0, 200).replace(/\s+/g, " ")}`,
      expected: "Entweder akzeptieren oder klarer Validation-Error",
      fix: "Server-Validierung darf nicht 500en — fail(422) reicht",
    });
  });

  test("auslagen 'extern' mode — render check", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await page.click('label:has-text("Externe Person"), input[value="extern"]');
    await page.waitForTimeout(300);
    await shot(page, "100-auslage-extern");
    // Now look for extern fields
    const nameField = page
      .locator(
        'input[id*="extern" i][type="text"], input[name="extern_name"], input[placeholder*="ame"]',
      )
      .first();
    const ibanField = page
      .locator('input[placeholder*="IBAN" i], input[id*="iban" i]')
      .first();
    const emailField = page.locator('input[type="email"]').first();
    const nameVis = await nameField.isVisible().catch(() => false);
    const ibanVis = await ibanField.isVisible().catch(() => false);
    const emailVis = await emailField.isVisible().catch(() => false);
    note({
      severity: nameVis && ibanVis && emailVis ? "NICE" : "SHOULD",
      page: "/auslage-einreichen (extern)",
      tried: "Externe Person auswählen, Felder prüfen",
      happened: `Name=${nameVis}, IBAN=${ibanVis}, Email=${emailVis}`,
      expected: "Alle drei Felder sichtbar",
      fix: "—",
      shot: "100-auslage-extern",
    });
  });

  test("auslagen extern with bad IBAN", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await page.click('label:has-text("Externe Person")');
    await page.waitForTimeout(200);
    const ibanField = page
      .locator('input[placeholder*="IBAN" i], input[id*="iban" i]')
      .first();
    if (await ibanField.isVisible().catch(() => false)) {
      await ibanField.fill("KAPUTT 1234");
      await ibanField.blur();
      await page.waitForTimeout(200);
      const err = await page
        .locator("text=/IBAN/i")
        .nth(1)
        .textContent()
        .catch(() => null);
      note({
        severity: err && /ungültig|invalid/i.test(err) ? "NICE" : "SHOULD",
        page: "/auslage-einreichen (extern, IBAN)",
        tried: "IBAN 'KAPUTT 1234' tippen und blur",
        happened: `Hinweis: ${err}`,
        expected: "Inline 'ungültige IBAN'",
        fix: "IBAN-Validation client-seitig",
      });
    }
  });

  test("rapid double-click submit", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await page.fill("#bezeichnung", "Doppelklick-Test");
    await page.fill("#betrag", "1,00");
    await page.check('input[name="datenschutz_consent"]');
    const submit = page.locator(
      'button[type="submit"]:has-text("Auslage einreichen")',
    );
    // Click twice rapidly
    await Promise.all([submit.click(), submit.click().catch(() => {})]);
    await page.waitForTimeout(2000);
    const url = page.url();
    note({
      severity: "NICE",
      page: "/auslage-einreichen",
      tried: "Doppelklick auf Submit",
      happened: `URL: ${url}`,
      expected: "Nur eine Einreichung — der isSubmitting guard greift",
      fix: "—",
    });
  });

  test("detail page non-existent mitglied", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/mitglieder/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    await shot(page, "101-mitglieder-bogus-id");
    const text = (await page.locator("body").textContent()) ?? "";
    const has404 = /404|nicht gefunden/i.test(text);
    note({
      severity: has404 ? "NICE" : "SHOULD",
      page: "/app/mitglieder/[bogus]",
      tried: "Erfundene UUID als Mitglied-Detail aufrufen",
      happened: has404
        ? "404"
        : `Inhalt: ${text.slice(0, 200).replace(/\s+/g, " ")}`,
      expected: "404 oder Fehler 'Mitglied nicht gefunden'",
      fix: "—",
    });
  });

  test("jahresabschluss detail page", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/jahresabschluss");
    await page.waitForLoadState("networkidle");
    const row = page
      .locator('a:has-text("Buchungsjahr"), a[href*="jahresabschluss"]')
      .first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForLoadState("networkidle");
      await shot(page, "102-jahresabschluss-detail");
      const text = (await page.locator("body").textContent()) ?? "";
      note({
        severity: /500|Error/i.test(text) ? "MUST" : "NICE",
        page: "/app/jahresabschluss/[year]",
        tried: "Auf das Buchungsjahr klicken",
        happened: /500/.test(text)
          ? "500 Error"
          : `Inhalt geladen (~${text.length} Zeichen)`,
        expected: "EÜR Übersicht",
        fix: "—",
        shot: "102-jahresabschluss-detail",
      });
    }
  });

  test("audit-inbox direct row click", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/inbox/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    await shot(page, "103-inbox-bogus-id");
    const text = (await page.locator("body").textContent()) ?? "";
    const has404 = /404|nicht gefunden/i.test(text);
    note({
      severity: has404 ? "NICE" : "SHOULD",
      page: "/app/inbox/[bogus]",
      tried: "Inbox-Detail mit erfundener ID",
      happened: has404
        ? "404"
        : `Inhalt: ${text.slice(0, 200).replace(/\s+/g, " ")}`,
      expected: "Klare 404",
      fix: "—",
    });
  });

  test("auslage-status accept-only-AUS-id format?", async ({ page }) => {
    await page.goto("/auslage-status/not-a-valid-id");
    await page.waitForLoadState("networkidle");
    await shot(page, "104-status-malformed-id");
    const text = (await page.locator("body").textContent()) ?? "";
    note({
      severity: "NICE",
      page: "/auslage-status/not-a-valid-id",
      tried: "Komplett kaputte ID-Form",
      happened: text.slice(0, 200).replace(/\s+/g, " "),
      expected: "—",
      fix: "—",
    });
  });

  test("public form rate-limit — 6th submission in 5min?", async ({
    request,
  }) => {
    // The route specifies max 5 per 5min per IP-prefix. Try 6.
    const url = `${DEV_BASE}/auslage-einreichen?/default`;
    const payload = JSON.stringify({
      bezahlt_von: { kind: "verein" },
      bezeichnung: "Rate-limit test",
      betragCents: 100,
      currency: "EUR",
      rechnungsdatum: "2026-05-19",
      consent_text_version: DATENSCHUTZ_VERSION,
    });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await request.post(url, {
        multipart: { data: payload },
      });
      statuses.push(r.status());
    }
    const has429 = statuses.includes(429);
    note({
      severity: has429 ? "NICE" : "SHOULD",
      page: "/auslage-einreichen",
      tried: "7 schnelle POSTs in Folge (Rate-Limit testen)",
      happened: `Status-Sequenz: [${statuses.join(",")}]`,
      expected: "Spätestens die 6. Anfrage sollte 429 sein",
      fix: "—",
    });
  });

  test("/_app referencing — does service worker work?", async ({ page }) => {
    await page.goto("/sign-in");
    const sw = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    note({
      severity: "NICE",
      page: "/",
      tried: "Service Worker registriert?",
      happened: `${sw ?? 0} Registrations`,
      expected: "Mind. 1, sonst keine echte PWA",
      fix: "—",
    });
  });

  test("verify mismatch — different browser, click 'Weiter als'", async ({
    browser,
  }) => {
    const { rawToken } = await insertMagicLink(ADMIN_EMAIL);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${DEV_BASE}/sign-in/verify?token=${rawToken}`);
    await page.waitForLoadState("networkidle");
    await shot(page, "105-verify-mismatch-ui");
    const warning = page.locator(
      "text=/Hinweis|anderen Browser|anderem Gerät/i",
    );
    const hasWarn = await warning
      .first()
      .isVisible()
      .catch(() => false);
    note({
      severity: hasWarn ? "NICE" : "SHOULD",
      page: "/sign-in/verify (mismatch)",
      tried:
        "Magic Link in anderem Browser-Context aufrufen, suchen nach Warnung",
      happened: hasWarn ? "Warnung sichtbar" : "Keine Warnung",
      expected:
        "Visueller Hinweis, dass Link auf anderem Gerät angefordert wurde",
      fix: "—",
    });
    await ctx.close();
  });

  test("password-manager hint — autocomplete on email", async ({ page }) => {
    await page.goto("/sign-in");
    const ac = await page
      .locator('input[name="email"]')
      .getAttribute("autocomplete");
    note({
      severity: ac === "email" || ac === "username" ? "NICE" : "SHOULD",
      page: "/sign-in",
      tried: "autocomplete-Attribut prüfen",
      happened: `autocomplete=${ac}`,
      expected: "email oder username",
      fix: "—",
    });
  });

  test("invoice list page — does it have any data?", async ({ page }) => {
    await authAsJulia(page);
    const resp = await page.goto("/app/rechnungen");
    const status = resp?.status();
    await shot(page, "106-rechnungen-bug");
    note({
      severity: (status ?? 0) >= 500 ? "MUST" : "NICE",
      page: "/app/rechnungen",
      tried: "Rechnungen-Liste aufrufen",
      happened: `Status ${status}`,
      expected: "200 — auch wenn leer",
      fix: "Loader debuggen — wahrscheinlich exception in DB-Query oder Schema-Mismatch",
      shot: "106-rechnungen-bug",
    });
  });

  test("inbox column 'Status' or filter UI", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/inbox");
    await page.waitForLoadState("networkidle");
    await shot(page, "107-inbox-full");
    const tabs = await page.locator('[role="tab"], button[role="tab"]').count();
    note({
      severity: "NICE",
      page: "/app/inbox",
      tried: "Tabs / Filter zählen",
      happened: `${tabs} Tabs gefunden`,
      expected: "Mind. 'Offen' / 'Genehmigt' / 'Abgelehnt' Tabs",
      fix: "—",
    });
  });

  test("/api/search exists?", async ({ request }) => {
    const r = await request.get(`${DEV_BASE}/api/search?q=test`);
    note({
      severity: r.ok() || r.status() === 401 ? "NICE" : "SHOULD",
      page: "/api/search",
      tried: "API-Search unauth",
      happened: `Status ${r.status()}`,
      expected: "401 wenn unauth, 200 wenn auth",
      fix: "—",
    });
  });

  test("mobile bottom-tab-bar tap goes to right page", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 800 },
    });
    const page = await ctx.newPage();
    const { rawToken } = await insertMagicLink(ADMIN_EMAIL);
    await page.goto(`${DEV_BASE}/sign-in/verify?token=${rawToken}`);
    const btn = page.locator('button[type="submit"]').first();
    await btn.click();
    await page.waitForURL(/\/app/);
    // tap Audit Inbox tab in bottom bar
    const tab = page
      .locator(
        'nav a:has-text("Audit Inbox"), nav button:has-text("Audit Inbox")',
      )
      .last();
    if (await tab.isVisible().catch(() => false)) {
      await tab.click();
      await page.waitForLoadState("networkidle");
      const ok = page.url().includes("/app/inbox");
      note({
        severity: ok ? "NICE" : "SHOULD",
        page: "Mobile bottom-bar",
        tried: "Auf 'Audit Inbox' in Bottom-Bar tippen",
        happened: `URL: ${page.url()}`,
        expected: "/app/inbox",
        fix: "—",
      });
    }
    await ctx.close();
  });

  test("logo on sign-in page links to home", async ({ page }) => {
    await page.goto("/sign-in");
    // There may or may not be a logo
    const logo = page.locator(
      'a:has(span:has-text("FW")), a:has-text("Folge der Wolke")',
    );
    const hasLogo = await logo
      .first()
      .isVisible()
      .catch(() => false);
    note({
      severity: hasLogo ? "NICE" : "SHOULD",
      page: "/sign-in",
      tried: "Logo auf Sign-in Seite suchen",
      happened: hasLogo ? "Logo vorhanden" : "Kein Logo / Branding sichtbar",
      expected: "Vereinslogo + Name in Top-Bereich der Sign-in Seite",
      fix: "Logo + 'Folge der Wolke e.V.' oben auf /sign-in",
    });
  });

  test("text-only sign-in page is missing a 'Was passiert nach Klick' hint", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    const text = (await page.locator("body").textContent()) ?? "";
    const hasHint = /Spam|Posteingang|Link bekommen|nicht sicher/i.test(text);
    note({
      severity: hasHint ? "NICE" : "NICE",
      page: "/sign-in",
      tried: "Hilfetext für 'Was passiert nach dem Senden' suchen",
      happened: hasHint ? "Hint da" : "Nichts erklärendes",
      expected:
        "Hinweis dass eine E-Mail in 1-2 Minuten kommt, ggf. Spam prüfen",
      fix: "Erklärtext am Ende des Formulars",
    });
  });

  test("/sign-out without auth", async ({ page }) => {
    // Without any cookie
    const r = await page.goto("/sign-out");
    note({
      severity: "NICE",
      page: "/sign-out (anonymous)",
      tried: "Sign-out ohne Session aufrufen",
      happened: `URL: ${page.url()}, status: ${r?.status()}`,
      expected: "Keine 500, leiser Redirect",
      fix: "—",
    });
  });

  test("favicon present", async ({ request }) => {
    const r = await request.get(`${DEV_BASE}/favicon.ico`);
    const r2 = await request.get(`${DEV_BASE}/favicon.svg`);
    note({
      severity: r.ok() || r2.ok() ? "NICE" : "NICE",
      page: "/favicon",
      tried: "Favicon abrufen (.ico und .svg)",
      happened: `ico=${r.status()}, svg=${r2.status()}`,
      expected: "Mindestens eine 200",
      fix: r.ok() || r2.ok() ? "—" : "favicon ergänzen",
    });
  });
});
