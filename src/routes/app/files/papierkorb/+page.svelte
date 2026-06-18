<script lang="ts">
  import { enhance } from "$app/forms";

  let { data, form } = $props();
</script>

<svelte:head><title>Papierkorb · Dateien</title></svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
  <div class="mb-8">
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      href="/app/files"
      class="text-sm font-medium text-primary-text hover:underline">← Dateien</a
    >
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
    <h1 class="mt-2 text-2xl font-bold tracking-tight text-foreground">Papierkorb</h1>
    <p class="mt-0.5 text-sm text-muted-foreground">
      Gelöschte Dateien wiederherstellen
    </p>
  </div>

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
</div>
