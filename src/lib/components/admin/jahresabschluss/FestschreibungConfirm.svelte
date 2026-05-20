<script lang="ts">
	import { enhance } from '$app/forms';

	interface Props {
		year: number;
		closed: boolean;
		/** Pre-flight gate (C1). When false, the button is rendered disabled with
		 *  an explanation. Defaults to true to preserve legacy callers. */
		canFestschreiben?: boolean;
		blockerCount?: number;
	}

	let {
		year,
		closed,
		canFestschreiben = true,
		blockerCount = 0
	}: Props = $props();

	let showModal = $state(false);
	let submitting = $state(false);
</script>

<div class="rounded-xl border border-border bg-card shadow-sm">
	<div class="px-6 py-5">
		<h3 class="text-base font-semibold text-foreground">Jahresabschluss schließen</h3>
		<p class="mt-1 text-sm text-muted-foreground">
			Festschreibung: Alle Buchungen des Jahres {year} werden unveränderlich markiert.
			Korrekturen sind danach nur noch per Storno möglich.
		</p>
	</div>

	<div class="border-t border-border/50 px-6 py-4">
		{#if closed}
			<div
				class="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
					<polyline points="22 4 12 14.01 9 11.01" />
				</svg>
				Buchungsjahr {year} ist festgeschrieben. Keine weiteren Änderungen möglich.
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (showModal = true)}
				disabled={!canFestschreiben}
				data-testid="festschreibung-open-button"
				aria-describedby={canFestschreiben ? undefined : 'festschreibung-blocker-hint'}
				class="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
				Jahresabschluss schließen ({year})
			</button>
			{#if !canFestschreiben}
				<p
					id="festschreibung-blocker-hint"
					class="mt-2 text-xs text-rose-700 dark:text-rose-400"
				>
					{blockerCount} Blocker in der Checkliste oben. Bitte zuerst beheben.
				</p>
			{/if}
		{/if}
	</div>
</div>

<!-- Confirmation modal -->
{#if showModal}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="festschreibung-title"
	>
		<div class="w-full max-w-md rounded-xl bg-background shadow-xl">
			<div class="px-6 py-5">
				<h2 id="festschreibung-title" class="text-lg font-semibold text-foreground">
					Jahresabschluss {year} festschreiben?
				</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					Alle Buchungen des Jahres <strong>{year}</strong> werden als
					<strong>festgeschrieben</strong> markiert. Diese Aktion ist
					<strong>nicht rückgängig zu machen</strong>. Korrekturen sind danach nur noch per Storno
					(negative Gegenbuchung) möglich.
				</p>
				<div
					class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"
				>
					Stelle sicher, dass alle Belege geprüft und alle Auslagen erstattet wurden, bevor du
					fortfährst.
				</div>
			</div>

			<div class="flex justify-end gap-3 border-t border-border px-6 py-4">
				<button
					type="button"
					onclick={() => (showModal = false)}
					disabled={submitting}
					class="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
				>
					Abbrechen
				</button>

				<form
					method="POST"
					action="?/festschreiben"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
							showModal = false;
						};
					}}
				>
					<button
						type="submit"
						disabled={submitting}
						class="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
					>
						{#if submitting}
							<svg
								class="h-4 w-4 animate-spin"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								></path>
							</svg>
							Wird festgeschrieben…
						{:else}
							Ja, Jahresabschluss schließen
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
