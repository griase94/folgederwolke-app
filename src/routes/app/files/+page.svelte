<script lang="ts">
  import { goto } from "$app/navigation";
  import { enhance } from "$app/forms";
  import { page as pageStore } from "$app/state";
  import { SvelteURLSearchParams } from "svelte/reactivity";

  let { data, form } = $props();

  function onYearChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const url = new URL(pageStore.url);
    if (target.value) url.searchParams.set("year", target.value);
    else url.searchParams.delete("year");
    url.searchParams.delete("page");
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto(url.toString(), { keepFocus: true });
  }

  function pageUrl(p: number): string {
    const params = new SvelteURLSearchParams();
    if (data.year) params.set("year", String(data.year));
    params.set("page", String(p));
    return `?${params.toString()}`;
  }
</script>

<svelte:head><title>Dateien</title></svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
  <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-foreground">Dateien</h1>
      <p class="mt-0.5 text-sm text-muted-foreground">
        Hochgeladene Belege und Bescheinigungen
      </p>
    </div>
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      href="/app/files/papierkorb"
      class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Papierkorb →
    </a>
  </div>

  {#if form?.error}
    <p
      class="mb-4 rounded-lg bg-severity-critical/10 px-3 py-2 text-sm text-severity-critical-text"
      role="alert"
    >
      {form.error}
    </p>
  {/if}

  <div class="mb-6 flex items-center gap-2">
    <label for="year-filter" class="text-sm font-medium text-muted-foreground">Jahr</label>
    <select
      id="year-filter"
      onchange={onYearChange}
      value={data.year ?? ""}
      class="min-h-9 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">Alle</option>
      {#each data.years as y (y)}
        <option value={y}>{y}</option>
      {/each}
    </select>
  </div>

  {#if data.rows.length === 0}
    <div class="rounded-xl border border-border bg-card p-10 text-center">
      <p class="text-sm text-muted-foreground">Keine Dateien.</p>
    </div>
  {:else}
    <ul class="space-y-2">
      {#each data.rows as row (row.id)}
        {@const blobHref = `/api/files/${row.id}/blob`}
        <li
          class="flex items-center gap-4 rounded-xl border border-border bg-card p-3 shadow-sm"
        >
          <img
            src={`/api/files/${row.id}/thumbnail`}
            alt=""
            class="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium text-foreground">{row.original_filename}</div>
            <div class="text-sm text-muted-foreground">
              {row.owner_kind === "orphan"
                ? "Kein Owner"
                : `${row.owner_kind} ${row.owner_business_id ?? ""}`}
              · {new Date(row.uploaded_at).toLocaleDateString("de-DE")}
              · {Math.round(Number(row.byte_size) / 1024)} KB
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-3 text-sm">
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a
              href={blobHref}
              target="_blank"
              rel="noopener"
              class="font-medium text-primary-text hover:underline">Vorschau</a
            >
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a
              href={blobHref}
              download
              class="font-medium text-primary-text hover:underline">Herunterladen</a
            >
            <form method="POST" action="?/softDelete" class="inline" use:enhance>
              <input type="hidden" name="fileId" value={row.id} />
              <button
                type="submit"
                class="font-medium text-severity-critical-text hover:underline"
                >Löschen</button
              >
            </form>
          </div>
        </li>
      {/each}
    </ul>

    <div class="mt-6 flex items-center justify-between text-sm">
      {#if data.page > 0}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a
          href={pageUrl(data.page - 1)}
          class="font-medium text-primary-text hover:underline">← Zurück</a
        >
      {:else}
        <span></span>
      {/if}
      {#if (data.page + 1) * data.pageSize < data.total}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a
          href={pageUrl(data.page + 1)}
          class="font-medium text-primary-text hover:underline">Weiter →</a
        >
      {/if}
    </div>
  {/if}
</div>
