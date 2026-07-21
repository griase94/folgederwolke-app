<script lang="ts">
  /**
   * /app/spenden/[id]/zuwendungsbestaetigung — B-PR4 redesign.
   *
   * Werkstatt-Split (.workbench): LEFT the papierweiße DocSheet preview (what
   * the PDF will say, BMF-Wortlaut 1:1 via the shared wortlaut module), RIGHT
   * the BescheinigungCard Ausstellungs-Rail (status + facts + Pflichtangaben-
   * Checkliste + the one ?/generate CTA + GoBD trust). Mobile: rail first
   * (task-first), document below.
   *
   * States: ready · config-missing (Klartext, never env-var names) · issued
   * (gesperrt) · extract-error · festgeschrieben (AUSSTELLBAR — the cert
   * carve-out lets a closed year be certified; ADR-0006 Nachtrag). The CTA-gate
   * is client-derived from the preview; the server stays the source of truth.
   */
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import { toast } from "svelte-sonner";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import FileCheck from "@lucide/svelte/icons/file-check";
  import Download from "@lucide/svelte/icons/download";
  import Info from "@lucide/svelte/icons/info";
  import Lock from "@lucide/svelte/icons/lock";
  import Loader from "@lucide/svelte/icons/loader-circle";
  import { Button } from "$lib/components/ui/button/index.js";
  import PageShell from "$lib/components/layout/PageShell.svelte";
  import { PageHeader } from "$lib/components/ui/page-header/index.js";
  import BescheinigungDocument from "$lib/components/admin/spenden/BescheinigungDocument.svelte";
  import type { BescheinigungPreview } from "$lib/components/admin/spenden/BescheinigungDocument.svelte";
  import BescheinigungCard from "$lib/components/admin/spenden/BescheinigungCard.svelte";
  import type { FactRow } from "$lib/components/ui/facts-table/index.js";
  import type { ChecklistRow } from "$lib/components/ui/checklist/index.js";
  import { formatCentsAsEuro } from "$lib/domain/money.js";
  import { formatGermanDate } from "$lib/domain/bescheinigung-wortlaut.js";

  let { data, form } = $props();

  let submitting = $state(false);

  $effect(() => {
    if (form?.action === "generate" && form?.success) {
      toast.success(`Bescheinigung ${form.bescheinigungNr} ausgestellt`);
    }
  });

  const spende = $derived(data.spende);
  const preview = $derived(data.preview);
  const enabled = $derived(data.bescheinigungEnabled);
  const issued = $derived(data.alreadyIssued);
  const extractError = $derived(data.extractError);
  const festgeschrieben = $derived(spende.festgeschriebenAt !== null);

  const spendeKindLabel = $derived(
    spende.spendeKind === "sachspende" ? "Sachspende" : "Geldspende",
  );
  const pdfHref = $derived(
    `/app/spenden/${spende.id}/zuwendungsbestaetigung/pdf`,
  );
  const spendeHref = $derived(`/app/spenden/${spende.id}`);
  const buchungsjahr = $derived(spende.zugewendetAm?.slice(0, 4) ?? "");
  // Full spender name for the warm issued-Erfolgs-Callout (brand voice). NOT a
  // first-name split — a corporate donor ("Getränke Huber") would otherwise
  // read "Damit kann Getränke …". Falls back when no name is on file.
  const spenderDisplay = $derived(
    spende.spenderName?.trim() || "die spendende Person",
  );

  // The document renders only when config is present (enabled) — a
  // legally-deficient cert must never be previewed as valid. When enabled the
  // bescheidTyp is a valid BescheidTyp (isBescheinigungEnabled guarantees it).
  const docPreview = $derived<BescheinigungPreview | null>(
    preview
      ? {
          ...preview,
          bescheidTyp: preview.bescheidTyp as
            | "freistellungsbescheid"
            | "feststellung_60a",
          spendeKind: preview.spendeKind as "geldspende" | "sachspende",
          zweckbindungKind: preview.zweckbindungKind as
            | "zweckfrei"
            | "zweckgebunden",
        }
      : null,
  );

  const facts = $derived<FactRow[]>(
    preview
      ? [
          { label: "Spende-Nr.", value: spende.businessId, variant: "num" },
          { label: "Spender:in", value: preview.spenderName || "—" },
          {
            label: "Betrag",
            value: formatCentsAsEuro(BigInt(preview.betragCents)),
            variant: "amount",
            tone: "spende",
          },
          {
            label: "Tag der Zuwendung",
            value: formatGermanDate(preview.spendeDatum),
            variant: "date",
          },
          { label: "Art", value: spendeKindLabel },
        ]
      : [],
  );

  const bescheidLabel = $derived(
    preview?.bescheidTyp === "feststellung_60a"
      ? "Feststellung nach § 60a AO"
      : "Freistellungsbescheid des Finanzamts",
  );

  const checklist = $derived<ChecklistRow[]>(preview ? buildChecklist() : []);
  const checklistComplete = $derived(checklist.every((r) => r.ok));

  function buildChecklist(): ChecklistRow[] {
    if (!preview) return [];
    const rows: ChecklistRow[] = [];
    // Server refuses Aufwandsspende issuance (Phase 2). Mirror that block here so
    // the CTA-gate can never click into an invisible 422 (checklist ↔ server
    // parity). No fixHref — the block is by design, not a missing field.
    if (spende.spendeKind === "aufwandsspende") {
      rows.push({
        ok: false,
        label: "Zuwendungsart bescheinigbar",
        sub: "Aufwandsspenden werden erst in einer späteren Ausbaustufe bescheinigt.",
      });
    }
    const hasAnschrift =
      !!preview.spenderName?.trim() && !!preview.spenderAdresse?.trim();
    rows.push({
      ok: hasAnschrift,
      label: "Name & Anschrift der spendenden Person",
      sub: hasAnschrift
        ? preview.spenderName
        : "Anschrift fehlt in der Spende — ohne sie keine Bescheinigung.",
      fixHref: hasAnschrift ? undefined : spendeHref,
      fixLabel: "Spende bearbeiten",
    });
    // Server requires zugewendetAm (Tag der Zuwendung) — a NULL date is a 422.
    const hasDatum = !!spende.zugewendetAm;
    rows.push({
      ok: hasDatum,
      label: "Tag der Zuwendung",
      sub: hasDatum
        ? formatGermanDate(spende.zugewendetAm ?? "")
        : "Zuwendungsdatum fehlt in der Spende.",
      fixHref: hasDatum ? undefined : spendeHref,
      fixLabel: "Spende bearbeiten",
    });
    const hasBetrag =
      preview.betragCents > 0 && !!preview.betragInWorten?.trim();
    rows.push({
      ok: hasBetrag,
      label: "Betrag in Ziffern und Worten",
      sub: `${formatCentsAsEuro(BigInt(preview.betragCents))} · ${preview.betragInWorten}`,
    });
    rows.push({
      ok: enabled,
      label: bescheidLabel,
      sub: enabled
        ? `${preview.vereinFinanzamt} · ${formatGermanDate(preview.bescheidDatum)}${preview.freistellungsbescheidVz ? ` · VZ ${preview.freistellungsbescheidVz}` : ""}`
        : "Fehlt in den Vereins-Einstellungen — ohne ihn keine Bescheinigung.",
      fixHref: enabled ? undefined : "/app/einstellungen/verein",
      fixLabel: "Eintragen",
    });
    if (spende.spendeKind === "sachspende") {
      const hasBez = !!preview.sacheBeschreibung?.trim();
      rows.push({
        ok: hasBez,
        label: "Genaue Bezeichnung der Sachzuwendung",
        sub: hasBez
          ? (preview.sacheBeschreibung ?? "")
          : "Bezeichnung + Wertermittlung fehlen in der Spende.",
        fixHref: hasBez ? undefined : spendeHref,
        fixLabel: "Spende bearbeiten",
      });
    }
    rows.push({
      // Gate only on the value itself — the Bescheid row above owns the
      // config-present gate, so a missing Freistellungsbescheid must not also
      // paint an otherwise-present Zweck red.
      ok: !!preview.steuerbegueZwecke?.trim(),
      label: "Steuerbegünstigter Zweck",
      sub: preview.steuerbegueZwecke || "—",
    });
    return rows;
  }
