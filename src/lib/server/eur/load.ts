/**
 * Server-side composer for the C1 EÜR tabbed workspace.
 *
 * Two layers:
 *   - composeEurWorkspaceData(input): PURE composition (testable, no DB)
 *   - loadEurWorkspaceData(year, db): thin DB shell over composeEurWorkspaceData
 *
 * Resolves: VB-001, JB-007, UX-100, UI-002, UI-034 (server-side data layer
 * for cycles 2-5 of the C1 redesign).
 */

import { sql } from "drizzle-orm";
import {
  computeEurYear,
  type EurRow,
  type Sphere,
} from "$lib/server/domain/eur.js";
import {
  computeMonthlyOverschuss,
  computePreFlight,
  computeSphereYoY,
  computeWgbStatus,
  type MonthlyRow,
  type PreFlightChecklist,
  type PreFlightInput,
  type SphereTotalsByYear,
  type SphereYoYRow,
  type WgbStatus,
} from "./index.js";
import { isYearClosed } from "$lib/server/domain/jahresabschluss.js";
import { getDb } from "$lib/server/db/index.js";
import { env } from "$lib/server/env.js";

// ── Serialized payload shapes (returned to the client) ───────────────────────

export interface EurWorkspaceSphereSummary {
  sphere: Sphere;
  einnahmenCount: number;
  ausgabenCount: number;
  einnahmenCents: number;
  ausgabenCents: number;
  ueberschussCents: number;
}

export interface SerializedEurYear {
  year: number;
  totalEinnahmenCents: number;
  totalAusgabenCents: number;
  totalUeberschussCents: number;
  bySphere: Record<Sphere, EurWorkspaceSphereSummary>;
}

export interface EurWorkspaceTab {
  id: "uebersicht" | "buchungsliste" | "spenden" | "exports";
  label: string;
  href: string;
}

export interface EurWorkspaceData {
  year: number;
  priorYear: number;
  vereinName: string;
  closed: boolean;
  spendenCount: number;
  eur: SerializedEurYear;
  priorEur: { totalUeberschussCents: number };
  sphereYoY: SphereYoYRow[];
  monthlyOverschuss: number[];
  wgb: WgbStatus;
  preFlight: PreFlightChecklist;
  tabs: EurWorkspaceTab[];
}

// ── Pure composer ────────────────────────────────────────────────────────────

export interface ComposeEurWorkspaceInput {
  year: number;
  priorYear: number;
  currentEinnahmen: EurRow[];
  currentAusgaben: EurRow[];
  priorEinnahmen: EurRow[];
  priorAusgaben: EurRow[];
  monthlyRows: MonthlyRow[];
  preFlight: PreFlightInput;
  vereinName: string;
  closed: boolean;
  spendenCount: number;
}

export function composeEurWorkspaceData(
  input: ComposeEurWorkspaceInput,
): EurWorkspaceData {
  const eur = computeEurYear(
    input.year,
    input.currentEinnahmen,
    input.currentAusgaben,
  );
  const priorEur = computeEurYear(
    input.priorYear,
    input.priorEinnahmen,
    input.priorAusgaben,
  );

  const currentTotals = sphereTotalsFrom(eur);
  const priorTotals = sphereTotalsFrom(priorEur);
  const sphereYoY = computeSphereYoY(currentTotals, priorTotals);

  const monthlyOverschuss = computeMonthlyOverschuss(input.monthlyRows);

  // WGB applies only to wirtschaftlich-Einnahmen
  const wgb = computeWgbStatus(
    Number(eur.bySphere.wirtschaftlich.totals.einnahmenCents),
  );

  const preFlight = computePreFlight(input.preFlight);

  const serializedEur: SerializedEurYear = {
    year: eur.year,
    totalEinnahmenCents: Number(eur.totalEinnahmenCents),
    totalAusgabenCents: Number(eur.totalAusgabenCents),
    totalUeberschussCents: Number(eur.totalUeberschussCents),
    bySphere: serializeBySphere(eur.bySphere),
  };

  const tabs: EurWorkspaceTab[] = [
    {
      id: "uebersicht",
      label: "Übersicht",
      href: `/app/jahresabschluss/${input.year}/uebersicht`,
    },
    {
      id: "buchungsliste",
      label: "Buchungsliste",
      href: `/app/jahresabschluss/${input.year}/buchungsliste`,
    },
    {
      id: "spenden",
      label: "Spenden",
      href: `/app/jahresabschluss/${input.year}/spenden`,
    },
    {
      id: "exports",
      label: "Exports",
      href: `/app/jahresabschluss/${input.year}/exports`,
    },
  ];

  return {
    year: input.year,
    priorYear: input.priorYear,
    vereinName: input.vereinName,
    closed: input.closed,
    spendenCount: input.spendenCount,
    eur: serializedEur,
    priorEur: { totalUeberschussCents: Number(priorEur.totalUeberschussCents) },
    sphereYoY,
    monthlyOverschuss,
    wgb,
    preFlight,
    tabs,
  };
}

