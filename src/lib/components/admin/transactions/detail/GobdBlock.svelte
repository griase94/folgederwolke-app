<script lang="ts">
	/**
	 * GobdBlock — the quiet integrity reassurance in the detail rail: the booking
	 * is stored immutably and its SHA is anchored in the hash-chained audit_log
	 * (ADR-0004 / ADR-0012). Presentation-only; states a fact, never an action.
	 *
	 * `documented` = a Beleg is attached. Only then do we claim „GoBD-konform
	 * belegt" + „geprüft" — for a beleg-less row that would be a false conformity
	 * claim, so we drop to the honest immutability statement (which is always
	 * true: the row IS in the hash chain regardless of a receipt).
	 */
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import Check from "@lucide/svelte/icons/check";

	let { documented = true }: { documented?: boolean } = $props();
</script>

<div
	class="flex items-start gap-3 rounded-2xl border border-hairline bg-secondary/50 p-4"
	data-slot="gobd-block"
	data-documented={documented ? "true" : "false"}
>
	<span
		class="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-[color:var(--type-einnahme)]"
		aria-hidden="true"
	>
		<ShieldCheck class="size-[18px]" />
	</span>
	<div class="min-w-0 flex-1">
		<div class="text-[13px] font-semibold text-ink-900">
			{documented ? "GoBD-konform belegt" : "Unveränderbar gespeichert"}
		</div>
		<p class="mt-0.5 text-xs leading-snug text-ink-500">
			{#if documented}
				Unveränderbar gespeichert · SHA im Audit-Log verankert.
			{:else}
				SHA im Audit-Log verankert · ohne Beleg erfasst.
			{/if}
		</p>
		<div
			class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-500"
		>
			{#if documented}
				<span class="inline-flex items-center gap-1">
					<Check
						class="size-3 text-[color:var(--type-einnahme)]"
						aria-hidden="true"
					/>
					geprüft
				</span>
			{/if}
			<span class="font-mono">sha256</span>
			<span class="inline-flex items-center gap-1">
				<Check
					class="size-3 text-[color:var(--type-einnahme)]"
					aria-hidden="true"
				/>
				im Audit-Log
			</span>
		</div>
	</div>
</div>
