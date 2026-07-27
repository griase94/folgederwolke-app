<!--
	FestschreibungModal — the confirm dialog for the irreversible year-close
	(D-Flow §2.7, replaces FestschreibungConfirm). Title + „Was passiert"-facts +
	the remaining non-blocking warnings (calm, never amber-alarm on the year
	itself) + a friction ConfirmCheck (tone=complete) — the CTA stays a neutral,
	disabled button until it is checked, then the page turns it into the primary
	„Jahr N festschreiben".

	Presentational: `open` + `confirmed` are bindable; the page owns the
	?/festschreiben form (cta snippet) and gates its submit on `confirmed`. The
	close button lives ONLY at the Hub (D1a) — this dialog is opened from there.
-->
<script lang="ts" module>
  import type { Snippet } from "svelte";
  import {
    FactsTable,
    type FactRow,
  } from "$lib/components/ui/facts-table/index.js";
  import ConfirmCheck from "$lib/components/ui/confirm-check/ConfirmCheck.svelte";
  import Lock from "@lucide/svelte/icons/lock";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import X from "@lucide/svelte/icons/x";

  export interface FestschreibungModalProps {
    open?: boolean;
    /** Bindable — the friction checkbox state; the page gates its CTA on it. */
    confirmed?: boolean;
    year: number;
    /** The „Was passiert" facts (Buchungen sealed, sums …). */
    facts: FactRow[];
    /** Sober one-liner under the facts (e.g. the versiegelt/Jahressperre breakdown). */
    footnote?: string;
    /** Remaining non-blocking warnings (e.g. offene Spenden-Bescheinigungen). */
    warnings?: string[];
    /** The friction confirmation copy. */
    confirmLabel?: string;
    /** The page-owned ?/festschreiben form + submit (gated on `confirmed`). */
    cta?: Snippet;
    onClose?: () => void;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    open = $bindable(false),
    confirmed = $bindable(false),
    year,
    facts,
    footnote,
    warnings = [],
    confirmLabel = "Ich habe verstanden, dass dieses Jahr danach unveränderbar ist.",
    cta,
    onClose,
    "data-testid": testId = "festschreibung-modal",
  }: FestschreibungModalProps = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let restoreFocusTo: HTMLElement | null = null;

  function close() {
    open = false;
    confirmed = false;
    restoreFocusTo?.focus?.();
    restoreFocusTo = null;
    onClose?.();
  }

  // On open: remember the trigger, move focus INTO the dialog (a11y initial
  // focus). The dialog is tabindex=-1 so it can receive programmatic focus.
  $effect(() => {
    if (open && dialogEl) {
      restoreFocusTo = document.activeElement as HTMLElement | null;
      const el = dialogEl;
      queueMicrotask(() => el.focus());
    }
  });

  function focusables(): HTMLElement[] {
    if (!dialogEl) return [];
    return Array.from(
      dialogEl.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    // Focus-trap: keep Tab cycling inside the dialog.
    const f = focusables();
    if (f.length === 0) {
      e.preventDefault();
      dialogEl?.focus();
      return;
    }
    const first = f[0]!;
    const last = f[f.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogEl)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
    onkeydown={onKeydown}
  >
    <div
      bind:this={dialogEl}
      tabindex="-1"
      class="flex w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl border border-hairline bg-card shadow-card outline-none sm:rounded-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fs-modal-title"
      data-testid={testId}
    >
      <header
        class="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4"
      >
        <div>
          <h2 id="fs-modal-title" class="text-base font-bold text-ink-900">
            Buchungsjahr {year} festschreiben?
          </h2>
          <p class="mt-0.5 text-[12.5px] text-ink-500">
            Unumkehrbar · GoBD § 146
          </p>
        </div>
        <button
          type="button"
          class="grid size-8 shrink-0 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-muted"
          aria-label="Abbrechen"
          onclick={close}
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </header>

      <div class="flex flex-col gap-4 px-5 py-4">
        <div>
          <div
            class="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500"
          >
            Was passiert
          </div>
          <FactsTable rows={facts} labelWidth="150px" />
          {#if footnote}
            <p
              class="mt-2 text-[11.5px] leading-relaxed text-ink-500"
              data-testid="fs-modal-footnote"
            >
              {footnote}
            </p>
          {/if}
        </div>

        {#each warnings as w (w)}
          <div
            class="flex items-start gap-2.5 rounded-lg border border-[color:var(--sev-warn)]/35 bg-[color:var(--sev-warn)]/10 px-3 py-2.5 text-[13px] text-ink-700"
          >
            <TriangleAlert
              class="mt-0.5 size-4 shrink-0 text-[color:var(--sev-warn-text)]"
              aria-hidden="true"
            />
            <span>{w}</span>
          </div>
        {/each}

        <ConfirmCheck bind:checked={confirmed} tone="complete">
          {confirmLabel}
        </ConfirmCheck>
      </div>

      <footer
        class="flex flex-col-reverse gap-2 border-t border-hairline px-5 py-4 sm:flex-row"
      >
        <button
          type="button"
          class="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold text-ink-700 transition-colors hover:bg-muted"
          onclick={close}
        >
          Abbrechen
        </button>
        {#if cta}
          <div class="flex flex-1 flex-col">{@render cta()}</div>
        {:else}
          <button
            type="button"
            class="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[color:var(--type-einnahme)] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-500"
            disabled={!confirmed}
          >
            <Lock class="size-4" aria-hidden="true" />{year} festschreiben
          </button>
        {/if}
      </footer>
    </div>
  </div>
{/if}
