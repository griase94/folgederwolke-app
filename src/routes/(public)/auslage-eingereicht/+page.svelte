<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { setPreferredAuslage } from '$lib/client/pwa-entry.js';

  const ausId = $page.url.searchParams.get('id') ?? '';

  onMount(async () => {
    // A completed submission is the strongest "this device files expenses"
    // signal — make the Auslage form this device's sticky launch entry so a
    // returning external lands straight on it. Harmless for authed devices:
    // the launch router ignores the preference once hasAuthedBefore is set.
    setPreferredAuslage();

    // Clear the IndexedDB draft now that submission succeeded.
    // Dynamic import because clearDraft uses IndexedDB (browser-only).
    const { clearDraft } = await import('$lib/client/drafts.js');
    await clearDraft();
  });
</script>

<svelte:head>
  <title>Auslage eingereicht – {$page.data.vereinName}</title>
</svelte:head>

<main class="container mx-auto max-w-2xl px-6 py-16">
  <div class="mb-8 flex items-center gap-3">
    <span class="text-4xl" aria-hidden="true">✓</span>
    <h1 class="text-foreground text-3xl font-bold tracking-tight">Vielen Dank!</h1>
  </div>

  <p class="text-muted-foreground mb-6 text-lg">
    Deine Auslage wurde erfolgreich eingereicht. Wir haben sie unter der folgenden Kennung
    gespeichert:
  </p>

  {#if ausId}
    <div class="bg-muted mb-8 rounded-lg px-6 py-4">
      <p class="text-muted-foreground mb-1 text-sm font-medium uppercase tracking-wide">
        Deine Einreichungs-ID
      </p>
      <p class="font-mono text-2xl font-bold">{ausId}</p>
    </div>

    <p class="text-muted-foreground mb-6">
      Du kannst den Status deiner Einreichung jederzeit hier einsehen:
    </p>

    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <div class="flex flex-wrap gap-3">
      <a
        href="/auslage-status/{ausId}"
        class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors"
      >
        Status verfolgen →
      </a>
      <a
        href="/auslage-einreichen"
        class="border-border hover:bg-muted inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium transition-colors"
      >
        Neue Auslage einreichen
      </a>
    </div>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {:else}
    <p class="text-muted-foreground mb-6">
      Deine Einreichung wurde gespeichert. Falls du eine Bestätigungs-E-Mail erwartest, prüfe
      bitte deinen Posteingang.
    </p>

    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      href="/auslage-einreichen"
      class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors"
    >
      Neue Auslage einreichen
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {/if}

  <div class="mt-12 border-t pt-8">
    <p class="text-muted-foreground text-sm">
      Bei Fragen wende dich an den Vorstand von {$page.data.vereinName}. Bitte halte deine
      Einreichungs-ID bereit.
    </p>
  </div>
</main>
