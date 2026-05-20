<script lang="ts">
  import { goto } from "$app/navigation";
  import { page as pageStore } from "$app/state";

  let { data } = $props();

  function onYearChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const url = new URL(pageStore.url);
    if (target.value) url.searchParams.set("year", target.value);
    else url.searchParams.delete("year");
    url.searchParams.delete("page");
    goto(url.toString(), { keepFocus: true });
  }

  function pageUrl(p: number): string {
    const params = new URLSearchParams();
    if (data.year) params.set("year", String(data.year));
    params.set("page", String(p));
    return `?${params.toString()}`;
  }
</script>

<svelte:head><title>Dateien</title></svelte:head>

<h1 class="mb-4 text-2xl font-bold">Dateien</h1>

<div class="mb-4 flex items-center gap-4">
  <label>
    Jahr:
    <select onchange={onYearChange} value={data.year ?? ""}>
      <option value="">Alle</option>
      {#each data.years as y (y)}
        <option value={y}>{y}</option>
      {/each}
    </select>
  </label>
  <a href="/app/files/papierkorb" class="text-sm underline">Papierkorb</a>
</div>

{#if data.rows.length === 0}
  <p class="text-muted-foreground">Keine Dateien.</p>
{:else}
  <ul class="space-y-2">
    {#each data.rows as row (row.id)}
      <li class="flex items-center gap-4 rounded border p-3">
        <img
          src={`/api/files/${row.id}/thumbnail`}
          alt=""
          class="h-12 w-12 rounded object-cover"
        />
        <div class="flex-1">
          <div class="font-medium">{row.original_filename}</div>
          <div class="text-muted-foreground text-sm">
            {row.owner_kind === "orphan"
              ? "Kein Owner"
              : `${row.owner_kind} ${row.owner_business_id ?? ""}`}
            · {new Date(row.uploaded_at).toLocaleDateString("de-DE")}
            · {Math.round(Number(row.byte_size) / 1024)} KB
          </div>
        </div>
        <div class="flex gap-2">
          <a
            href={`/api/files/${row.id}/blob`}
            target="_blank"
            rel="noopener"
            class="text-sm underline">Vorschau</a
          >
          <a
            href={`/api/files/${row.id}/blob`}
            download
            class="text-sm underline">Herunterladen</a
          >
          <form method="POST" action="?/softDelete" class="inline">
            <input type="hidden" name="fileId" value={row.id} />
            <button type="submit" class="text-sm text-red-600 underline"
              >Löschen</button
            >
          </form>
        </div>
      </li>
    {/each}
  </ul>

  <div class="mt-4 flex justify-between">
    {#if data.page > 0}
      <a href={pageUrl(data.page - 1)}>← Zurück</a>
    {:else}
      <span></span>
    {/if}
    {#if (data.page + 1) * data.pageSize < data.total}
      <a href={pageUrl(data.page + 1)}>Weiter →</a>
    {/if}
  </div>
{/if}
