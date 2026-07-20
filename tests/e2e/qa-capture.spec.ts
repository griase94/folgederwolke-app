/**
 * @qa-capture — UNCOMMITTED QA harness (not in CI grep).
 *
 * Drives the real app (webServer + seeded test DB via globalSetup), logs in as
 * admin, and screenshots every primary screen at desktop + mobile viewports.
 * Records, per navigation: console errors, uncaught page errors, and any HTTP
 * response with status >= 400 (catches 500s / logic holes). Writes:
 *   .qa-shots/<slug>__<vp>.png         full-page screenshots
 *   .qa-shots/_errors.json             { slug: { vp, errors[] } }
 *
 * Run: pnpm exec playwright test qa-capture.spec.ts --workers=1
 */

import { test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";

const OUT = ".qa-shots";
mkdirSync(OUT, { recursive: true });

type VP = { name: string; width: number; height: number };
const VIEWPORTS: VP[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const errorLog: Record<string, { vp: string; errors: string[] }[]> = {};

async function firstId(
  sql: postgres.Sql,
  table: string,
): Promise<string | null> {
  try {
    const rows = await sql.unsafe(
      `SELECT id::text AS id FROM ${table} ORDER BY created_at NULLS LAST LIMIT 1`,
    );
    return (rows[0]?.["id"] as string) ?? null;
  } catch {
    try {
      const rows = await sql.unsafe(
        `SELECT id::text AS id FROM ${table} LIMIT 1`,
      );
      return (rows[0]?.["id"] as string) ?? null;
    } catch {
      return null;
    }
  }
}

async function capture(page: Page, slug: string, path: string, vp: VP) {
  const errs: string[] = [];
  const onConsole = (m: import("@playwright/test").ConsoleMessage) => {
    if (m.type() === "error") errs.push(`console.error: ${m.text()}`);
  };
  const onPageError = (e: Error) => errs.push(`pageerror: ${e.message}`);
  const onResponse = (r: import("@playwright/test").Response) => {
    const s = r.status();
    if (s >= 400 && r.url().includes("localhost"))
      errs.push(`http ${s}: ${r.url().replace(/https?:\/\/[^/]+/, "")}`);
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

test.describe("@qa-capture QA harness", () => {
  test("screenshot every screen", async ({ browser }) => {
    test.setTimeout(15 * 60_000);

    const sql = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    const ids = {
      ausgabe: await firstId(sql, "expenses"),
      einnahme: await firstId(sql, "income"),
      spende: await firstId(sql, "donations"),
      member: await firstId(sql, "members"),
      projekt: await firstId(sql, "projects"),
      rechnung: await firstId(sql, "invoices"),
      kunde: await firstId(sql, "customers"),
      inboxAus: await firstId(sql, "auslagen_submissions"),
    };
    await sql.end();

    const year = 2025;
    const routes: { slug: string; path: string }[] = [
      { slug: "dashboard", path: "/app" },
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
      { slug: "jahresabschluss-year", path: `/app/jahresabschluss/${year}` },
      {
        slug: "jahresabschluss-buchungsliste",
        path: `/app/jahresabschluss/${year}/buchungsliste`,
      },
      {
        slug: "jahresabschluss-exports",
        path: `/app/jahresabschluss/${year}/exports`,
      },
      { slug: "einstellungen", path: "/app/einstellungen" },
      { slug: "einstellungen-beitraege", path: "/app/einstellungen/beitraege" },
      { slug: "einstellungen-verein", path: "/app/einstellungen/verein" },
      { slug: "files", path: "/app/files" },
      { slug: "dsgvo", path: "/app/dsgvo" },
    ];
    if (ids.ausgabe)
      routes.push({
        slug: "ausgabe-detail",
        path: `/app/ausgaben/${ids.ausgabe}`,
      });
    if (ids.einnahme)
      routes.push({
        slug: "einnahme-detail",
        path: `/app/einnahmen/${ids.einnahme}`,
      });
    if (ids.spende)
      routes.push({
        slug: "spende-detail",
        path: `/app/spenden/${ids.spende}`,
      });
    if (ids.member)
      routes.push({
        slug: "member-detail",
        path: `/app/mitglieder/${ids.member}`,
      });
    if (ids.member)
      routes.push({
        slug: "mitglieder-bericht",
        path: `/app/mitglieder/bericht/${year}`,
      });
    if (ids.projekt)
      routes.push({
        slug: "projekt-detail",
        path: `/app/projekte/${ids.projekt}`,
      });
    if (ids.rechnung)
      routes.push({
        slug: "rechnung-detail",
        path: `/app/rechnungen/${ids.rechnung}`,
      });
    if (ids.kunde)
      routes.push({ slug: "kunde-detail", path: `/app/kunden/${ids.kunde}` });
    if (ids.inboxAus)
      routes.push({ slug: "inbox-detail", path: `/app/inbox/${ids.inboxAus}` });

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      await loginAs(page, "admin");
      for (const r of routes) {
        await capture(page, r.slug, r.path, vp);
      }

      // ── Interactive: open the inbox manual-import sheet ────────────────────
      try {
        await page.goto("/app/inbox", { waitUntil: "networkidle" });
        const trigger = page
          .getByRole("button", {
            name: /manuell hinzufügen|hinzufügen|manuell/i,
          })
          .first();
        if (await trigger.isVisible({ timeout: 3000 }).catch(() => false)) {
          await trigger.click();
          await page.waitForTimeout(800);
          await page.screenshot({
            path: `${OUT}/inbox-manual-sheet__${vp.name}.png`,
            fullPage: true,
          });
        }
      } catch {
        /* best-effort */
      }

      // ── Interactive: member beitrag mark-paid popover (member detail) ──────
      if (ids.member) {
        try {
          await page.goto(`/app/mitglieder/${ids.member}`, {
            waitUntil: "networkidle",
          });
          const pay = page
            .getByRole("button", {
              name: /bezahlt|zahlung|markieren|erfassen/i,
            })
            .first();
          if (await pay.isVisible({ timeout: 3000 }).catch(() => false)) {
            await pay.click();
            await page.waitForTimeout(700);
            await page.screenshot({
              path: `${OUT}/member-beitrag-popover__${vp.name}.png`,
              fullPage: true,
            });
          }
        } catch {
          /* best-effort */
        }
      }

      await ctx.close();
    }

    writeFileSync(`${OUT}/_errors.json`, JSON.stringify(errorLog, null, 2));
    // Print a concise error summary to the test output.
    const flagged = Object.entries(errorLog)
      .map(([slug, runs]) => ({ slug, errs: runs.flatMap((r) => r.errors) }))
      .filter((x) => x.errs.length > 0);
    console.log("=== QA CAPTURE ERROR SUMMARY ===");
    console.log(JSON.stringify(flagged, null, 2));
  });
});
