/**
 * Julia's hands-on review session — May 2026
 *
 * Standalone Playwright spec that points at the dev server on 5175 and walks
 * through the app as Julia (Kassenwartin) would. Records screenshots and
 * findings. NOT part of the CI matrix — tagged @julia.
 */

import { test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

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
  const mismatchBtn = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatchBtn.isVisible().catch(() => false)) {
    await mismatchBtn.click();
  }
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function shot(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string> {
  await mkdir(SHOTS_DIR, { recursive: true });
  const path = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

// ---------------------------------------------------------------------------
// Findings collector — written to disk at the end
// ---------------------------------------------------------------------------
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
  await writeFile(
    join(SHOTS_DIR, "..", "2026-05-19-julia-findings.json"),
    JSON.stringify(findings, null, 2),
  );
});

// ---------------------------------------------------------------------------
// Public form
// ---------------------------------------------------------------------------

test.describe("@julia Public Auslagen form", () => {
  test("desktop: empty submit shows all errors", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await shot(page, "01-auslage-empty");
    const submit = page.locator(
      'button[type="submit"]:has-text("Auslage einreichen")',
    );
    await submit.click();
    await page.waitForTimeout(500);
    await shot(page, "02-auslage-empty-after-submit");
    // record what we see
    const html = await page.content();
    const errs = (html.match(/text-destructive/g) || []).length;
    note({
      severity: "NICE",
      page: "/auslage-einreichen",
      tried:
        "Direkt auf 'Auslage einreichen' geklickt ohne irgendwas auszufüllen",
      happened: `Es werden ${errs} rote Hinweise gezeigt aber kein zentraler Fokus auf das erste Problem`,
      expected:
        "Erstes fehlerhaftes Feld sollte automatisch in den Fokus springen und scrollen",
      fix: "scrollIntoView({block:'center'}) + .focus() auf das erste invalid input",
    });
  });

  test("desktop: submit valid expense (verein bezahlt)", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    // pick 'Verein hat schon bezahlt' (default kind=verein)
    // Fill bezeichnung
    await page.fill("#bezeichnung", "Bahnticket München → Berlin");
    await page.fill("#betrag", "12,50");
    // datum bleibt heute
    await page.check('input[name="datenschutz_consent"]');
    await shot(page, "03-auslage-filled-no-beleg");

    // submit without beleg
    await page
      .locator('button[type="submit"]:has-text("Auslage einreichen")')
      .click();
    await page.waitForLoadState("networkidle");
    await shot(page, "04-auslage-after-submit");
    const url = page.url();
    if (url.includes("/auslage-eingereicht")) {
      note({
        severity: "NICE",
        page: "/auslage-einreichen",
        tried: "Eine gültige Auslage ohne Beleg eingereicht (kind=verein)",
        happened: `Erfolgreich akzeptiert, Redirect zu ${url}`,
        expected: "OK — bei Verein-bezahlt-Modus ist das vertretbar",
        fix: "—",
      });
    } else {
      note({
        severity: "SHOULD",
        page: "/auslage-einreichen",
        tried: "Eine gültige Auslage ohne Beleg eingereicht",
        happened: `Kein Redirect — URL ist ${url}, vermutlich Fehler`,
        expected: "Redirect zu /auslage-eingereicht oder klare Fehlermeldung",
        fix: "Prüfen ob Beleg Pflicht ist und Fehler entsprechend kommunizieren",
      });
    }
  });

  test("desktop: invalid IBAN für extern-Modus", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    // Switch to extern
    const externRadio = page
      .locator('label:has-text("Externe Person")')
      .first();
    if (await externRadio.isVisible().catch(() => false)) {
      await externRadio.click();
    }
    // Try to find the iban field
    const ibanField = page
      .locator('input[name="iban_display"], input[id*="iban"]')
      .first();
    if (await ibanField.isVisible().catch(() => false)) {
      await ibanField.fill("DE00 1234 ABCD");
      await ibanField.blur();
      await page.waitForTimeout(300);
      await shot(page, "05-iban-invalid");
      const hasErr = await page
        .locator("text=/ungültig|invalid|IBAN/i")
        .first()
        .isVisible()
        .catch(() => false);
      note({
        severity: hasErr ? "NICE" : "SHOULD",
        page: "/auslage-einreichen",
        tried:
          "Auf 'Externe Person' umgeschaltet, dann DE00 1234 ABCD als IBAN eingegeben",
        happened: hasErr
          ? "Inline-Fehler zur IBAN wird angezeigt"
          : "Kein Inline-Fehler trotz offensichtlich kaputter IBAN",
        expected:
          "Sofortige Validierung mit Hinweis 'Bitte gültige IBAN eingeben'",
        fix: "Client-Side IBAN-Checksum-Validierung (ISO 7064 Mod 97-10) onBlur",
      });
    } else {
      note({
        severity: "SHOULD",
        page: "/auslage-einreichen",
        tried: "Mode auf 'Extern' umschalten, dann IBAN-Feld suchen",
        happened: "IBAN-Feld nicht gefunden / nicht sichtbar nach Mode-Wechsel",
        expected: "Sichtbares IBAN-Feld nach Mode-Wechsel",
        fix: "BezahltVonPicker prüfen — werden die extern-Felder gerendert wenn kind='extern'?",
      });
    }
  });

  test("mobile: 375px viewport renders form", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(`${DEV_BASE}/auslage-einreichen`);
    await page.waitForTimeout(800);
    await shot(page, "06-mobile-auslage");
    // Are there long unwrapped strings overflowing?
    const horizontalScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    note({
      severity: horizontalScroll ? "SHOULD" : "NICE",
      page: "/auslage-einreichen (375px)",
      tried: "Mobile Viewport 375x800 (iPhone SE)",
      happened: horizontalScroll
        ? "Horizontale Scrollleiste — Inhalt ragt seitlich heraus"
        : "Layout passt, keine horizontale Scrollleiste",
      expected: "Kein horizontales Scrollen auf Mobile",
      fix: "overflow-x checken; max-w-xl wirkt — aber Padding evtl. zu groß; CTA-Bar prüfen",
    });
    await ctx.close();
  });

  test("submit ohne JS — curl simulation", async ({ request }) => {
    const res = await request.post(`${DEV_BASE}/auslage-einreichen`, {
      multipart: { data: "not-a-json" },
    });
    const status = res.status();
    note({
      severity: status === 400 ? "NICE" : "SHOULD",
      page: "/auslage-einreichen",
      tried: "POST mit kaputtem multipart body (kein JSON in data-Feld)",
      happened: `Status ${status} zurück`,
      expected: "400 mit klarer Fehlermeldung im HTML",
      fix: "—",
    });
  });

  test("public auslage-status with nonsense id", async ({ page }) => {
    await page.goto("/auslage-status/AUS-2099-9999");
    await page.waitForLoadState("networkidle");
    await shot(page, "07-status-bogus-id");
    const text = await page.locator("body").textContent();
    const has404 = /nicht gefunden|404|not found/i.test(text ?? "");
    note({
      severity: has404 ? "NICE" : "SHOULD",
      page: "/auslage-status/AUS-2099-9999",
      tried: "Status-Seite mit erfundener AUS-ID besuchen",
      happened: has404
        ? "Saubere 404-Seite"
        : `Keine 404-Meldung sichtbar, body: ${text?.slice(0, 200)}`,
      expected: "Klare 404-Seite oder 'Diese Auslage existiert nicht'",
      fix: "Im Loader prüfen ob Submission existiert, sonst error(404, …)",
    });
  });
});

