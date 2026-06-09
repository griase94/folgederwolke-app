<script lang="ts">
  /**
   * /app/ausgaben — Ausgaben list page (Phase 4, Tier C1).
   *
   * Binds the shared (generic) `TransactionListScaffold` to the Ausgaben row type
   * (`AusgabenRow`) with: an `AusgabenKpi` header pill snippet, the Ausgaben
   * `columns` (Datum, ID mono, Bezeichnung + Bezahlt-von subtitle, Bezahlt von,
   * Kategorie, the §13 Sphäre LEFT COLOR-RULE — a thin tone bar, not a filled
   * badge —, Betrag right via Money, Status badge, chevron), and the bulk
   * action wiring (BulkActionsBar + SEPA + post-SEPA modals — Task 3).
   */
  import { page } from "$app/stores";
  import TransactionListScaffold from "$lib/components/admin/transactions/TransactionListScaffold.svelte";
  import AusgabenKpi from "$lib/components/admin/transactions/ausgaben/AusgabenKpi.svelte";
  import { ausgabenColumns } from "$lib/components/admin/transactions/ausgaben/columns.js";
  import BulkActionsBar from "$lib/components/admin/transactions/ausgaben/BulkActionsBar.svelte";
  import SepaCopyModal from "$lib/components/admin/transactions/ausgaben/SepaCopyModal.svelte";
  import PostSepaMarkErstattetModal from "$lib/components/admin/transactions/ausgaben/PostSepaMarkErstattetModal.svelte";
  import Money from "$lib/components/ui/money/money.svelte";
  import type { Sphere } from "$lib/domain/sphere.js";
  import { SPHERE_LABELS } from "$lib/domain/sphere.js";
  import { statusPresentation } from "$lib/domain/transaction-status.js";
  import type { AusgabenRow } from "$lib/server/domain/transactions.js";
  import { deserialize } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import type { ActionResult } from "@sveltejs/kit";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  // ── Bulk select + Als-bezahlt (Task 3) ────────────────────────────────────
  // The bulk pool is `approvedPending` (member/extern rows awaiting Erstattung;
  // Verein-direct rows are created already-erstattet and never appear). Bulk
  // Als-bezahlt POSTs `?/bulk-mark-erstattet` (one markExpenseErstattet per row,
  // each fires the SEPA-payout confirmation mail) and surfaces a PER-ROW summary
  // toast ("9 erstattet, 1 festgeschrieben", spec §7.1).
  let selectedIds = $state<string[]>([]);

  /** Structured per-row bulk summary (§8) — mirrors the server's BulkSummary. */
  interface BulkSummary {
    erstattet: string[];
    festgeschrieben: string[];
    bereitsBezahlt: string[];
    notFound: string[];
    fehler: { id: string; error: string }[];
  }

  function toggleSelect(id: string) {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
  }

  /** Render the structured per-row summary as a single German toast (§8). */
  function summarize(summary: BulkSummary) {
    const parts: string[] = [];
    if (summary.erstattet.length)
      parts.push(`${summary.erstattet.length} erstattet`);
    if (summary.bereitsBezahlt.length)
      parts.push(`${summary.bereitsBezahlt.length} bereits erstattet`);
    if (summary.festgeschrieben.length)
      parts.push(`${summary.festgeschrieben.length} festgeschrieben`);
    if (summary.notFound.length)
      parts.push(`${summary.notFound.length} nicht gefunden`);
    if (summary.fehler.length)
      parts.push(`${summary.fehler.length} fehlgeschlagen`);
    const msg = parts.join(", ") || "Keine Auslagen verarbeitet";
    const hadProblem =
      summary.festgeschrieben.length > 0 ||
      summary.notFound.length > 0 ||
      summary.fehler.length > 0;
    if (hadProblem) toast.warning(msg);
    else toast.success(msg);
  }

  async function postBulk(
    action: string,
    ids: string[],
    chosenDate: string,
    zahlungsartId: string,
  ) {
    const fd = new FormData();
    fd.set("expenseIds", ids.join(","));
    fd.set("chosenDate", chosenDate);
    fd.set("zahlungsartId", zahlungsartId);
    const res = await fetch(action, { method: "POST", body: fd });
    const result = deserialize(await res.text()) as ActionResult;
    if (result.type === "success" && result.data) {
      const payload = result.data as { summary?: BulkSummary };
      if (payload.summary) summarize(payload.summary);
      selectedIds = [];
      await invalidateAll();
    } else if (result.type === "failure") {
      const err = (result.data as { error?: string } | undefined)?.error;
      toast.error(err ?? "Fehler beim Markieren");
    } else {
      toast.error("Fehler beim Markieren");
    }
  }

  function handleBulkMarkErstattet(
    ids: string[],
    chosenDate: string,
    zahlungsartId: string,
  ) {
    void postBulk("?/bulk-mark-erstattet", ids, chosenDate, zahlungsartId);
  }

  // ── SEPA modals ────────────────────────────────────────────────────────────
  let sepaModalOpen = $state(false);
  let postSepaModalOpen = $state(false);
  let sepaExpenseIds = $state<string[]>([]);
  let sepaTotalCents = $state(0);

  const sepaExpenses = $derived(
    sepaExpenseIds.length > 0
      ? data.approvedPending.filter((e) => sepaExpenseIds.includes(e.id))
      : data.approvedPending,
  );

  function openSepaModal(ids: string[]) {
    const approvedIds = new Set(data.approvedPending.map((e) => e.id));
    sepaExpenseIds = ids.filter((id) => approvedIds.has(id));
    sepaModalOpen = true;
  }

  function onSepaXmlCopied(ids: string[], totalCents: number) {
    sepaModalOpen = false;
    sepaExpenseIds = ids;
    sepaTotalCents = totalCents;
    postSepaModalOpen = true;
  }

  async function onPostSepaSuccess(count: number) {
    postSepaModalOpen = false;
    selectedIds = [];
    await invalidateAll();
    toast.success(
      `${count} ${count === 1 ? "Auslage" : "Auslagen"} als erstattet markiert`,
    );
  }

  // ── Sphäre LEFT color-rule (§13) ──────────────────────────────────────────
  // A thin vertical tone bar keyed on the row's sphere — NOT the filled
  // SphereBadge (that lives on the detail page). Mirrors the §13 palette (the
  // solid tone of each Sphäre) so the list stays calm (a quiet left edge) while
  // the four Sphären stay legible.
  const SPHERE_RULE: Record<Sphere, string> = {
    ideeller: "bg-pink-400 dark:bg-pink-500",
    vermoegen: "bg-blue-400 dark:bg-blue-500",
    zweckbetrieb: "bg-violet-400 dark:bg-violet-500",
    wirtschaftlich: "bg-amber-400 dark:bg-amber-500",
  };

  function ruleFor(sphere: string): string {
    return SPHERE_RULE[sphere as Sphere] ?? "bg-border";
  }

  function sphereLabel(sphere: string): string {
    return SPHERE_LABELS[sphere as Sphere] ?? sphere;
  }

  // ── Status badge ─────────────────────────────────────────────────────────
  // Label + tone come from the SHARED transaction-status map so the desktop
  // column and the mobile card never drift (item 7).

  function formatDatum(iso: string): string {
    return new Date(iso).toLocaleDateString("de-DE");
  }

  const columns = ausgabenColumns({
    datum: datumCell,
    id: idCell,
    bezeichnung: bezeichnungCell,
    bezahltVon: bezahltVonCell,
    kategorie: kategorieCell,
    sphaere: sphaereCell,
    betrag: betragCell,
    status: statusCell,
    chevron: chevronCell,
  });