function sphereTotalsFrom(
  eur: ReturnType<typeof computeEurYear>,
): SphereTotalsByYear {
  const out = {} as SphereTotalsByYear;
  for (const sphere of [
    "ideeller",
    "vermoegen",
    "zweckbetrieb",
    "wirtschaftlich",
  ] as const) {
    const data = eur.bySphere[sphere];
    out[sphere] = {
      einnahmenCents: Number(data.totals.einnahmenCents),
      ausgabenCents: Number(data.totals.ausgabenCents),
      ueberschussCents: Number(data.totals.ueberschussCents),
    };
  }
  return out;
}

function serializeBySphere(
  bySphere: ReturnType<typeof computeEurYear>["bySphere"],
): Record<Sphere, EurWorkspaceSphereSummary> {
  const out = {} as Record<Sphere, EurWorkspaceSphereSummary>;
  for (const sphere of [
    "ideeller",
    "vermoegen",
    "zweckbetrieb",
    "wirtschaftlich",
  ] as const) {
    const data = bySphere[sphere];
    out[sphere] = {
      sphere: data.sphere,
      einnahmenCount: data.einnahmen.length,
      ausgabenCount: data.ausgaben.length,
      einnahmenCents: Number(data.totals.einnahmenCents),
      ausgabenCents: Number(data.totals.ausgabenCents),
      ueberschussCents: Number(data.totals.ueberschussCents),
    };
  }
  return out;
}

// ── DB shell ─────────────────────────────────────────────────────────────────

interface VEurYearRow {
  art: string;
  business_id: string;
  gebucht_am: Date;
  betrag_cents: bigint;
  bezeichnung: string;
  sphere_snapshot: string;
  kategorie_id: string | null;
  kategorie_name_snapshot: string;
  eur_zeile: number | null;
  anlage_gem_zeile: number | null;
  beleg_drive_file_id: string | null;
  beleg_original_name: string | null;
}

/**
 * Load + compose the full workspace payload for /app/jahresabschluss/[year].
 *
 * Queries the base `income` + `expenses` tables directly (NOT the v_eur_year
 * view). `app_runtime` has CRUD on the base tables per 0002_roles.sql but
 * v_eur_year was only granted to `app_export` — using the view would fail
 * for the live route runtime AND the unit/e2e test runner.
 */
