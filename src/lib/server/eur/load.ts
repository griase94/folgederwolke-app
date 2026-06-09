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
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";
import { berlinYear } from "$lib/domain/year.js";

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
  /**
   * C1-H2 — Spenden + Mitgliedsbeiträge for the EÜR Einnahmen side
   * (mirrors dashboard cashflow's 3-source union). Each row carries its own
   * sphereSnapshot (donations are typically ideeller; member-beitrags are
   * always ideeller). Optional so existing callers (tests) need not supply.
   */
  currentSpenden?: EurRow[];
  currentBeitrags?: EurRow[];
  priorSpenden?: EurRow[];
  priorBeitrags?: EurRow[];
  monthlyRows: MonthlyRow[];
  preFlight: PreFlightInput;
  vereinName: string;
  closed: boolean;
  spendenCount: number;
}

export function composeEurWorkspaceData(
  input: ComposeEurWorkspaceInput,
): EurWorkspaceData {
  // Union income + donations + member_beitrags on the Einnahmen side.
  // Donations + Mitgliedsbeiträge represent realized cashflow into the
  // Verein and must appear in the EÜR (BMF Anlage EÜR Zeile 2 + 4 for
  // ideeller). Without this union, ~60-80% of a typical Verein's ideelle
  // Einnahmen would be silently dropped.
  const currentEinnahmenUnion = [
    ...input.currentEinnahmen,
    ...(input.currentSpenden ?? []),
    ...(input.currentBeitrags ?? []),
  ];
  const priorEinnahmenUnion = [
    ...input.priorEinnahmen,
    ...(input.priorSpenden ?? []),
    ...(input.priorBeitrags ?? []),
  ];

  const eur = computeEurYear(
    input.year,
    currentEinnahmenUnion,
    input.currentAusgaben,
  );
  const priorEur = computeEurYear(
    input.priorYear,
    priorEinnahmenUnion,
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

/**
 * Result of `loadEurAggregatesForPdf` — the minimal subset of workspace data
 * the downloadable EÜR PDF needs.
 *
 * Critically, `eur` is computed over the SAME 3-source union (income +
 * donations + member_beitrags) as the workspace UI. This means the
 * Steuerberater-PDF and the Übersicht tab show the identical Einnahmen
 * totals — without this shared path, the PDF would silently undercount
 * Einnahmen by the ~60-80% that typically come from Mitgliedsbeiträge +
 * Spenden in a German Verein.
 */
export interface EurPdfAggregates {
  eur: ReturnType<typeof computeEurYear>;
  vereinName: string;
  /**
   * Original income rows + expense rows (with kategorien JOIN for
   * eur_zeile / anlage_gem_zeile). Returned alongside `eur` so callers
   * that also need rows for Anlage-Gem-CSV / GoBD-Z3 (e.g. bundle.zip)
   * can skip a second DB round-trip.
   *
   * NB: these are *only* the income + expense rows — donations + paid
   * Mitgliedsbeiträge are folded INTO `eur` via the union but are NOT
   * surfaced here, because they have no `eur_zeile` / `anlage_gem_zeile`
   * (the Anlage-Gem-CSV aggregator skips null Zeilen anyway). Spenden
   * have their own dedicated bundle export (03_Spendenliste-${year}.csv);
   * member_beitrags have 08_Mitgliedsbeitraege-${year}.csv.
   */
  einnahmenRowsWithKategorien: EurRow[];
  ausgabenRowsWithKategorien: EurRow[];
}

/**
 * Load + compose the EÜR aggregates the PDF generator needs.
 *
 * Shared by:
 *   - `src/routes/app/jahresabschluss/[year]/eur.pdf/+server.ts`
 *   - `src/routes/app/jahresabschluss/[year]/bundle.zip/+server.ts` (for the
 *     embedded EÜR PDF only — Anlage-Gem-CSV + GoBD-Z3 use the rows alongside)
 *
 * The returned `eur` uses the same 3-source union as `loadEurWorkspaceData`,
 * guaranteeing the downloaded PDF matches the workspace UI byte-for-byte on
 * the Einnahmen side.
 */
export async function loadEurAggregatesForPdf(
  year: number,
): Promise<EurPdfAggregates> {
  const db = getDb();
  const { name: vereinName } = await readStammdaten();

  // Income + expense rows with the kategorien JOIN (PDF doesn't need
  // eur_zeile / anlage_gem_zeile itself, but bundle.zip does — pulling
  // them here lets the bundle reuse this query instead of running its own).
  const rawEurRows = (await db.execute(sql`
    SELECT 'income' AS art, i.business_id, i.gebucht_am, i.betrag_cents, i.bezeichnung,
           i.sphere_snapshot, i.kategorie_id, i.kategorie_name_snapshot,
           k.eur_zeile, k.anlage_gem_zeile, i.beleg_drive_file_id, i.beleg_original_name
      FROM income i
      LEFT JOIN kategorien k ON k.id = i.kategorie_id
     WHERE i.year_of_buchung = ${year}
    UNION ALL
    SELECT 'expense' AS art, e.business_id, e.gebucht_am, e.betrag_cents, e.bezeichnung,
           COALESCE(e.sphere_override, e.sphere_snapshot),
           e.kategorie_id, e.kategorie_name_snapshot,
           k.eur_zeile, k.anlage_gem_zeile, e.beleg_drive_file_id, e.beleg_original_name
      FROM expenses e
      LEFT JOIN kategorien k ON k.id = e.kategorie_id
     WHERE e.year_of_buchung = ${year}
     ORDER BY gebucht_am ASC
  `)) as unknown as VEurYearRow[];

  const mkRow = (r: VEurYearRow): EurRow => ({
    businessId: r.business_id,
    gebuchtAm: r.gebucht_am,
    betragCents: BigInt(r.betrag_cents),
    sphereSnapshot: r.sphere_snapshot as Sphere,
    kategorieId: r.kategorie_id,
    kategorieNameSnapshot: r.kategorie_name_snapshot,
    eurZeile: r.eur_zeile,
    anlageGemZeile: r.anlage_gem_zeile,
    bezeichnung: r.bezeichnung,
    belegDriveFileId: r.beleg_drive_file_id,
    belegOriginalName: r.beleg_original_name,
  });

  const einnahmenRowsWithKategorien = rawEurRows
    .filter((r) => r.art === "income")
    .map(mkRow);
  const ausgabenRowsWithKategorien = rawEurRows
    .filter((r) => r.art === "expense")
    .map(mkRow);

  // 3-source union on the Einnahmen side — mirrors loadEurWorkspaceData.
  // Donations table has no bezeichnung column; synthesize from spender or
  // kategorie name. Mitgliedsbeiträge: paid_cents (gezahlt_am IS NOT NULL),
  // always 'ideeller' by gemeinnützigkeitsrechtlicher Definition.
  const donationRows = (await db.execute(sql`
    SELECT business_id, gebucht_am, betrag_cents,
           COALESCE(spender_name, kategorie_name_snapshot, 'Spende') AS bezeichnung,
           sphere_snapshot, kategorie_id, kategorie_name_snapshot
      FROM donations
     WHERE year_of_buchung = ${year}
       AND supersedes_id IS NULL
  `)) as unknown as Array<{
    business_id: string;
    gebucht_am: Date;
    betrag_cents: bigint;
    bezeichnung: string;
    sphere_snapshot: string;
    kategorie_id: string | null;
    kategorie_name_snapshot: string;
  }>;

  const donationEurRows: EurRow[] = donationRows.map((r) => ({
    businessId: r.business_id,
    gebuchtAm: r.gebucht_am,
    betragCents: BigInt(r.betrag_cents),
    sphereSnapshot: r.sphere_snapshot as Sphere,
    kategorieId: r.kategorie_id,
    kategorieNameSnapshot: r.kategorie_name_snapshot,
    eurZeile: null,
    anlageGemZeile: null,
    bezeichnung: r.bezeichnung,
    belegDriveFileId: null,
    belegOriginalName: null,
  }));

  const beitragRows = (await db.execute(sql`
    SELECT id::text AS business_id, gezahlt_am,
           paid_cents AS betrag_cents,
           'Mitgliedsbeitrag ' || year::text AS bezeichnung
      FROM member_beitrags
     WHERE year = ${year}
       AND gezahlt_am IS NOT NULL
       AND paid_cents > 0
  `)) as unknown as Array<{
    business_id: string;
    gezahlt_am: string;
    betrag_cents: bigint;
    bezeichnung: string;
  }>;

  const beitragEurRows: EurRow[] = beitragRows.map((r) => ({
    businessId: r.business_id,
    gebuchtAm: new Date(r.gezahlt_am),
    betragCents: BigInt(r.betrag_cents),
    sphereSnapshot: "ideeller",
    kategorieId: null,
    kategorieNameSnapshot: "Mitgliedsbeitrag",
    eurZeile: null,
    anlageGemZeile: null,
    bezeichnung: r.bezeichnung,
    belegDriveFileId: null,
    belegOriginalName: null,
  }));

  const einnahmenUnion = [
    ...einnahmenRowsWithKategorien,
    ...donationEurRows,
    ...beitragEurRows,
  ];

  const eur = computeEurYear(year, einnahmenUnion, ausgabenRowsWithKategorien);

  return {
    eur,
    vereinName,
    einnahmenRowsWithKategorien,
    ausgabenRowsWithKategorien,
  };
}

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
  const { name: vereinName } = await readStammdaten();

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
  const priorEinnahmen = priorRows.filter((r) => r.art === "income").map(mkRow);
  const priorAusgaben = priorRows.filter((r) => r.art === "expense").map(mkRow);

  // C1-H2 — Spenden + Mitgliedsbeiträge for the Einnahmen side.
  // Mirrors the dashboard cashflow 3-source union; without this the EÜR would
  // silently drop the bulk of a typical Verein's ideelle Einnahmen.
  //
  // - Donations: betrag_cents on the donations table, sphere_snapshot is
  //   present (typically 'ideeller'). gebucht_am drives Buchungsjahr just
  //   like income/expense (year_of_buchung is a GENERATED column).
  // - MemberBeitrags: paid_cents is realized cashflow (gezahlt_am IS NOT NULL).
  //   No sphereSnapshot column — Mitgliedsbeiträge are always 'ideeller' by
  //   gemeinnützigkeitsrechtlicher Definition (§§ 51-68 AO). The
  //   v_offene_beitraege view + Verein-Buchhaltung convention codifies this.
  // Donations table has no bezeichnung column — synthesize from spender or
  // kategorie name for display.
  const donationRows = (await db.execute(sql`
    SELECT business_id, gebucht_am, year_of_buchung,
           betrag_cents,
           COALESCE(spender_name, kategorie_name_snapshot, 'Spende') AS bezeichnung,
           sphere_snapshot, kategorie_id, kategorie_name_snapshot
      FROM donations
     WHERE year_of_buchung IN (${year}, ${priorYear})
       AND supersedes_id IS NULL
  `)) as unknown as Array<{
    business_id: string;
    gebucht_am: Date;
    year_of_buchung: number;
    betrag_cents: bigint;
    bezeichnung: string;
    sphere_snapshot: string;
    kategorie_id: string | null;
    kategorie_name_snapshot: string;
  }>;

  const mkDonationRow = (r: (typeof donationRows)[number]): EurRow => ({
    businessId: r.business_id,
    gebuchtAm: r.gebucht_am,
    betragCents: BigInt(r.betrag_cents),
    sphereSnapshot: r.sphere_snapshot as Sphere,
    kategorieId: r.kategorie_id,
    kategorieNameSnapshot: r.kategorie_name_snapshot,
    eurZeile: null,
    anlageGemZeile: null,
    bezeichnung: r.bezeichnung,
    belegDriveFileId: null,
    belegOriginalName: null,
  });

  const currentSpenden = donationRows
    .filter((r) => r.year_of_buchung === year)
    .map(mkDonationRow);
  const priorSpenden = donationRows
    .filter((r) => r.year_of_buchung === priorYear)
    .map(mkDonationRow);

  // member_beitrags: synthesize an ideeller EurRow per paid beitrag.
  // year column is the explicit fiscal year (not a GENERATED column —
  // beitrags are billed per fiscal year independent of when paid).
  const beitragRows = (await db.execute(sql`
    SELECT id::text AS business_id, gezahlt_am, year,
           paid_cents AS betrag_cents,
           'Mitgliedsbeitrag ' || year::text AS bezeichnung
      FROM member_beitrags
     WHERE year IN (${year}, ${priorYear})
       AND gezahlt_am IS NOT NULL
       AND paid_cents > 0
  `)) as unknown as Array<{
    business_id: string;
    gezahlt_am: string;
    year: number;
    betrag_cents: bigint;
    bezeichnung: string;
  }>;

  const mkBeitragRow = (r: (typeof beitragRows)[number]): EurRow => ({
    businessId: r.business_id,
    gebuchtAm: new Date(r.gezahlt_am),
    betragCents: BigInt(r.betrag_cents),
    sphereSnapshot: "ideeller",
    kategorieId: null,
    kategorieNameSnapshot: "Mitgliedsbeitrag",
    eurZeile: null,
    anlageGemZeile: null,
    bezeichnung: r.bezeichnung,
    belegDriveFileId: null,
    belegOriginalName: null,
  });

  const currentBeitrags = beitragRows
    .filter((r) => r.year === year)
    .map(mkBeitragRow);
  const priorBeitrags = beitragRows
    .filter((r) => r.year === priorYear)
    .map(mkBeitragRow);

  // 2. Monthly aggregation for sparkline (current year only). Same direct
  //    base-table query for the same role-grants reason. C1-H2 — extends
  //    the union to donations + paid member-beitrags so the monthly
  //    Überschuss-Trendlinie mirrors the EÜR totals.
  const monthlyRows = (await db.execute(sql`
    SELECT 'income' AS art,
           EXTRACT(MONTH FROM gebucht_am AT TIME ZONE 'Europe/Berlin')::int AS month,
           SUM(betrag_cents)::bigint AS sum_cents
      FROM income
     WHERE year_of_buchung = ${year}
     GROUP BY month
    UNION ALL
    SELECT 'income' AS art,
           EXTRACT(MONTH FROM gebucht_am AT TIME ZONE 'Europe/Berlin')::int AS month,
           SUM(betrag_cents)::bigint AS sum_cents
      FROM donations
     WHERE year_of_buchung = ${year} AND supersedes_id IS NULL
     GROUP BY month
    UNION ALL
    SELECT 'income' AS art,
           EXTRACT(MONTH FROM gezahlt_am AT TIME ZONE 'Europe/Berlin')::int AS month,
           SUM(paid_cents)::bigint AS sum_cents
      FROM member_beitrags
     WHERE year = ${year} AND gezahlt_am IS NOT NULL AND paid_cents > 0
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
  // C1-H3 — Bescheinigungs-status gate: Spenden ≥ 300 € without
  // bescheinigung_nr would force post-close re-allocation of
  // Bescheinigungs-Nummern. Warning-level check.
  const [uncatRes, missingBelegRes, draftInvRes, inboxRes, missingBescheinRes] =
    await Promise.all([
      db.execute<{ cnt: string }>(sql`
        SELECT (
          (SELECT count(*) FROM expenses WHERE year_of_buchung = ${year} AND kategorie_id IS NULL) +
          (SELECT count(*) FROM income  WHERE year_of_buchung = ${year} AND kategorie_id IS NULL)
        )::text AS cnt
      `),
      db.execute<{ cnt: string }>(sql`
        SELECT count(*)::text AS cnt FROM expenses
         WHERE year_of_buchung = ${year}
           AND beleg_file_id IS NULL
           AND beleg_verzicht_grund IS NULL
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
      db.execute<{ cnt: string }>(sql`
        SELECT count(*)::text AS cnt FROM donations
         WHERE year_of_buchung = ${year}
           AND betrag_cents >= 30000
           AND bescheinigung_nr IS NULL
           AND supersedes_id IS NULL
      `),
    ]);

  const uncategorizedCount = parseInt(uncatRes[0]?.cnt ?? "0", 10);
  const missingBelegCount = parseInt(missingBelegRes[0]?.cnt ?? "0", 10);
  const draftInvoiceCount = parseInt(draftInvRes[0]?.cnt ?? "0", 10);
  const auditInboxQueueCount = parseInt(inboxRes[0]?.cnt ?? "0", 10);
  const missingBescheinigungenCount = parseInt(
    missingBescheinRes[0]?.cnt ?? "0",
    10,
  );

  // C1-H5 — Current Buchungsjahr (Europe/Berlin) so the pre-flight can
  // block future-year Festschreibung.
  const currentJahrRes = (await db.execute<{ jahr: number }>(sql`
    SELECT year_for_booking(NOW())::int AS jahr
  `)) as { jahr: number }[];
  const currentBuchungsjahr =
    // ADR-0001: fallback if the SQL year_for_booking call returned nothing.
    currentJahrRes[0]?.jahr ?? berlinYear();

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
  //
  // C9-JUL-lite: inject the already-loaded festgeschriebenBis so isYearClosed
  // can derive the closed state from settings without a second round-trip.
  // Passing `null` (when no value is set) means "never closed".
  const [spendenRes, closed] = await Promise.all([
    db.execute<{ cnt: string }>(sql`
      SELECT count(*)::text AS cnt FROM donations WHERE year_of_buchung = ${year}
    `),
    isYearClosed(year, { festgeschriebenBis }),
  ]);
  const spendenCount = parseInt(spendenRes[0]?.cnt ?? "0", 10);

  return composeEurWorkspaceData({
    year,
    priorYear,
    currentEinnahmen,
    currentAusgaben,
    priorEinnahmen,
    priorAusgaben,
    currentSpenden,
    currentBeitrags,
    priorSpenden,
    priorBeitrags,
    monthlyRows: monthlyForCompose,
    preFlight: {
      year,
      uncategorizedCount,
      missingBelegCount,
      missingBescheinigungenCount,
      draftInvoiceCount,
      auditInboxQueueCount,
      festgeschriebenBis,
      totalIncomeRows: currentEinnahmen.length,
      totalExpenseRows: currentAusgaben.length,
      totalDonationRows: currentSpenden.length,
      totalBeitragRows: currentBeitrags.length,
      currentBuchungsjahr,
    },
    vereinName,
    closed,
    spendenCount,
  });
}