</script>

<svelte:head>
  <title>Zuwendungsbestätigung – Spenden – {$page.data.vereinName}</title>
</svelte:head>

<PageShell width="list">
  <PageHeader
    heading="Zuwendungsbestätigung"
    description={`Spende ${spende.businessId} · ${spendeKindLabel}${preview?.spenderName ? ` · ${preview.spenderName}` : ""}`}
  >
    {#snippet actions()}
      <Button variant="outline" href={spendeHref}>
        <ArrowLeft class="size-4" aria-hidden="true" />Zur Spende
      </Button>
    {/snippet}
  </PageHeader>

  {#if issued && preview}
    <!-- ── Issued (gesperrt) ─────────────────────────────────────────────── -->
    <div
      class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.72fr)]"
    >
      <div class="order-2 min-w-0 lg:order-1">
        <BescheinigungDocument preview={docPreview!} />
      </div>
      <aside class="order-1 min-w-0 lg:order-2">
        <BescheinigungCard
          status={{
            tone: "ok",
            title: "Ausgestellt",
            sub: `am ${formatGermanDate(spende.bescheinigungAusgestelltAm ?? "")} · für Änderungen gesperrt`,
          }}
          idChip={{ value: spende.bescheinigungNr ?? "", issued: true }}
          callout={{
            tone: "ok",
            title: `Bescheinigung ${spende.bescheinigungNr} ausgestellt`,
            body: `Damit kann ${spenderDisplay} die Zuwendung absetzen — schön ordentlich. Das PDF liegt im Datei-Archiv.`,
          }}
        >
          {#snippet consequence()}
            <Lock class="size-4 text-ink-500" aria-hidden="true" />
            <span>Korrektur nur über <b>Storno + Neu-Ausstellung</b>.</span>
          {/snippet}
          {#snippet cta()}
            <div class="flex flex-col gap-2">
              <span
                class="text-xs text-ink-500"
                data-testid="bescheinigung-nr-display"
              >
                Ausgestellt: <strong class="text-ink-700"
                  >{spende.bescheinigungNr}</strong
                >
                am {formatGermanDate(spende.bescheinigungAusgestelltAm ?? "")}
              </span>
              <Button
                href={pdfHref}
                class="w-full"
                data-testid="download-bescheinigung-pdf"
              >
                <Download class="size-4" aria-hidden="true" />PDF herunterladen
              </Button>
            </div>
          {/snippet}
        </BescheinigungCard>
      </aside>
    </div>
  {:else if !enabled}
    <!-- ── Konfiguration fehlt (Klartext, no env-var names) ──────────────── -->
    <div class="mx-auto w-full max-w-lg">
      <BescheinigungCard
        status={{
          tone: "warn",
          title: "Ausstellen nicht möglich",
          sub: "Eine Pflichtangabe fehlt noch",
        }}
        callout={{
          tone: "warn",
          title: "Freistellungsbescheid fehlt in den Einstellungen",
          body: "Ohne Freistellungsbescheid oder § 60a-Feststellung darf keine Bescheinigung ausgestellt werden.",
        }}
        checklist={checklist.length ? checklist : undefined}
        data-testid="bescheinigung-disabled-banner"
      >
        {#snippet cta()}
          <div class="flex flex-col gap-2">
            <Button
              type="button"
              class="w-full"
              disabled
              data-testid="issue-bescheinigung-btn"
            >
              <FileCheck class="size-4" aria-hidden="true" />Bescheinigung
              ausstellen
            </Button>
            <Button
              variant="ghost"
              href="/app/einstellungen/verein"
              class="w-full"
            >
              Zu den Vereins-Einstellungen
            </Button>
          </div>
        {/snippet}
      </BescheinigungCard>
    </div>
  {:else if extractError}
    <!-- ── Extract error ────────────────────────────────────────────────── -->
    <div class="mx-auto w-full max-w-lg">
      <BescheinigungCard
        status={{
          tone: "warn",
          title: "Vorschau nicht erzeugbar",
          sub: "Ein Feld ließ sich nicht lesen",
        }}
        callout={{
          tone: "crit",
          title: "Eine Pflichtangabe der Spende ist unvollständig",
          body: `${extractError}. Ergänze die fehlende Angabe (Anschrift der spendenden Person oder Zuwendungsdatum) in der Spende, dann lässt sich die Vorschau erzeugen.`,
        }}
      >
        {#snippet cta()}
          <Button variant="outline" href={spendeHref} class="w-full">
            <ArrowLeft class="size-4" aria-hidden="true" />Spende bearbeiten
          </Button>
        {/snippet}
      </BescheinigungCard>
    </div>
  {:else}
    <!-- ── Ready / festgeschrieben (AUSSTELLBAR) ─────────────────────────── -->
    <!-- The ?/generate form, reused desktop-in-card + mobile-in-sticky-foot.
         Distinct button testids so a strict locator matches exactly one. -->
    {#snippet issueForm(btnTestid: string)}
      <form
        method="POST"
        action="?/generate"
        use:enhance={() => {
          submitting = true;
          return async ({ result, update }) => {
            submitting = false;
            await update();
            await invalidateAll();
            if (result.type === "success") {
              window.open(pdfHref, "_blank", "noopener");
            }
          };
        }}
      >
        <Button
          type="submit"
          class="w-full"
          disabled={submitting || !checklistComplete}
          data-testid={btnTestid}
        >
          {#if submitting}
            <Loader class="size-4 animate-spin" aria-hidden="true" />Wird
            ausgestellt …
          {:else}
            <FileCheck class="size-4" aria-hidden="true" />Bescheinigung
            ausstellen
          {/if}
        </Button>
      </form>
      {#if form?.action === "generate" && form?.error}
        <p
          class="mt-2 text-[13px] leading-snug text-[color:var(--sev-critical-text)]"
          role="alert"
          data-testid="bescheinigung-error"
        >
          {form.error}
        </p>
      {/if}
    {/snippet}

    <div
      class="grid grid-cols-1 gap-5 pb-28 md:grid-cols-1 md:pb-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.72fr)]"
    >
      <div class="order-2 min-w-0 lg:order-1">
        <BescheinigungDocument preview={docPreview!} />
      </div>
      <aside class="order-1 min-w-0 lg:order-2">
        <BescheinigungCard
          status={{
            tone: "neutral",
            title: festgeschrieben
              ? "Bereit — Jahr festgeschrieben"
              : "Noch nicht ausgestellt",
            sub: festgeschrieben
              ? "Ausstellen bleibt möglich"
              : "Nummer wird beim Ausstellen vergeben",
          }}
          idChip={{
            value: `B-${buchungsjahr}-###`,
            pending: true,
          }}
          callout={festgeschrieben
            ? {
                tone: "info",
                title: `Buchungsjahr ${buchungsjahr} ist festgeschrieben`,
                body: "Die Bescheinigung ändert keine Buchungswerte — nur die Bescheinigungs-Nummer wird vergeben. Ausstellen bleibt erlaubt.",
              }
            : undefined}
          {facts}
          {checklist}
          checklistEyebrow={checklistComplete
            ? "Pflichtangaben · vollständig"
            : "Pflichtangaben"}
          gobd
        >
          {#snippet consequence()}
            <Info class="size-4 text-ink-500" aria-hidden="true" />
            <span
              >Ausstellen vergibt die <b>endgültige Nummer</b> und sperrt die Spende
              für Änderungen. Danach ist nur noch der PDF-Download möglich.</span
            >
          {/snippet}
          {#snippet cta()}
            {#if festgeschrieben}
              <span
                class="sr-only"
                data-testid="bescheinigung-festgeschrieben-hint"
                >Buchungsjahr {buchungsjahr} ist festgeschrieben — die Bescheinigung
                ändert keine Buchungswerte.</span
              >
            {/if}
            <!-- Desktop CTA lives in the card; on mobile it moves to the
                 sticky action-foot below (so it clears the long checklist). -->
            <div class="hidden md:block">
              {@render issueForm("issue-bescheinigung-btn")}
            </div>
          {/snippet}
        </BescheinigungCard>
      </aside>
    </div>

    <!-- Mobile sticky action-foot: the CTA sits above the AdminShell tab-bar,
         safe-area padded, with the consequence one-liner (plate .action-foot). -->
    <div
      class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 flex flex-col gap-1.5 border-t border-hairline bg-background/95 px-4 py-3 backdrop-blur-sm md:hidden"
    >
      {@render issueForm("issue-bescheinigung-btn-mobile")}
      <p class="text-center text-[11px] leading-snug text-ink-500">
        Vergibt die endgültige Nummer und sperrt die Spende für Änderungen.
      </p>
    </div>
  {/if}
</PageShell>
