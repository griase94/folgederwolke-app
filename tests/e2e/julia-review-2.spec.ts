/**
 * Julia's deeper review — round 2: form submission deep-dive,
 * rate-limit probing, auslage-eingereicht success page, manuell hinzufügen,
 * inbox detail, projekte sub-routes, edge cases, mobile menu.
 */
import { test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
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
  await appendFile(
    join(SHOTS_DIR, "..", "2026-05-19-julia-findings-2.json"),
    JSON.stringify(findings, null, 2),
  );
});

test.describe("@julia-2 deeper", () => {
  test("auslage-eingereicht success page (no id param)", async ({ page }) => {
    await page.goto("/auslage-eingereicht");
    await page.waitForLoadState("networkidle");
    await shot(page, "80-eingereicht-no-id");
    const text = await page.locator("body").textContent();
    note({
      severity: "SHOULD",
      page: "/auslage-eingereicht",
      tried: "Success page direkt ohne ?id= aufrufen (z.B. Lesezeichen)",
      happened: `Body: '${text?.slice(0, 200).replace(/\s+/g, " ")}'`,
      expected:
        "Sinnvolle Seite — entweder Redirect zur Form oder freundlicher Hinweis 'Hier landet man nach Einreichung'",
      fix: "Loader prüft id und redirected zu /auslage-einreichen wenn fehlt",
      shot: "80-eingereicht-no-id",
    });
  });

  test("auslage-eingereicht with bogus id", async ({ page }) => {
    await page.goto("/auslage-eingereicht?id=AUS-2099-99999");
    await page.waitForLoadState("networkidle");
    await shot(page, "81-eingereicht-bogus-id");
    const text = await page.locator("body").textContent();
    const hasError = /nicht gefunden|404|fehler/i.test(text ?? "");
    note({
      severity: hasError ? "NICE" : "SHOULD",
      page: "/auslage-eingereicht?id=AUS-2099-99999",
      tried: "Success page mit erfundener AUS-ID",
      happened: hasError
        ? "Fehler/404 erkannt"
        : `Inhalt: '${text?.slice(0, 200).replace(/\s+/g, " ")}'`,
      expected: "404 oder Hinweis dass die ID unbekannt ist",
      fix: "—",
    });
  });

  test("hover Sticky CTA — sehe ich was sie verdeckt?", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 700 },
    });
    const page = await ctx.newPage();
    await page.goto(`${DEV_BASE}/auslage-einreichen`);
    // Scroll to middle so the Betrag field is right under the sticky CTA
    await page.evaluate(() => window.scrollTo(0, 350));
    await shot(page, "82-mobile-cta-overlap");
    const cta = page.locator('button:has-text("Auslage einreichen")').last();
    const ctaBox = await cta.boundingBox();
    const ctaTop = ctaBox?.y ?? 0;
    const ctaHeight = ctaBox?.height ?? 0;
    // Check if Betrag input is covered by CTA
    const betrag = page.locator("#betrag");
    const betragBox = await betrag.boundingBox();
    if (betragBox && ctaBox) {
      const overlap =
        betragBox.y + betragBox.height > ctaTop &&
        betragBox.y < ctaTop + ctaHeight;
      note({
        severity: overlap ? "MUST" : "NICE",
        page: "/auslage-einreichen (375x700)",
        tried:
          "Auf Mobile Form scrollen, prüfen ob Sticky-CTA das aktive Eingabefeld verdeckt",
        happened: overlap
          ? `Sticky CTA verdeckt den Betrag-Input (cta top=${ctaTop.toFixed(0)}, betrag bottom=${(betragBox.y + betragBox.height).toFixed(0)})`
          : "Kein direkter Overlap erkannt",
        expected:
          "CTA sollte beim Tippen nach unten ausweichen (visualViewport handler existiert, scheint aber nicht zu greifen)",
        fix: "VisualViewport handler prüfen + bottom-padding der Form erhöhen (`pb-32` reicht evtl. nicht)",
        shot: "82-mobile-cta-overlap",
      });
    }
    await ctx.close();
  });

  test("inbox 'Manuell hinzufügen' button — was passiert?", async ({
    page,
  }) => {
    await authAsJulia(page);
    await page.goto("/app/inbox");
    await page.waitForLoadState("networkidle");
    const btn = page.locator(
      'button:has-text("Manuell hinzufügen"), a:has-text("Manuell hinzufügen")',
    );
    if (
      await btn
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await btn.first().click();
      await page.waitForTimeout(800);
      await shot(page, "83-inbox-manuell-add");
      const url = page.url();
      const dialog = page.locator('[role="dialog"], [data-modal]').first();
      const hasDialog = await dialog.isVisible().catch(() => false);
      note({
        severity: hasDialog || url.includes("manuell") ? "NICE" : "SHOULD",
        page: "/app/inbox",
        tried: "Auf 'Manuell hinzufügen' geklickt",
        happened: hasDialog
          ? "Dialog geöffnet"
          : `URL: ${url}, kein Dialog sichtbar`,
        expected: "Dialog / Form um manuell eine Einreichung anzulegen",
        fix: "—",
        shot: "83-inbox-manuell-add",
      });
    } else {
      note({
        severity: "SHOULD",
        page: "/app/inbox",
        tried: "Button 'Manuell hinzufügen' anklicken",
        happened: "Button nicht gefunden",
        expected: "—",
        fix: "—",
      });
    }
  });

  test("Heute dashboard — alle Buttons funktional?", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    // 'Inbox öffnen' button
    const inboxBtn = page
      .locator('a:has-text("Inbox öffnen"), button:has-text("Inbox öffnen")')
      .first();
    if (await inboxBtn.isVisible().catch(() => false)) {
      await inboxBtn.click();
      await page.waitForLoadState("networkidle");
      const ok = page.url().includes("/app/inbox");
      note({
        severity: ok ? "NICE" : "SHOULD",
        page: "/app",
        tried: "'Inbox öffnen' Button auf Dashboard angeklickt",
        happened: `URL: ${page.url()}`,
        expected: "Navigiert zu /app/inbox",
        fix: "—",
      });
    }
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    const txBtn = page
      .locator(
        'a:has-text("Transaktionen öffnen"), button:has-text("Transaktionen öffnen")',
      )
      .first();
    if (await txBtn.isVisible().catch(() => false)) {
      const disabled = await txBtn.evaluate(
        (el) => (el as HTMLButtonElement).disabled,
      );
      // The Button on the screenshot looks visually disabled; let's confirm
      note({
        severity: disabled ? "NICE" : "NICE",
        page: "/app",
        tried:
          "'Transaktionen öffnen' Button-Status prüfen (sah ausgegraut aus)",
        happened: `disabled=${disabled}`,
        expected: "Wenn ausgegraut, dann auch disabled — sonst inkonsistent",
        fix: "—",
      });
    }
  });

  test("topbar search — Cmd+K", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app");
    await page.keyboard.press("Meta+K");
    await page.waitForTimeout(500);
    await shot(page, "84-cmdk-search");
    const dialog = page.locator('[role="dialog"], [data-search]').first();
    const open = await dialog.isVisible().catch(() => false);
    note({
      severity: open ? "NICE" : "SHOULD",
      page: "/app",
      tried:
        "Cmd+K für globale Suche drücken (Hinweis '⌘K' im Suchfeld sichtbar)",
      happened: open ? "Dialog geöffnet" : "Kein Suchdialog erschien",
      expected: "Globale Suche öffnet sich als Modal",
      fix: "Keyboard-Shortcut binden",
    });
  });

  test("notification bell click", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app");
    const bell = page
      .locator(
        'button[aria-label*="enachrichtigung" i], button[aria-label*="otification" i], button:has(svg[class*="bell"])',
      )
      .first();
    if (await bell.isVisible().catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(400);
      await shot(page, "85-bell-click");
      note({
        severity: "NICE",
        page: "/app",
        tried: "Auf die Glocke (Benachrichtigungen) klicken",
        happened: "(siehe Screenshot)",
        expected: "Dropdown mit aktuellen Benachrichtigungen",
        fix: "—",
      });
    }
  });

  test("profile icon click — menü? logout?", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app");
    const avatar = page
      .locator(
        'button:has-text("JU"), [aria-label*="profil" i], [aria-label*="enutzer" i]',
      )
      .first();
    if (await avatar.isVisible().catch(() => false)) {
      await avatar.click();
      await page.waitForTimeout(400);
      await shot(page, "86-avatar-click");
      const menu = page.locator('[role="menu"], [role="dialog"]').first();
      const open = await menu.isVisible().catch(() => false);
      note({
        severity: open ? "NICE" : "SHOULD",
        page: "/app (avatar)",
        tried: "Auf das Avatar-Icon rechts oben klicken",
        happened: open ? "Menü öffnet" : "Kein Menü öffnet sich",
        expected: "Dropdown mit Profil / Abmelden",
        fix: "Avatar-Menü implementieren",
        shot: "86-avatar-click",
      });
    }
  });

  test("sign-out leaves session", async ({ page, context }) => {
    await authAsJulia(page);
    await page.goto("/sign-out");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "session");
    note({
      severity: !session || session.value === "" ? "NICE" : "SHOULD",
      page: "/sign-out",
      tried: "Aufruf von /sign-out",
      happened: `URL: ${url}, session-cookie: ${session?.value ?? "(weg)"}`,
      expected: "Cookie weg, Redirect zu /sign-in oder /",
      fix: "—",
    });
    // Now try to access /app
    const resp = await page.goto("/app");
    note({
      severity: page.url().includes("/sign-in") ? "NICE" : "MUST",
      page: "/app nach sign-out",
      tried: "/app nach abmelden aufrufen",
      happened: `URL: ${page.url()}, status: ${resp?.status()}`,
      expected: "Redirect zu /sign-in",
      fix: "Auth guard fixen",
    });
  });

  test("very large input — XSS in bezeichnung", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    const evil = `<script>alert(1)</script>`;
    await page.fill("#bezeichnung", evil);
    await page.fill("#betrag", "1,00");
    await page.check('input[name="datenschutz_consent"]');
    // Just look at the displayed value
    const val = await page.locator("#bezeichnung").inputValue();
    note({
      severity: "NICE",
      page: "/auslage-einreichen",
      tried: `Versucht XSS in Bezeichnung: '${evil}'`,
      happened: `Eingabefeld zeigt: '${val}' (input-Felder rendern Text — kein XSS direkt)`,
      expected: "Server escaped, Client zeigt sauber",
      fix: "—",
    });
  });

  test("Cyrillic / emoji input", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await page.fill("#bezeichnung", "Кафе 🍰 für Sommerfest 🎉");
    await page.fill("#betrag", "9,99");
    await page.check('input[name="datenschutz_consent"]');
    await shot(page, "87-unicode-input");
    note({
      severity: "NICE",
      page: "/auslage-einreichen",
      tried: "Cyrillisch + Emoji in Bezeichnung tippen",
      happened: "Eingabe akzeptiert (Anzeige normal)",
      expected: "—",
      fix: "—",
    });
  });

  test("amount edge cases — €0", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await page.fill("#bezeichnung", "Test");
    await page.fill("#betrag", "0,00");
    await page.locator("#betrag").blur();
    await page.waitForTimeout(200);
    const err = await page
      .locator("#err-betragCents")
      .textContent()
      .catch(() => null);
    note({
      severity: err ? "NICE" : "SHOULD",
      page: "/auslage-einreichen",
      tried: "Betrag 0,00 eingeben, blur",
      happened: err ? `Fehler: ${err}` : "Kein Fehler erkannt",
      expected: "Hinweis 'Betrag muss > 0 sein'",
      fix: "—",
    });
  });

  test("amount edge cases — negative", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await page.fill("#bezeichnung", "Test");
    await page.fill("#betrag", "-50,00");
    await page.locator("#betrag").blur();
    await page.waitForTimeout(200);
    const err = await page
      .locator("#err-betragCents")
      .textContent()
      .catch(() => null);
    note({
      severity: err ? "NICE" : "SHOULD",
      page: "/auslage-einreichen",
      tried: "Negativer Betrag -50,00",
      happened: err ? `Fehler: ${err}` : "Kein Fehler",
      expected: "Hinweis 'Negative Beträge nicht erlaubt'",
      fix: "parseBetragCents Vorzeichen prüfen",
    });
  });

  test("amount edge cases — €1.000.000.000,00", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await page.fill("#bezeichnung", "Test");
    await page.fill("#betrag", "1000000000,00");
    await page.locator("#betrag").blur();
    await page.waitForTimeout(200);
    const err = await page
      .locator("#err-betragCents")
      .textContent()
      .catch(() => null);
    note({
      severity: "NICE",
      page: "/auslage-einreichen",
      tried: "Mega-Betrag 1.000.000.000,00 EUR",
      happened: err
        ? `Fehler: ${err}`
        : "Kein Fehler — wird wohl akzeptiert (zumindest client-side)",
      expected: "Obergrenze + Hinweis (z.B. max 100.000,00 €)",
      fix: "Serverseitige Validierung muss ein cap haben",
    });
  });

  test("dot-decimal '12.50' instead of comma '12,50'", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    await page.fill("#bezeichnung", "Test");
    await page.fill("#betrag", "12.50");
    await page.locator("#betrag").blur();
    await page.waitForTimeout(200);
    const err = await page
      .locator("#err-betragCents")
      .textContent()
      .catch(() => null);
    note({
      severity: err ? "SHOULD" : "NICE",
      page: "/auslage-einreichen",
      tried: "Betrag mit Punkt '12.50' statt Komma '12,50' tippen",
      happened: err ? `Fehler: ${err}` : "Akzeptiert — gut, Dual-Mode",
      expected: "Beide Formate akzeptieren (Englische Nutzer tippen 12.50)",
      fix: err ? "parseBetragCents punkt-Variante zulassen" : "—",
    });
  });

  test("verify GET on a DIFFERENT browser shows mismatch warning", async ({
    browser,
  }) => {
    const { rawToken } = await insertMagicLink(ADMIN_EMAIL);
    const ctx = await browser.newContext(); // fresh context = different device
    const page = await ctx.newPage();
    await page.goto(`${DEV_BASE}/sign-in/verify?token=${rawToken}`);
    await page.waitForLoadState("networkidle");
    await shot(page, "88-verify-mismatch");
    const warning = await page
      .locator("text=/anderem Gerät|trotzdem fortfahren|nicht.*ausgelöst/i")
      .first()
      .isVisible()
      .catch(() => false);
    note({
      severity: warning ? "NICE" : "SHOULD",
      page: "/sign-in/verify (other browser)",
      tried: "Magic-Link in einem komplett anderen Browser-Kontext öffnen",
      happened: warning ? "Warnung sichtbar (gut!)" : "Keine Warnung sichtbar",
      expected:
        "'Du bist auf einem anderen Gerät' Hinweis mit 'Trotzdem fortfahren' Button",
      fix: "—",
    });
    await ctx.close();
  });

  test("/healthz", async ({ request }) => {
    const r = await request.get(`${DEV_BASE}/healthz`);
    note({
      severity: r.ok() ? "NICE" : "MUST",
      page: "/healthz",
      tried: "Healthcheck abrufen",
      happened: `Status ${r.status()}`,
      expected: "200 mit ok",
      fix: "—",
    });
  });

  test("logo click on dashboard goes home", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/einstellungen");
    await page.waitForLoadState("networkidle");
    const logo = page
      .locator('a:has-text("Folge der Wolke"), a:has(span:has-text("FW"))')
      .first();
    if (await logo.isVisible().catch(() => false)) {
      await logo.click();
      await page.waitForLoadState("networkidle");
      const ok = page.url().endsWith("/app") || page.url().endsWith("/app/");
      note({
        severity: ok ? "NICE" : "SHOULD",
        page: "App-Logo",
        tried: "Auf das Logo oben links klicken",
        happened: `URL: ${page.url()}`,
        expected: "Navigiert zu /app",
        fix: "Logo zu Link mit href='/app' machen",
      });
    }
  });

  test("breadcrumb 'Start' click", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/einstellungen");
    await page.waitForLoadState("networkidle");
    const crumb = page
      .locator('a:has-text("Start"), nav a:has-text("Start")')
      .first();
    if (await crumb.isVisible().catch(() => false)) {
      await crumb.click();
      await page.waitForLoadState("networkidle");
      const ok = page.url().endsWith("/app") || page.url().endsWith("/app/");
      note({
        severity: ok ? "NICE" : "SHOULD",
        page: "Breadcrumb 'Start'",
        tried: "Auf 'Start' im Breadcrumb klicken",
        happened: `URL: ${page.url()}`,
        expected: "Navigiert zu /app",
        fix: "—",
      });
    } else {
      note({
        severity: "NICE",
        page: "Breadcrumb 'Start'",
        tried: "'Start' im Breadcrumb finden",
        happened: "Kein Link gefunden — nur Text?",
        expected: "Breadcrumb-Elemente sollten Links sein",
        fix: "—",
      });
    }
  });

  test("DSGVO form: empty email submit", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/dsgvo");
    await page.waitForLoadState("networkidle");
    const auskunft = page
      .locator('button:has-text("Auskunft generieren")')
      .first();
    if (await auskunft.isVisible().catch(() => false)) {
      await auskunft.click();
      await page.waitForTimeout(500);
      await shot(page, "90-dsgvo-empty-submit");
      const text = await page.locator("body").textContent();
      note({
        severity: "SHOULD",
        page: "/app/dsgvo",
        tried: "Ohne Eingabe auf 'Auskunft generieren' klicken",
        happened: `Body-Auszug: '${text?.slice(0, 200).replace(/\s+/g, " ")}'`,
        expected: "Fehler 'Bitte E-Mail eingeben'",
        fix: "Validation hinzufügen",
        shot: "90-dsgvo-empty-submit",
      });
    }
  });

  test("DSGVO with random email", async ({ page }) => {
    await authAsJulia(page);
    await page.goto("/app/dsgvo");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', "doesnt-exist@nowhere.example");
    await page.locator('button:has-text("Auskunft generieren")').click();
    await page.waitForTimeout(1500);
    await shot(page, "91-dsgvo-noexist");
    const text = await page.locator("body").textContent();
    note({
      severity: "NICE",
      page: "/app/dsgvo",
      tried: "Auskunft für nicht-existente E-Mail",
      happened: `Body-Auszug: '${text?.slice(0, 400).replace(/\s+/g, " ")}'`,
      expected: "Hinweis 'keine Daten gefunden' oder leere Auskunft",
      fix: "—",
      shot: "91-dsgvo-noexist",
    });
  });

  test("Mobile sidebar menu visible & navigable", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 800 },
    });
    const page = await ctx.newPage();
    const { rawToken } = await insertMagicLink(ADMIN_EMAIL);
    await page.goto(`${DEV_BASE}/sign-in/verify?token=${rawToken}`);
    const mismatch = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatch.isVisible().catch(() => false)) await mismatch.click();
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app/);
    await page.waitForTimeout(800);
    // Check bottom tab bar items: Heute, Audit Inbox, Transaktionen, Mitglieder, Neu
    const tabs = ["Heute", "Audit Inbox", "Transaktionen", "Mitglieder", "Neu"];
    for (const t of tabs) {
      const visible = await page
        .locator(`text=${t}`)
        .first()
        .isVisible()
        .catch(() => false);
      if (!visible) {
        note({
          severity: "NICE",
          page: "Bottom Tab Bar (mobile)",
          tried: `Tab '${t}' suchen`,
          happened: "Nicht sichtbar",
          expected: "Tab sichtbar",
          fix: "—",
        });
      }
    }
    // Tap "Neu" to see what happens
    const neuBtn = page.locator("text=Neu").last();
    if (await neuBtn.isVisible().catch(() => false)) {
      await neuBtn.click();
      await page.waitForTimeout(500);
      await shot(page, "92-mobile-neu-click");
      note({
        severity: "NICE",
        page: "Mobile 'Neu' Tab",
        tried: "Auf 'Neu' in Bottom-Tab-Bar tippen",
        happened: `URL: ${page.url()}`,
        expected:
          "Schnellaktion / Sheet mit 'neue Rechnung / neuer Beitrag / …'",
        fix: "—",
        shot: "92-mobile-neu-click",
      });
    }
    await ctx.close();
  });

  test("CSP nonce — inline scripts?", async ({ page }) => {
    const resp = await page.goto("/sign-in");
    const csp = resp?.headers()["content-security-policy"] ?? "";
    const hasNonce = csp.includes("nonce-");
    note({
      severity: hasNonce ? "NICE" : "SHOULD",
      page: "any",
      tried:
        "CSP-Header prüfen ob Nonce-basierte Inline-Scripts erlaubt werden",
      happened: hasNonce ? "Nonce vorhanden" : "Kein Nonce",
      expected: "Strict CSP mit nonce",
      fix: "—",
    });
  });

  test("/api/health response", async ({ request }) => {
    const r = await request.get(`${DEV_BASE}/api/health`);
    note({
      severity: r.ok() ? "NICE" : "SHOULD",
      page: "/api/health",
      tried: "/api/health prüfen",
      happened: `Status ${r.status()}`,
      expected: "200",
      fix: "—",
    });
  });
});
