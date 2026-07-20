/**
 * @qa-live — UNCOMMITTED live-capture harness for the prod investigation.
 *
 * Drives the DEPLOYED app (baseURL from playwright.live.config.ts) authenticated
 * via .qa-live/state.json (admin `session` cookie injected as storageState).
 * Screenshots every screen at desktop + mobile, records console errors, uncaught
 * page errors, and any HTTP >= 400 (catches 500s / logic holes). Also runs a set
 * of targeted interactive repros for the reported bugs.
 *
 * Writes:
 *   .qa-live/<slug>__<vp>.png       full-page screenshots
 *   .qa-live/_errors.json           { slug: [{ vp, errors[] }] }
 *   .qa-live/_repros.json           findings from interactive repros
 *
 * Run: pnpm exec playwright test -c playwright.live.config.ts
 */
import { test, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";

const OUT = ".qa-live";
const STATE = process.env["LIVE_STATE"] ?? `${OUT}/state.json`;
mkdirSync(OUT, { recursive: true });

type VP = { name: string; width: number; height: number };
const VIEWPORTS: VP[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const errorLog: Record<string, { vp: string; errors: string[] }[]> = {};
const repros: Record<string, unknown> = {};

function attach(page: Page, sink: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") sink.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => sink.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    const s = r.status();
    if (s >= 400) sink.push(`http ${s}: ${new URL(r.url()).pathname}`);
  });
}

