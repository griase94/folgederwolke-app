<script lang="ts">
	/**
	 * GobdBlock — the quiet integrity reassurance in the detail rail: the booking
	 * is stored immutably and its SHA is anchored in the hash-chained audit_log
	 * (ADR-0004 / ADR-0012). Presentation-only; states a fact, never an action.
	 */
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import Check from "@lucide/svelte/icons/check";
</script>

<div
	class="flex items-start gap-3 rounded-2xl border border-hairline bg-secondary/50 p-4"
	data-slot="gobd-block"
>
	<span
		class="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-[color:var(--type-einnahme)]"
		aria-hidden="true"
	>
		<ShieldCheck class="size-[18px]" />
	</span>
	<div class="min-w-0 flex-1">
		<div class="text-[13px] font-semibold text-ink-900">GoBD-konform belegt</div>
		<p class="mt-0.5 text-xs leading-snug text-ink-500">
			Unveränderbar gespeichert · SHA im Audit-Log verankert.
		</p>
		<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-500">
			<span class="inline-flex items-center gap-1">
				<Check class="size-3 text-[color:var(--type-einnahme)]" aria-hidden="true" />
				geprüft
			</span>
			<span class="font-mono">sha256</span>
			<span class="inline-flex items-center gap-1">
				<Check class="size-3 text-[color:var(--type-einnahme)]" aria-hidden="true" />
				im Audit-Log
			</span>
		</div>
	</div>
</div>