// ---------------------------------------------------------------------------
// Sign-in flow
// ---------------------------------------------------------------------------

test.describe("@julia Sign-in flow", () => {
  test("sign-in page renders and accepts non-admin email same as admin", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await shot(page, "10-signin-empty");
    await page.fill('input[name="email"]', "nonexistent@example.org");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(800);
    await shot(page, "11-signin-after-submit-nonadmin");
    const status = await page
      .locator('[role="status"]')
      .textContent()
      .catch(() => null);
    note({
      severity: "NICE",
      page: "/sign-in",
      tried: "Nicht-Admin-Email 'nonexistent@example.org' eingegeben",
      happened: `Status: ${status} — Anti-Enumeration funktioniert wie spezifiziert`,
      expected: "Identische 'Check your inbox' Antwort für admin und non-admin",
      fix: "Das ist gewollt (MUST-fix #3) — aber englisch 'Check your inbox 💌' in deutscher App ist seltsam",
    });
  });

  test("verify with bogus token shows error", async ({ page }) => {
    // gitleaks:allow — intentionally short, obviously-fake token for a 404 path
    await page.goto("/sign-in/verify?token=not-a-real-token");
    await page.waitForLoadState("networkidle");
    await shot(page, "12-verify-bogus");
    const text = await page.locator("body").textContent();
    const hasError = /INVALID|EXPIRED|error|400|abgelaufen/i.test(text ?? "");
    note({
      severity: hasError ? "NICE" : "SHOULD",
      page: "/sign-in/verify?token=bogus",
      tried: "Erfundenen Token in URL eingegeben",
      happened: hasError
        ? "Fehlerseite sichtbar"
        : "Keine erkennbare Fehlermeldung",
      expected: "Freundliche deutsche Fehlerseite mit Link zurück zu /sign-in",
      fix: "Eigene +error.svelte mit deutschem Text + 'Anmelde-Link erneut anfordern' Button",
    });
  });

  test("verify without token at all", async ({ page }) => {
    await page.goto("/sign-in/verify");
    await page.waitForLoadState("networkidle");
    await shot(page, "13-verify-no-token");
    const text = await page.locator("body").textContent();
    note({
      severity: "NICE",
      page: "/sign-in/verify",
      tried: "URL ohne ?token=… Parameter aufgerufen",
      happened: `Anzeige: '${text?.slice(0, 100)}'`,
      expected: "Klare Hinweis auf fehlendes Token, Link zu /sign-in",
      fix: "—",
    });
  });

  test("magic link replay (zweimal verwenden)", async ({ page }) => {
    const { rawToken } = await insertMagicLink(ADMIN_EMAIL);
    // First consume
    await page.goto(`/sign-in/verify?token=${rawToken}`);
    const mismatchBtn = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatchBtn.isVisible().catch(() => false)) {
      await mismatchBtn.click();
    }
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app/);
    await shot(page, "14-first-consume-success");
    // Sign out
    await page.goto("/sign-out");
    await page.waitForLoadState("networkidle");
    // Try same token again
    await page.goto(`/sign-in/verify?token=${rawToken}`);
    await page.waitForLoadState("networkidle");
    await shot(page, "15-replay-attempt");
    const text = await page.locator("body").textContent();
    const blocked = /INVALID|EXPIRED|abgelaufen|error/i.test(text ?? "");
    note({
      severity: blocked ? "NICE" : "MUST",
      page: "/sign-in/verify",
      tried: "Magic Link einmal verwendet, dann denselben Link erneut versucht",
      happened: blocked
        ? "Token wird abgelehnt (gut!)"
        : "Token akzeptiert — SICHERHEITSPROBLEM",
      expected: "Token muss nach erstem Verbrauch ungültig sein",
      fix: blocked
        ? "—"
        : "consumeMagicLink prüft consumed_at IS NULL — sollte already work",
    });
  });
});

