<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Papierkorb · Dateien</title></svelte:head>
<a href="/app/files" class="text-sm underline">← Dateien</a>
<h1 class="mb-4 mt-2 text-2xl font-bold">Papierkorb</h1>

{#if form?.error}
  <div class="mb-4 rounded border border-red-300 bg-red-100 p-3">
    {form.error}
  </div>
{/if}

{#if data.rows.length === 0}
  <p class="text-muted-foreground">Papierkorb ist leer.</p>
{:else}
  <ul class="space-y-2">
    {#each data.rows as row (row.id)}
      <li class="flex items-center gap-4 rounded border p-3">
        <div class="flex-1">
          <div class="font-medium">{row.original_filename}</div>
          <div class="text-muted-foreground text-sm">
            Gelöscht am {new Date(row.deleted_at).toLocaleDateString("de-DE")} ·
            Grund: {row.delete_reason ?? "—"}
          </div>
        </div>
        <form method="POST" action="?/restore" class="inline">
          <input type="hidden" name="fileId" value={row.id} />
          <button type="submit" class="text-sm text-blue-600 underline"
            >Wiederherstellen</button
          >
        </form>
      </li>
    {/each}
  </ul>
{/if}
