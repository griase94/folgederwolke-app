<script lang="ts">
	import SpendeRow from './SpendeRow.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Spende = {
		id: string;
		businessId: string;
		gebuchtAm: string;
		zugewendetAm: string | null;
		betragCents: number;
		currency: string;
		spendeKind: 'geldspende' | 'sachspende' | 'aufwandsspende';
		spenderName: string | null;
		spenderAdresse: string | null;
		spenderEmail: string | null;
		memberId: string | null;
		bescheinigungNr: string | null;
		bescheinigungAusgestelltAm: string | null;
		bescheidTyp: 'geldspende' | 'sachspende' | 'aufwandsspende' | 'sammelbestaetigung' | null;
		// P1-T10/T12: donations.kategorie_id is now NOT NULL, so the load infers a
		// non-null string. The OLD /app/transactions/spenden route (retired in
		// Phase 6) carried a stale nullable type — narrow it so the onEdit
		// callback stays assignable. Minimal change; route is otherwise untouched.
		kategorieId: string;
		kategorieNameSnapshot: string;
		sphereSnapshot: 'ideeller' | 'vermoegen' | 'zweckbetrieb' | 'wirtschaftlich';
		festgeschriebenAt: string | null;
		zweckbindungKind: 'zweckfrei' | 'zweckgebunden';
		zweckbindungText: string | null;
		projectId: string | null;
		yearOfBuchung: number | null;
	};

	let {
		spenden,
		bescheinigungEnabled,
		onEdit,
		onAdd
	}: {
		spenden: Spende[];
		bescheinigungEnabled: boolean;
		onEdit: (s: Spende) => void;
		/** Optional CTA — when provided the empty state renders an "erfassen" button. */
		onAdd?: () => void;
	} = $props();
</script>

{#if spenden.length === 0}
	<div
		class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center"
		data-testid="spenden-empty-state"
	>
		<svg
			class="h-12 w-12 text-muted-foreground/50"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="1"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 8v8m-4-4h8m9-4a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
		<div>
			<p class="font-medium text-foreground">Noch keine Spenden erfasst</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Erfasse die erste Spende, um loszulegen.
			</p>
		</div>
		{#if onAdd}
			<Button onclick={onAdd}>Spende erfassen</Button>
		{/if}
	</div>
{:else}
	<div class="space-y-2" role="list" aria-label="Spendenliste" data-testid="spenden-list">
		{#each spenden as spende (spende.id)}
			<div role="listitem">
				<SpendeRow {spende} {bescheinigungEnabled} {onEdit} />
			</div>
		{/each}
	</div>
{/if}