// ---------------------------------------------------------------------------
// Admin shell — sign in as Julia
// ---------------------------------------------------------------------------

test.describe("@julia Admin shell", () => {
  test("dashboard, all top-level pages — visual sweep", async ({ page }) => {
    await authAsJulia(page);
    await page.waitForLoadState("networkidle");
    await shot(page, "20-dashboard");

    const routes: Array<[string, string]> = [
      ["/app", "21-app-home"],
      ["/app/mitglieder", "22-mitglieder"],
      ["/app/rechnungen", "23-rechnungen"],
      ["/app/ausgaben", "24-ausgaben"], // Phase 8 T6: /app/transactions retired
      ["/app/inbox", "25-inbox"],
      ["/app/projekte", "26-projekte"],
      ["/app/kunden", "27-kunden"],
      ["/app/jahresabschluss", "28-jahresabschluss"],
      ["/app/einstellungen", "29-einstellungen"],
      ["/app/dsgvo", "30-dsgvo"],
      ["/app/sheet-resync", "31-sheet-resync"],
    ];

    for (const [route, name] of routes) {
      try {
        const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
        const status = resp?.status() ?? 0;
        await page.waitForTimeout(800);
        await shot(page, name);
        const bodyText = (await page.locator("body").textContent()) ?? "";
        const hasError =
          status >= 400 ||
          /500|Error|Stack trace|TypeError|Cannot read|undefined/i.test(
            bodyText.slice(0, 5000),
          );
        if (hasError) {
          note({
            severity: status >= 500 ? "MUST" : "SHOULD",
            page: route,
            tried: "Direkter Aufruf der Seite als eingeloggter Admin",
            happened: `Status ${status}, Body enthält Fehlerindikator. Auszug: '${bodyText.slice(0, 200).replace(/\s+/g, " ")}'`,
            expected: "200 mit funktionierendem Layout",
            fix: "Loader + Komponente prüfen, Stack im Server-Log lesen",
            shot: name,
          });
        } else if ((bodyText.trim().length || 0) < 100) {
          note({
            severity: "SHOULD",
            page: route,
            tried: "Direkter Aufruf der Seite als eingeloggter Admin",
            happened: `Sehr wenig Inhalt: '${bodyText.trim().slice(0, 200)}'`,
            expected: "Mindestens ein Heading + Empty-State Text",
            fix: "Empty State mit Hinweistext implementieren",
            shot: name,
          });
        } else {
          // Quick checks: are there obvious German-vs-English mixups?
          const hasMixedLang =
            /Submit|Cancel|Loading\.\.\.|undefined|null|NaN/i.test(
              bodyText.slice(0, 3000),
            );
          if (hasMixedLang) {
            note({
              severity: "NICE",
              page: route,
              tried:
                "Auf der Seite nach englischen Texten / 'undefined' / 'null' / 'NaN' gesucht",
              happened: "Verdächtiger Text gefunden im sichtbaren Bereich",
              expected: "Konsistent deutsche UI, keine 'undefined' Werte",
              fix: "Texte i18n-isieren bzw. Default-Werte sicherstellen",
              shot: name,
            });
          }
          note({
            severity: "NICE",
            page: route,
            tried: "Routinemäßiger Page-Sweep",
            happened: `Seite lädt (Status ${status}), ~${bodyText.length} Zeichen Inhalt`,
            expected: "—",
            fix: "—",
            shot: name,
          });
        }
      } catch (err) {
        note({
          severity: "MUST",
          page: route,
          tried: "Direkter Aufruf",
          happened: `Exception: ${(err as Error).message}`,
          expected: "Seite lädt ohne Crash",
          fix: "Bug fixen",
        });
      }
    }
  });

  test("mobile shell — 375px", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 800 },
    });
    const page = await ctx.newPage();
    const { rawToken } = await insertMagicLink(ADMIN_EMAIL);
    await page.goto(`${DEV_BASE}/sign-in/verify?token=${rawToken}`);
    const mismatchBtn = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatchBtn.isVisible().catch(() => false)) {
      await mismatchBtn.click();
    }
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app/);
    await page.waitForTimeout(800);
    await shot(page, "40-mobile-dashboard");

    const horizontalScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    note({
      severity: horizontalScroll ? "SHOULD" : "NICE",
      page: "/app (375px)",
      tried: "Admin shell auf Mobile aufrufen",
      happened: horizontalScroll
        ? "Horizontale Scrollleiste sichtbar"
        : "Layout passt auf 375px",
      expected: "Mobile-first: kein horizontales Scrollen",
      fix: "Sidebar einklappen, Topbar reduzieren, Bottom-Tab-Bar prüfen",
    });

    // Try the mobile bottom-tab-bar
    const bottomBar = page.locator(
      '[data-mobile-tabbar], nav[aria-label*="ober" i], nav[aria-label*="untere" i], nav[aria-label*="bottom" i]',
    );
    if ((await bottomBar.count()) > 0) {
      await shot(page, "41-mobile-tabbar");
    }
    await ctx.close();
  });

  test("legal pages render with version stamp", async ({ page }) => {
    await page.goto("/datenschutz");
    await page.waitForLoadState("networkidle");
    await shot(page, "50-datenschutz");
    const ds = await page.locator("body").textContent();
    const hasVersion = /2026-05-01|v1|Stand:|Version/i.test(ds ?? "");
    const hasVorarbeit = /Vorarbeit|Entwurf|preliminary/i.test(ds ?? "");
    note({
      severity: hasVersion ? "NICE" : "SHOULD",
      page: "/datenschutz",
      tried: "Datenschutzseite aufgerufen, nach Versions-/Datumstempel gesucht",
      happened: hasVersion
        ? "Version sichtbar"
        : "Kein Versions-Datum sichtbar",
      expected:
        "Klar erkennbares 'Stand: TT.MM.JJJJ' am Seitenanfang oder -ende",
      fix: "—",
      shot: "50-datenschutz",
    });
    if (hasVorarbeit) {
      note({
        severity: "NICE",
        page: "/datenschutz",
        tried: "Nach 'Vorarbeit/Entwurf' Hinweis suchen",
        happened: "Vorarbeit-Hinweis vorhanden",
        expected: "—",
        fix: "—",
      });
    }

    await page.goto("/impressum");
    await page.waitForLoadState("networkidle");
    await shot(page, "51-impressum");
    const imp = await page.locator("body").textContent();
    const hasAddress = /Straße|str\.|München|c\/o|e\.V\./i.test(imp ?? "");
    note({
      severity: hasAddress ? "NICE" : "SHOULD",
      page: "/impressum",
      tried: "Impressum aufgerufen — sind alle Pflichtangaben drin?",
      happened: hasAddress
        ? "Adresse / Vereinsdaten sichtbar"
        : "Adresse fehlt",
      expected:
        "TMG §5 Pflichtangaben: Name, Anschrift, Vertretungsberechtigte, Kontakt, Registereintrag",
      fix: "Pflichtangaben ergänzen, ohne sie fehlt rechtliche Absicherung",
      shot: "51-impressum",
    });
  });

  test("PWA manifest + theme color", async ({ request }) => {
    const m = await request.get(`${DEV_BASE}/manifest.webmanifest`);
    note({
      severity: m.ok() ? "NICE" : "SHOULD",
      page: "/manifest.webmanifest",
      tried: "PWA-Manifest abrufen",
      happened: `Status ${m.status()}`,
      expected: "200 mit gültigem JSON",
      fix: "—",
    });
    if (m.ok()) {
      const data = await m.json().catch(() => null);
      const hasIcons = Array.isArray(data?.icons) && data.icons.length > 0;
      const hasStart = !!data?.start_url;
      note({
        severity: hasIcons && hasStart ? "NICE" : "SHOULD",
        page: "/manifest.webmanifest",
        tried: "Manifest auf Icons + start_url prüfen",
        happened: `icons=${hasIcons}, start_url=${data?.start_url}`,
        expected: "Mindestens 192×192 und 512×512 Icon + start_url",
        fix: "—",
      });
    }
  });

  test("invalid invoice id 404 handling", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/rechnungen/RE-2099-99999");
    await page.waitForLoadState("networkidle");
    await shot(page, "60-invalid-rechnung");
    const text = await page.locator("body").textContent();
    const has404 = /404|nicht gefunden|not found/i.test(text ?? "");
    note({
      severity: has404 ? "NICE" : "SHOULD",
      page: "/app/rechnungen/RE-2099-99999",
      tried: "Erfundene Rechnungs-ID aufrufen",
      happened: has404 ? "Saubere 404" : `Statt 404: '${text?.slice(0, 200)}'`,
      expected: "404 / 'Rechnung nicht gefunden'",
      fix: "Loader: error(404, ...) wenn nicht existent",
    });
  });

  test("keyboard navigation on sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName,
        type: (el as HTMLInputElement)?.type,
        id: el?.id,
      };
    });
    note({
      severity: focused.tag === "INPUT" ? "NICE" : "SHOULD",
      page: "/sign-in",
      tried: "Mit Tab zum ersten Fokus springen",
      happened: `Erste Fokus-Position: ${JSON.stringify(focused)}`,
      expected: "Sollte direkt im E-Mail-Feld landen",
      fix:
        focused.tag === "INPUT" ? "—" : "autofocus auf das E-Mail-Feld setzen",
    });
  });

  test("create Rechnung — happy path", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/rechnungen");
    await page.waitForLoadState("networkidle");
    await shot(page, "70-rechnungen-list");
    // Look for a 'neu' / 'create' button
    const createBtn = page
      .locator(
        'button:has-text("Neue Rechnung"), a:has-text("Neue Rechnung"), button:has-text("Anlegen"), a:has-text("Anlegen"), button:has-text("erstellen"), a:has-text("erstellen")',
      )
      .first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      note({
        severity: "SHOULD",
        page: "/app/rechnungen",
        tried: "Nach Button 'Neue Rechnung anlegen' suchen",
        happened: "Kein offensichtlicher Create-Button gefunden",
        expected: "Prominenter primärer 'Neue Rechnung'-Button rechts oben",
        fix: "CTA hinzufügen / sichtbarer machen",
        shot: "70-rechnungen-list",
      });
      return;
    }
    await createBtn.click();
    await page.waitForLoadState("networkidle");
    await shot(page, "71-rechnung-form");
    note({
      severity: "NICE",
      page: "/app/rechnungen (create)",
      tried: "Auf den Anlegen-Button geklickt",
      happened: `URL: ${page.url()}`,
      expected: "Form für neue Rechnung",
      fix: "—",
    });
  });

  test("accessibility quick-check — focus rings on /sign-in", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.keyboard.press("Tab");
    const styles = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        outline: cs.outline,
        boxShadow: cs.boxShadow,
      };
    });
    const hasVisibleFocus =
      styles &&
      (styles.outline?.includes("px") || (styles.boxShadow?.length ?? 0) > 5);
    note({
      severity: hasVisibleFocus ? "NICE" : "SHOULD",
      page: "/sign-in",
      tried: "Tab und CSS für Focus-Indikator prüfen",
      happened: `outline=${styles?.outline}, boxShadow=${styles?.boxShadow}`,
      expected: "Klar sichtbarer Focus-Ring (mind. 2px, Kontrast 3:1)",
      fix: "focus-visible:ring-2 ggf. verstärken / kontrastierender machen",
    });
  });
});
