<script lang="ts">
	// /app/transactions — legacy merged-list page (Phase 3, Task 10/11).
	//
	// The server `load` (+page.server.ts) ALWAYS `redirect(308)`s to
	// /app/ausgaben, so this component never renders on a GET. It is kept
	// body-less ONLY because SvelteKit requires a `+page.svelte` sibling for the
	// `+page.server.ts` that still hosts the bulk / SEPA / markAsPaid actions
	// (re-homed per tab in Phase 4+). Phase 8 retires the route entirely.
	//
	// No `data` props are read here — the old list referenced `data.rows` etc.,
	// which no longer exist now that `load` only redirects.
</script>

<svelte:head>
	<title>Transaktionen – Folge der Wolke</title>
</svelte:head>

<!-- Never shown: `load` 308-redirects to /app/ausgaben server-side, before any
     HTML is sent, so no fallback markup is needed (or reachable) here. -->