export async function loadEurWorkspaceData(
  year: number,
): Promise<EurWorkspaceData> {
  const db = getDb();
  const priorYear = year - 1;

  // 1. Income + expense rows for current + prior year, mirroring the
  //    v_eur_year UNION shape (without the kategorien JOIN — c1 doesn't
  //    use eur_zeile/anlage_gem_zeile in the workspace payload, only in
  //    the bundle-export path which keeps its existing query).
  const rawRows = (await db.execute(sql`
    SELECT 'income' AS art, business_id, gebucht_am, year_of_buchung,
           betrag_cents, bezeichnung, sphere_snapshot, kategorie_id,
           kategorie_name_snapshot, beleg_drive_file_id, beleg_original_name
      FROM income
     WHERE year_of_buchung IN (${year}, ${priorYear})
    UNION ALL
    SELECT 'expense' AS art, business_id, gebucht_am, year_of_buchung,
           betrag_cents, bezeichnung,
           COALESCE(sphere_override, sphere_snapshot) AS sphere_snapshot,
           kategorie_id, kategorie_name_snapshot,
           beleg_drive_file_id, beleg_original_name
      FROM expenses
     WHERE year_of_buchung IN (${year}, ${priorYear})
     ORDER BY gebucht_am ASC
  `)) as unknown as Array<
    Omit<VEurYearRow, "eur_zeile" | "anlage_gem_zeile"> & {
      year_of_buchung: number;
    }
  >;

  const currentRows = rawRows.filter((r) => r.year_of_buchung === year);
  const priorRows = rawRows.filter((r) => r.year_of_buchung === priorYear);

  const mkRow = (r: (typeof rawRows)[number]): EurRow => ({
    businessId: r.business_id,
    gebuchtAm: r.gebucht_am,
    betragCents: BigInt(r.betrag_cents),
    sphereSnapshot: r.sphere_snapshot as Sphere,
    kategorieId: r.kategorie_id,
    kategorieNameSnapshot: r.kategorie_name_snapshot,
    eurZeile: null,
    anlageGemZeile: null,
    bezeichnung: r.bezeichnung,
    belegDriveFileId: r.beleg_drive_file_id,
    belegOriginalName: r.beleg_original_name,
  });

  const currentEinnahmen = currentRows
    .filter((r) => r.art === "income")
    .map(mkRow);
  const currentAusgaben = currentRows
    .filter((r) => r.art === "expense")
    .map(mkRow);
  const priorEinnahmen = priorRows
    .filter((r) => r.art === "income")
    .map(mkRow);
  const priorAusgaben = priorRows
    .filter((r) => r.art === "expense")
    .map(mkRow);

  // 2. Monthly aggregation for sparkline (current year only). Same direct
  //    base-table query for the same role-grants reason.
  const monthlyRows = (await db.execute(sql`
    SELECT 'income' AS art,
           EXTRACT(MONTH FROM gebucht_am AT TIME ZONE 'Europe/Berlin')::int AS month,
           SUM(betrag_cents)::bigint AS sum_cents
      FROM income
     WHERE year_of_buchung = ${year}
     GROUP BY month
    UNION ALL
    SELECT 'expense' AS art,
           EXTRACT(MONTH FROM gebucht_am AT TIME ZONE 'Europe/Berlin')::int AS month,
           SUM(betrag_cents)::bigint AS sum_cents
      FROM expenses
     WHERE year_of_buchung = ${year}
     GROUP BY month
     ORDER BY month ASC
  `)) as unknown as Array<{
    art: "income" | "expense";
    month: number;
    sum_cents: bigint;
  }>;

  const monthlyForCompose: MonthlyRow[] = monthlyRows.map((r) => ({
    art: r.art,
    month: r.month,
    sumCents: r.sum_cents,
  }));

  // 3. Pre-flight counters
  const [uncatRes, missingBelegRes, draftInvRes, inboxRes] = await Promise.all([
    db.execute<{ cnt: string }>(sql`
      SELECT (
        (SELECT count(*) FROM expenses WHERE year_of_buchung = ${year} AND kategorie_id IS NULL) +
        (SELECT count(*) FROM income  WHERE year_of_buchung = ${year} AND kategorie_id IS NULL)
      )::text AS cnt
    `),
    db.execute<{ cnt: string }>(sql`
      SELECT count(*)::text AS cnt FROM expenses
       WHERE year_of_buchung = ${year}
         AND beleg_drive_file_id IS NULL
    `),
    db.execute<{ cnt: string }>(sql`
      SELECT count(*)::text AS cnt FROM invoices
       WHERE year_of_buchung = ${year}
         AND pdf_status = 'not_generated'
    `),
    db.execute<{ cnt: string }>(sql`
      SELECT count(*)::text AS cnt FROM auslagen_submissions
       WHERE decided_at IS NULL
    `),
  ]);

  const uncategorizedCount = parseInt(uncatRes[0]?.cnt ?? "0", 10);
  const missingBelegCount = parseInt(missingBelegRes[0]?.cnt ?? "0", 10);
  const draftInvoiceCount = parseInt(draftInvRes[0]?.cnt ?? "0", 10);
  const auditInboxQueueCount = parseInt(inboxRes[0]?.cnt ?? "0", 10);

  // 4. festgeschrieben_bis
  const festRes = (await db.execute<{ value: unknown }>(sql`
    SELECT value FROM settings WHERE key = 'festgeschrieben_bis'
  `)) as { value: unknown }[];
  let festgeschriebenBis: number | null = null;
  if (festRes.length > 0) {
    const v = festRes[0]!.value;
    if (typeof v === "number" && Number.isFinite(v)) festgeschriebenBis = v;
    else if (typeof v === "string") {
      const parsed = Number(v.replace(/^"|"$/g, ""));
      if (Number.isFinite(parsed)) festgeschriebenBis = parsed;
    }
  }

  // 5. Spenden count + festgeschrieben/closed
  const [spendenRes, closed] = await Promise.all([
    db.execute<{ cnt: string }>(sql`
      SELECT count(*)::text AS cnt FROM donations WHERE year_of_buchung = ${year}
    `),
    isYearClosed(year),
  ]);
  const spendenCount = parseInt(spendenRes[0]?.cnt ?? "0", 10);

  return composeEurWorkspaceData({
    year,
    priorYear,
    currentEinnahmen,
    currentAusgaben,
    priorEinnahmen,
    priorAusgaben,
    monthlyRows: monthlyForCompose,
    preFlight: {
      year,
      uncategorizedCount,
      missingBelegCount,
      draftInvoiceCount,
      auditInboxQueueCount,
      festgeschriebenBis,
      totalIncomeRows: currentEinnahmen.length,
      totalExpenseRows: currentAusgaben.length,
    },
    vereinName: env.VEREIN_NAME || "Folge der Wolke e.V.",
    closed,
    spendenCount,
  });
}
