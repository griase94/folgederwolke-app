<script lang="ts">
  /**
   * DetailErrorCard — the friendly error boundary for a transaction detail route
   * (Minor 10). A mistyped / stale id throws error(404, „… nicht gefunden") in
   * load(); the closest [id]/+error.svelte renders this instead of the generic
   * app-level 404. A quiet card, the server's own message as the heading, and a
   * „Zurück zur Liste" primary that lands on the right list (never the dashboard).
   */
  import { page } from "$app/state";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import FileQuestion from "@lucide/svelte/icons/file-question";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  let {
    listHref,
    listLabel,
  }: { listHref: string; listLabel: string } = $props();

  const notFound = $derived(page.status === 404);
  const heading = $derived(
    notFound
      ? (page.error?.message ?? "Buchung nicht gefunden")
      : "Ein Fehler ist aufgetreten",
  );
</script>

<div class="mx-auto w-full max-w-[560px] px-4 py-16">
  <div
    class="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card"
    data-slot="detail-error-card"
    data-status={page.status}
  >
    <div class="h-[3px] bg-gradient-brand" aria-hidden="true"></div>
    <div class="flex flex-col items-center px-6 py-10 text-center">
      <span
        class="mb-4 grid size-14 place-items-center rounded-2xl bg-secondary text-ink-500"
        aria-hidden="true"
      >
        {#if notFound}
          <FileQuestion class="size-7" />
        {:else}
          <TriangleAlert class="size-7 text-[color:var(--sev-critical-text)]" />
        {/if}
      </span>
      <h1 class="text-[19px] font-bold tracking-[-0.01em] text-ink-900">
        {heading}
      </h1>
      <p class="mt-2 max-w-[38ch] text-sm leading-snug text-ink-500">
        {#if notFound}
          Diese Buchung gibt es nicht (mehr) — vielleicht wurde sie gelöscht oder
          der Link ist veraltet.
        {:else}
          Beim Laden ist etwas schiefgelaufen. Bitte versuch es später noch einmal.
        {/if}
      </p>
      <!-- eslint-disable svelte/no-navigation-without-resolve -- static same-origin list route -->
      <a
        href={listHref}
        class="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary-strong px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong/90"
        data-slot="detail-error-back"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />Zurück zu {listLabel}
      </a>
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    </div>
  </div>
</div>