</script>

<svelte:head>
  <title>Ausgaben – {$page.data.vereinName}</title>
</svelte:head>

<!-- ── KPI header strip ────────────────────────────────────────────────────── -->
{#snippet kpi()}
  <AusgabenKpi
    totalCents={data.kpi.totalCents}
    count={data.kpi.count}
    offenCount={data.kpi.offenCount}
    oldestOpenAgeDays={data.kpi.oldestOpenAgeDays}
    year={data.yearScope}
  />
{/snippet}

<!-- ── Column cells (typed on AusgabenRow — no casts) ──────────────────────── -->
{#snippet sphaereCell(row: AusgabenRow)}
  <span
    role="img"
    data-testid="sphaere-rule"
    data-sphere={row.sphereSnapshot}
    aria-label={sphereLabel(row.sphereSnapshot)}
    title={sphereLabel(row.sphereSnapshot)}
    class={["block h-6 w-1 rounded-full", ruleFor(row.sphereSnapshot)].join(
      " ",
    )}
  ></span>
{/snippet}

{#snippet datumCell(row: AusgabenRow)}
  <span class="whitespace-nowrap text-muted-foreground"
    >{formatDatum(row.gebuchtAm)}</span
  >
{/snippet}

{#snippet idCell(row: AusgabenRow)}
  <span class="font-mono text-xs text-muted-foreground">{row.businessId}</span>
{/snippet}

{#snippet bezeichnungCell(row: AusgabenRow)}
  <!-- FIX A (review): primary discoverable link so desktop Julia can open a booking. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    href={`/app/ausgaben/${row.id}`}
    class="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >{row.bezeichnung}</a
  >
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {#if row.bezahltVonDisplay}
    <span class="mt-0.5 block text-xs text-muted-foreground"
      >{row.bezahltVonDisplay}</span
    >
  {/if}
{/snippet}

{#snippet bezahltVonCell(row: AusgabenRow)}
  <span class="text-muted-foreground">{row.bezahltVonDisplay}</span>
{/snippet}

{#snippet kategorieCell(row: AusgabenRow)}
  <span class="text-muted-foreground">{row.kategorieNameSnapshot}</span>
{/snippet}

{#snippet betragCell(row: AusgabenRow)}
  <Money
    valueInCents={-row.betragCents}
    class="whitespace-nowrap font-medium"
  />
{/snippet}

{#snippet statusCell(row: AusgabenRow)}
  <span
    class={[
      "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
      statusPresentation(row.status).tone,
    ].join(" ")}
  >
    {statusPresentation(row.status).label}
  </span>
{/snippet}

{#snippet chevronCell(row: AusgabenRow)}
  <!-- FIX A (review): real <a> so chevron is keyboard-focusable on desktop. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    href={`/app/ausgaben/${row.id}`}
    aria-label="Detail öffnen"
    class="inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    ><span aria-hidden="true">›</span></a
  >
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

<!-- ── Bulk action bar (rendered by the scaffold above the list) ───────────── -->
{#snippet bulkBar()}
  <BulkActionsBar
    {selectedIds}
    zahlungsarten={data.zahlungsarten}
    onMarkErstattet={handleBulkMarkErstattet}
    onSepaXml={openSepaModal}
    onClear={() => (selectedIds = [])}
  />
{/snippet}

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
  <TransactionListScaffold
    tab="ausgaben"
    rows={data.rows}
    total={data.total}
    page={data.page}
    pageSize={data.pageSize}
    selectedYear={data.yearScope}
    currentYear={data.currentYear}
    filterState={data.filterState}
    kategorieOptions={data.kategorieOptions}
    memberOptions={data.memberOptions}
    {columns}
    {kpi}
    bulk={{ selectedIds, onToggle: toggleSelect, bar: bulkBar }}
    detailHrefBase="/app/ausgaben"
    newLabel="Neue Ausgabe"
    newHref="/app/ausgaben/neu"
  />
</div>

<!-- ── SEPA modals (bulk payout flow) ──────────────────────────────────────── -->
<SepaCopyModal
  open={sepaModalOpen}
  expenses={sepaExpenses}
  onclose={() => (sepaModalOpen = false)}
  oncopied={onSepaXmlCopied}
/>

<PostSepaMarkErstattetModal
  open={postSepaModalOpen}
  expenseIds={sepaExpenseIds}
  totalCents={sepaTotalCents}
  zahlungsarten={data.zahlungsarten}
  onclose={() => (postSepaModalOpen = false)}
  onsuccess={onPostSepaSuccess}
/>
