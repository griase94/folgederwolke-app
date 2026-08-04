<script lang="ts">
  import { enhance } from "$app/forms";
  import PageShell from "$lib/components/layout/PageShell.svelte";
  import PageHeader from "$lib/components/layout/PageHeader.svelte";

  let { data, form } = $props();
</script>

<svelte:head><title>Papierkorb · Dateien</title></svelte:head>

<PageShell width="list">
  <PageHeader title="Papierkorb" backHref="/app/files" backLabel="Dateien">
    {#snippet meta()}
      <p>Gelöschte Dateien wiederherstellen</p>
    {/snippet}
  </PageHeader>

  {#if form?.error}
    <p
      class="mb-4 rounded-lg bg-severity-critical/10 px-3 py-2 text-sm text-severity-critical-text"
      role="alert"
    >
      {form.error}
    </p>
  {/if}

  {#if data.rows.length === 0}
    <div class="rounded-xl border border-border bg-card p-10 text-center">
      <p class="text-sm text-muted-foreground">Papierkorb ist leer.</p>
    </div>
  {:else}
    <ul class="space-y-2">
      {#each data.rows as row (row.id)}
        <li
          class="flex items-center gap-4 rounded-xl border border-border bg-card p-3 shadow-sm"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium text-foreground">{row.original_filename}</div>
            <div class="text-sm text-muted-foreground">
              Gelöscht am {new Date(row.deleted_at).toLocaleDateString("de-DE")} ·
              Grund: {row.delete_reason ?? "—"}
            </div>
          </div>
          <form method="POST" action="?/restore" class="inline" use:enhance>
            <input type="hidden" name="fileId" value={row.id} />
            <button
              type="submit"
              class="shrink-0 text-sm font-medium text-primary-text hover:underline"
              >Wiederherstellen</button
            >
          </form>
        </li>
      {/each}
    </ul>
  {/if}
</PageShell>
