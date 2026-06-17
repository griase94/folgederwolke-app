<script lang="ts">
	// Auslage bridge (Aurora spec §6, outcome-first wording — binding, no
	// insider vocabulary like "Externe"). This is the non-member's exit from
	// the login page: anti-enumeration means they see "Link gesendet" for a
	// mail that never comes, so this card must persist below the panel.
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href="/auslage-einreichen"
	data-testid="auslage-bridge-card"
	class="block rounded-2xl border border-[var(--hairline)] bg-card p-5 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
>
	<h2 class="text-base font-semibold tracking-tight text-ink-900">Geld ausgelegt?</h2>
	<p class="mt-1 text-sm leading-relaxed text-ink-500">Du hast etwas für den Verein bezahlt? Beleg hochladen und Erstattung bekommen — ohne Anmeldung. →</p>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