async function capture(page: Page, slug: string, path: string, vp: VP) {
  const errs: string[] = [];
  const onConsole = (m: import("@playwright/test").ConsoleMessage) => {
    if (m.type() === "error") errs.push(`console.error: ${m.text()}`);
  };
  const onPageError = (e: Error) => errs.push(`pageerror: ${e.message}`);
  const onResponse = (r: import("@playwright/test").Response) => {
    const s = r.status();
    if (s >= 400) errs.push(`http ${s}: ${new URL(r.url()).pathname}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  try {
    await page.goto(path, { waitUntil: "networkidle", timeout: 30_000 });
  } catch (e) {
    errs.push(`goto-failed: ${(e as Error).message}`);
  }
  await page.waitForTimeout(700);
  try {
    await page.screenshot({
      path: `${OUT}/${slug}__${vp.name}.png`,
      fullPage: true,
    });
  } catch (e) {
    errs.push(`screenshot-failed: ${(e as Error).message}`);
  }
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);
  (errorLog[slug] ??= []).push({ vp: vp.name, errors: errs });
}

/** Visit a list page and return the first href matching `re`, or null. */
async function firstHref(page: Page, listPath: string, re: RegExp) {
  try {
    await page.goto(listPath, { waitUntil: "networkidle", timeout: 30_000 });
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((els) =>
        (els as HTMLAnchorElement[]).map((a) => a.getAttribute("href") ?? ""),
      );
    return hrefs.find((h) => re.test(h)) ?? null;
  } catch {
    return null;
  }
}

test.describe("@qa-live QA live-capture harness", () => {
  test("capture every screen + repros", async ({ browser }) => {
    test.setTimeout(25 * 60_000);
    if (!existsSync(STATE)) {
      throw new Error(
        `Missing storageState at ${STATE}. Build it from the admin session cookie first.`,
      );
    }

    const staticRoutes: { slug: string; path: string }[] = [
      { slug: "dashboard", path: "/app" },
      { slug: "transaktionen", path: "/app/transaktionen" },
      { slug: "ausgaben-list", path: "/app/ausgaben" },
      { slug: "ausgaben-neu", path: "/app/ausgaben/neu" },
      { slug: "ausgaben-ueberweisungen", path: "/app/ausgaben/ueberweisungen" },
      { slug: "einnahmen-list", path: "/app/einnahmen" },
      { slug: "einnahmen-neu", path: "/app/einnahmen/neu" },
      { slug: "spenden-list", path: "/app/spenden" },
      { slug: "spenden-neu", path: "/app/spenden/neu" },
      { slug: "inbox", path: "/app/inbox" },
      { slug: "mitglieder", path: "/app/mitglieder" },
      { slug: "projekte", path: "/app/projekte" },
      { slug: "rechnungen", path: "/app/rechnungen" },
      { slug: "rechnungen-new", path: "/app/rechnungen/new" },
      { slug: "kunden", path: "/app/kunden" },
      { slug: "jahresabschluss", path: "/app/jahresabschluss" },
      { slug: "ja-2025", path: "/app/jahresabschluss/2025" },
      {
        slug: "ja-2025-uebersicht",
        path: "/app/jahresabschluss/2025/uebersicht",
      },
      {
        slug: "ja-2025-buchungsliste",
        path: "/app/jahresabschluss/2025/buchungsliste",
      },
      { slug: "ja-2025-exports", path: "/app/jahresabschluss/2025/exports" },
      { slug: "einstellungen", path: "/app/einstellungen" },
      { slug: "einstellungen-beitraege", path: "/app/einstellungen/beitraege" },
      { slug: "einstellungen-verein", path: "/app/einstellungen/verein" },
      { slug: "files", path: "/app/files" },
      { slug: "files-papierkorb", path: "/app/files/papierkorb" },
      { slug: "dsgvo", path: "/app/dsgvo" },
    ];

    for (const vp of VIEWPORTS) {
      const ctx: BrowserContext = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        storageState: STATE,
        ignoreHTTPSErrors: true,
      });
      const page = await ctx.newPage();

      // Derive detail routes from list pages (no DB access).
      const detail: { slug: string; path: string }[] = [];
      const derive = async (slug: string, list: string, re: RegExp) => {
        const href = await firstHref(page, list, re);
        if (href) detail.push({ slug, path: href });
      };
      await derive(
        "ausgabe-detail",
        "/app/ausgaben",
        /\/app\/ausgaben\/[0-9a-f-]{8,}/i,
      );
      await derive(
        "einnahme-detail",
        "/app/einnahmen",
        /\/app\/einnahmen\/[0-9a-f-]{8,}/i,
      );
      await derive(
        "spende-detail",
        "/app/spenden",
        /\/app\/spenden\/[0-9a-f-]{8,}/i,
      );
      await derive(
        "member-detail",
        "/app/mitglieder",
        /\/app\/mitglieder\/[0-9a-f-]{8,}/i,
      );
      await derive(
        "projekt-detail",
        "/app/projekte",
        /\/app\/projekte\/[0-9a-f-]{8,}/i,
      );
      await derive(
        "rechnung-detail",
        "/app/rechnungen",
        /\/app\/rechnungen\/[0-9a-f-]{8,}/i,
      );
      await derive(
        "kunde-detail",
        "/app/kunden",
        /\/app\/kunden\/[0-9a-f-]{8,}/i,
      );
      await derive(
        "inbox-detail",
        "/app/inbox",
        /\/app\/inbox\/[0-9a-f-]{8,}/i,
      );

      for (const r of [...staticRoutes, ...detail]) {
        await capture(page, r.slug, r.path, vp);
      }

      // ── Repro 1: transaction "neue Ausgabe" modal open → close → where? ──────
      try {
        const errs: string[] = [];
        attach(page, errs);
        await page.goto("/app/transaktionen", { waitUntil: "networkidle" });
        const opener = page
          .getByRole("button", { name: /ausgabe|hinzuf|erfass|neu/i })
          .first();
        if (await opener.isVisible({ timeout: 4000 }).catch(() => false)) {
          await opener.click();
          await page.waitForTimeout(900);
          await page.screenshot({
            path: `${OUT}/repro-tx-modal-open__${vp.name}.png`,
            fullPage: true,
          });
          // Close via Escape, then a Cancel/close button as fallback.
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(400);
          const cancel = page
            .getByRole("button", { name: /abbrechen|schließen|close|zurück/i })
            .first();
          if (await cancel.isVisible({ timeout: 1000 }).catch(() => false)) {
            await cancel.click().catch(() => {});
            await page.waitForTimeout(400);
          }
          await page.waitForTimeout(600);
          repros["tx-modal-close"] ??= {} as Record<string, unknown>;
          (repros["tx-modal-close"] as Record<string, string>)[vp.name] =
            `closed to: ${new URL(page.url()).pathname}`;
          await page.screenshot({
            path: `${OUT}/repro-tx-modal-closed__${vp.name}.png`,
            fullPage: true,
          });
        } else {
          repros["tx-modal-close"] ??= {} as Record<string, unknown>;
          (repros["tx-modal-close"] as Record<string, string>)[vp.name] =
            "no opener button found";
        }
        repros["tx-modal-errors"] ??= {} as Record<string, unknown>;
        (repros["tx-modal-errors"] as Record<string, string[]>)[vp.name] = errs;
      } catch (e) {
        repros["tx-modal-close"] ??= {} as Record<string, unknown>;
        (repros["tx-modal-close"] as Record<string, string>)[vp.name] =
          `repro-failed: ${(e as Error).message}`;
      }

      // ── Repro 2: member detail → future-year (2027) fee marking ──────────────
      try {
        const memberHref = await firstHref(
          page,
          "/app/mitglieder",
          /\/app\/mitglieder\/[0-9a-f-]{8,}/i,
        );
        if (memberHref) {
          await page.goto(memberHref, { waitUntil: "networkidle" });
          await page.waitForTimeout(500);
          // Try to step the year forward to 2027 if a year control exists.
          for (let i = 0; i < 3; i++) {
            const next = page
              .getByRole("button", { name: /weiter|nächst|→|>|vor/i })
              .first();
            if (await next.isVisible({ timeout: 800 }).catch(() => false)) {
              await next.click().catch(() => {});
              await page.waitForTimeout(400);
            }
          }
          await page.screenshot({
            path: `${OUT}/repro-member-future-year__${vp.name}.png`,
            fullPage: true,
          });
          const bodyText = await page.locator("body").innerText();
          repros["member-future-year"] ??= {} as Record<string, unknown>;
          (repros["member-future-year"] as Record<string, unknown>)[vp.name] = {
            url: new URL(page.url()).pathname,
            mentions2027: /2027/.test(bodyText),
            hasMarkPaid: /bezahlt|markieren|zahlung erfassen/i.test(bodyText),
          };
        }
      } catch (e) {
        repros["member-future-year"] ??= {} as Record<string, unknown>;
        (repros["member-future-year"] as Record<string, string>)[vp.name] =
          `repro-failed: ${(e as Error).message}`;
      }

      // ── Repro 3: jahresabschluss year dropdown (the "can't select 2025") ─────
      try {
        await page.goto("/app", { waitUntil: "networkidle" });
        const yearMenu = page
          .getByRole("button", { name: /20\d\d|jahr|jahres/i })
          .first();
        if (await yearMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
          await yearMenu.click().catch(() => {});
          await page.waitForTimeout(500);
          await page.screenshot({
            path: `${OUT}/repro-year-menu__${vp.name}.png`,
            fullPage: true,
          });
          const menuText = await page.locator("body").innerText();
          repros["year-menu"] ??= {} as Record<string, unknown>;
          (repros["year-menu"] as Record<string, unknown>)[vp.name] = {
            options2025: /2025/.test(menuText),
            options2026: /2026/.test(menuText),
          };
        }
      } catch (e) {
        repros["year-menu"] ??= {} as Record<string, unknown>;
        (repros["year-menu"] as Record<string, string>)[vp.name] =
          `repro-failed: ${(e as Error).message}`;
      }

      // ── Repro 4: project detail → open invoice (the Bar-Popup 500) ───────────
      try {
        const projHref = await firstHref(
          page,
          "/app/projekte",
          /\/app\/projekte\/[0-9a-f-]{8,}/i,
        );
        if (projHref) {
          const errs: string[] = [];
          attach(page, errs);
          await page.goto(projHref, { waitUntil: "networkidle" });
          await page.waitForTimeout(500);
          const invLink = page.locator('a[href*="/app/rechnungen/"]').first();
          if (await invLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await invLink.click().catch(() => {});
            await page.waitForTimeout(1200);
          }
          repros["project-invoice"] ??= {} as Record<string, unknown>;
          (repros["project-invoice"] as Record<string, unknown>)[vp.name] = {
            url: new URL(page.url()).pathname,
            errors: errs,
          };
          await page.screenshot({
            path: `${OUT}/repro-project-invoice__${vp.name}.png`,
            fullPage: true,
          });
        }
      } catch (e) {
        repros["project-invoice"] ??= {} as Record<string, unknown>;
        (repros["project-invoice"] as Record<string, string>)[vp.name] =
          `repro-failed: ${(e as Error).message}`;
      }

      await ctx.close();
    }

    writeFileSync(`${OUT}/_errors.json`, JSON.stringify(errorLog, null, 2));
    writeFileSync(`${OUT}/_repros.json`, JSON.stringify(repros, null, 2));

    const flagged = Object.entries(errorLog)
      .map(([slug, runs]) => ({ slug, errs: runs.flatMap((r) => r.errors) }))
      .filter((x) => x.errs.length > 0);
    console.log("=== LIVE CAPTURE ERROR SUMMARY ===");
    console.log(JSON.stringify(flagged, null, 2));
    console.log("=== REPROS ===");
    console.log(JSON.stringify(repros, null, 2));
    void readFileSync; // keep import used if trimmed
  });
});
