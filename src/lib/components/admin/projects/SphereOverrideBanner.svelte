<script lang="ts">
	type Sphere = "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";

	let { sphereDefault }: { sphereDefault: Sphere | null } = $props();

	const labels: Record<Sphere, string> = {
		ideeller: "Ideeller Bereich",
		vermoegen: "Vermögensverwaltung",
		zweckbetrieb: "Zweckbetrieb",
		wirtschaftlich: "Wirtschaftlicher Geschäftsbetrieb",
	};
</script>

{#if sphereDefault}
	<div
		role="note"
		data-component="sphere-override-banner"
		class="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
	>
		Dieses Projekt überschreibt die Standard-Sphäre der Kategorie und bucht alle Posten als
		<strong>{labels[sphereDefault]}</strong> (ADR-0008).
	</div>
{/if}
