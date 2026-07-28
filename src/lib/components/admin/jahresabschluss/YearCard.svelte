<!--
	YearCard — the Jahresabschluss-Hub year status card (D-Flow §2.1), ONE
	vocabulary for three states:
	  · ready   — the abschlussbereite Hero card: status-green left accent,
	              Mini-EÜR + optional §64-safe line + pre-flight checklist +
	              foot (consequence + the page's wide close CTA).
	  · running — the current year: neutral statechip + substats row
	              (Saldo · Einnahmen · Ausgaben · Buchungen) + note.
	  · locked  — the compact festgeschriebene-Jahre row (year · lock+meta ·
	              Überschuss on the ruler · actions).
	Money is strictly typ-coloured (Ausgabe plum · Einnahme grün · Spende
	violett); pink never on a number (ANDY-LENS §4). The one loud CTA is the
	close button in the foot; everything else stays calm. Presentational — the
	page owns the ?/festschreiben form (cta snippet) + locked/running actions.
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import type { Snippet } from "svelte";
  import { formatCentsAsEuro } from "$lib/domain/money.js";
  import Lock from "@lucide/svelte/icons/lock";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import PreFlightList from "./PreFlightList.svelte";

  export type YearCardState = "ready" | "running" | "locked";
  export type PreFlightStatus = "pass" | "warn" | "block";

  export interface YearCardPreFlightItem {
    id: string;
    label: string;
    status: PreFlightStatus;
    detail: string;
    fixHref?: string;
  }

  export interface YearCardProps {
    year: number;
    state: YearCardState;
    einnahmenCents: number;
    ausgabenCents: number;
    ueberschussCents: number;
    buchungszahl: number;
    /** ready: the pre-flight checklist. */
    preFlightItems?: YearCardPreFlightItem[];
    /** ready: collapse passed pre-flight items behind a disclosure (Hub). */
    collapsePreFlight?: boolean;
    /** ready: pre-flight blockers remain → „Prüfung nötig" chip, not „Abschlussbereit". */
    blocked?: boolean;
    /** ready: optional §64 "sicherer Bereich" line (WGB). */
    safeLine?: string;
    /** running: a quiet note. */
    note?: string;
    /** locked: meta line (e.g. "festgeschrieben am …"). */
    lockedMeta?: string;
    /** ready: consequence microcopy above the CTA. */
    consequence?: Snippet;
    /** ready: the page's wide close CTA (?/festschreiben form). */
    cta?: Snippet;
    /** locked/running: right-aligned actions (ZIP download, öffnen …). */
    actions?: Snippet;
    class?: string;
    "data-testid"?: string;
  }

  const eur = (c: number) => formatCentsAsEuro(BigInt(Math.round(c)));
</script>

<script lang="ts">
  let {
    year,
    state,
    einnahmenCents,
    ausgabenCents,
    ueberschussCents,
    buchungszahl,
    preFlightItems,
    collapsePreFlight = false,
    blocked = false,
    safeLine,
    note,
    lockedMeta,
    consequence,
    cta,
    actions,
    class: className,
    "data-testid": testId = "year-card",
  }: YearCardProps = $props();

  const saldoClass = $derived(ueberschussCents >= 0 ? "ein" : "aus");
</script>

{#if state === "locked"}
  <div
    class={cn("yc-locked", className)}
    data-testid={testId}
    data-slot="year-card"
    data-state="locked"
  >
    <span class="yl-year">{year}</span>
    <span class="yl-meta">
      <Lock class="size-3.5" aria-hidden="true" />
      <span>{lockedMeta ?? "festgeschrieben"}</span>
    </span>
    <span class="yl-amt">{eur(ueberschussCents)}</span>
    <span class="yl-actions">{@render actions?.()}</span>
  </div>
{:else}
  <div
    class={cn("ycard", className)}
    class:is-ready={state === "ready"}
    data-testid={testId}
    data-slot="year-card"
    data-state={state}
  >
    <div class="yc-head">
      <span class="yc-year">{year}</span>
      {#if state === "ready" && blocked}
        <!-- Ready by date, but pre-flight blockers remain → not „Abschlussbereit". -->
        <span class="statechip is-blocked">
          <CircleAlert class="size-3.5" aria-hidden="true" />Prüfung nötig
        </span>
      {:else if state === "ready"}
        <span class="statechip is-ready">
          <ShieldCheck class="size-3.5" aria-hidden="true" />Abschlussbereit
        </span>
      {:else}
        <span class="statechip">läuft</span>
      {/if}
    </div>

    {#if state === "ready"}
      <div class="yc-eur">
        <div class="yc-line">
          <span class="lbl">Einnahmen</span>
          <span class="amt ein">{eur(einnahmenCents)}</span>
        </div>
        <div class="yc-line">
          <span class="lbl">Ausgaben</span>
          <span class="amt aus">−{eur(ausgabenCents)}</span>
        </div>
        <div class="yc-line yc-total">
          <span class="lbl">Überschuss</span>
          <span class="amt {saldoClass}" data-testid="yc-ueberschuss"
            >{eur(ueberschussCents)}</span
          >
        </div>
      </div>

      {#if safeLine}
        <div class="yc-safe">
          <ShieldCheck class="ic" aria-hidden="true" />
          <span>{safeLine}</span>
        </div>
      {/if}

      {#if preFlightItems && preFlightItems.length > 0}
        <div class="yc-checkhead">Prüfpunkte</div>
        <PreFlightList items={preFlightItems} collapsePassed={collapsePreFlight} />
      {/if}

      {#if consequence || cta}
        <div class="yc-foot">
          {#if consequence}
            <div class="yc-consequence">
              <span class="yc-ctile">
                <Lock class="ic" aria-hidden="true" />
              </span>
              <div class="yc-ctxt">{@render consequence()}</div>
            </div>
          {/if}
          {@render cta?.()}
        </div>
      {/if}
    {:else}
      <!-- running -->
      <div class="yc-substats">
        <div class="yc-stat">
          <span class="ys-lbl">Saldo</span>
          <span class="ys-val {saldoClass}">{eur(ueberschussCents)}</span>
        </div>
        <div class="yc-stat">
          <span class="ys-lbl">Einnahmen</span>
          <span class="ys-val ein">{eur(einnahmenCents)}</span>
        </div>
        <div class="yc-stat">
          <span class="ys-lbl">Ausgaben</span>
          <span class="ys-val aus">{eur(ausgabenCents)}</span>
        </div>
        <div class="yc-stat">
          <span class="ys-lbl">Buchungen</span>
          <span class="ys-val">{buchungszahl}</span>
        </div>
      </div>
      {#if note}<p class="yc-note">{note}</p>{/if}
      {#if actions}<div class="yc-runfoot">{@render actions()}</div>{/if}
    {/if}
  </div>
{/if}

<style>
  .ycard {
    position: relative;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow-card);
    padding: 20px 22px;
  }
  .ycard.is-ready {
    border-color: color-mix(in srgb, var(--type-einnahme) 26%, var(--border));
  }
  .ycard.is-ready::before {
    content: "";
    position: absolute;
    left: 0;
    top: 14px;
    bottom: 14px;
    width: 4px;
    border-radius: 999px;
    background: var(--type-einnahme);
  }
  .yc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .yc-year {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--ink-900);
  }
  .statechip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--secondary);
    border: 1px solid var(--border);
    color: var(--ink-500);
    font-size: 11.5px;
    font-weight: 600;
  }
  .statechip.is-ready {
    background: var(--type-einnahme-tint);
    border-color: color-mix(in srgb, var(--type-einnahme) 30%, transparent);
    color: var(--type-einnahme);
  }
  .statechip.is-blocked {
    background: color-mix(in srgb, var(--sev-warn) 12%, transparent);
    border-color: color-mix(in srgb, var(--sev-warn) 32%, transparent);
    color: var(--sev-warn-text);
  }
  /* Mini-EÜR */
  .yc-eur {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--hairline);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .yc-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }
  .yc-line .lbl {
    color: var(--ink-700);
  }
  .yc-line .amt {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .yc-total {
    margin-top: 5px;
    padding-top: 9px;
    border-top: 1px solid var(--border);
  }
  .yc-total .lbl {
    font-weight: 700;
    color: var(--ink-900);
  }
  .yc-total .amt {
    font-size: 16px;
    font-weight: 800;
  }
  .amt.ein,
  .ys-val.ein {
    color: var(--type-einnahme);
  }
  .amt.aus,
  .ys-val.aus {
    color: var(--type-ausgabe);
  }
  /* §64 safe line */
  .yc-safe {
    margin-top: 12px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--sev-info) 10%, transparent);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-700);
  }
  .yc-safe :global(.ic) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--sev-info);
  }
  /* Substats (running) */
  .yc-substats {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--hairline);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 0;
  }
  .yc-stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0 16px;
    border-left: 1px solid var(--hairline);
  }
  .yc-stat:first-child {
    padding-left: 0;
    border-left: 0;
  }
  .ys-lbl {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-500);
  }
  .ys-val {
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink-900);
    letter-spacing: -0.01em;
  }
  .yc-note {
    margin: 12px 0 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-500);
  }
  .yc-runfoot {
    margin-top: 14px;
  }
  /* Pre-flight head (the list itself is the shared PreFlightList component) */
  .yc-checkhead {
    margin-top: 16px;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-500);
  }
  /* Foot */
  .yc-foot {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .yc-consequence {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 11px 13px;
    border-radius: 10px;
    background: var(--secondary);
  }
  .yc-ctile {
    width: 30px;
    height: 30px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--ink-500);
  }
  .yc-ctile :global(.ic) {
    width: 16px;
    height: 16px;
  }
  .yc-ctxt {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-700);
  }
  .yc-ctxt :global(b) {
    color: var(--ink-900);
    font-weight: 700;
  }
  /* Locked compact row */
  .yc-locked {
    display: grid;
    grid-template-columns: 58px 1fr 116px auto;
    align-items: center;
    gap: 14px;
    padding: 13px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
  }
  .yl-year {
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink-900);
  }
  .yl-meta {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink-500);
  }
  .yl-meta :global(svg) {
    flex: none;
    color: var(--ink-500);
  }
  .yl-meta span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .yl-amt {
    text-align: right;
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--type-einnahme);
  }

  /* Mobile: the running-card substats become a compact 2×2 grid with NO
     border-left dividers — the flex-wrap row otherwise dropped a stray divider
     onto the wrapped line (m12) and made the „läuft"-Karte tall enough to push
     the ready CTA below the fold (m9). */
  @media (max-width: 640px) {
    .yc-substats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
      flex-wrap: initial;
    }
    .yc-stat {
      padding: 0;
      border-left: 0;
    }
    .ys-val {
      font-size: 14px;
    }
  }
</style>
