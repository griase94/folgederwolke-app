<script lang="ts">
	/**
	 * Aktivität card (spec §7): rows from buildActivityLabel() upstream,
	 * relative time right-aligned. Desktop fixed cap 8 + bottom fade +
	 * "Alle Aktivitäten →" (in-place expander); mobile cap 6. No inner scroll.
	 */
	let {
		entries
	}: {
		entries: { id: string; occurredAt: Date; label: string }[];
	} = $props();

	let expanded = $state(false);
	const MOBILE_CAP = 6;
	const DESKTOP_CAP = 8;

	const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
	function relTime(d: Date): string {
		const mins = Math.round((d.getTime() - Date.now()) / 60_000);
		if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
		const hours = Math.round(mins / 60);
		if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
		const days = Math.round(hours / 24);
		if (Math.abs(days) < 7) return rtf.format(days, 'day');
		// ≥7d → Wochen, ≥30d → Monate (so a months-old entry reads "vor 3 Monaten",
		// not "vor 92 Tagen"). RelativeTimeFormat handles de pluralization.
		if (Math.abs(days) < 30) return rtf.format(Math.round(days / 7), 'week');
		return rtf.format(Math.round(days / 30), 'month');
	}

	function rowClass(i: number): string {
		if (expanded) return '';
		if (i < MOBILE_CAP) return '';
		if (i < DESKTOP_CAP) return 'hidden md:flex';
		return 'hidden';
	}
</script>

{#if entries.length > 0}
	<section
		class="relative rounded-2xl bg-white p-4 shadow-(--shadow-card)"
		aria-labelledby="aktivitaet-heading"
	>
		<h2 id="aktivitaet-heading" class="mb-2 text-sm font-semibold tracking-tight text-ink-900">
			Aktivität
		</h2>
		<!-- relative wrapper so the bottom fade anchors to the CUT BOUNDARY (the
		     bottom edge of the last visible row), not a fixed offset from the
		     section. Collapsed, rows ≥ DESKTOP_CAP are display:none and take no
		     space, so the <ul>'s bottom IS the row-8/row-9 cut on desktop. -->
		<div class="relative">
			<ul class="flex flex-col">
				{#each entries as entry, i (entry.id)}
					<li
						data-testid="aktivitaet-row"
						class={'flex h-13 items-center justify-between gap-3 md:h-11 ' + rowClass(i)}
					>
						<span class="min-w-0 truncate text-[15px] text-ink-700 md:text-sm">{entry.label}</span>
						<time
							datetime={entry.occurredAt.toISOString()}
							class="shrink-0 text-xs text-ink-500"
						>
							{relTime(entry.occurredAt)}
						</time>
					</li>
				{/each}
			</ul>
			{#if !expanded && entries.length > DESKTOP_CAP}
				<!-- ~one desktop row tall (h-11), pinned to the cut boundary (bottom-0
				     of the rows wrapper) — fades the bottom of row 8, never smears it. -->
				<div
					data-testid="aktivitaet-fade"
					class="pointer-events-none absolute inset-x-0 bottom-0 hidden h-11 bg-gradient-to-t from-white md:block"
					aria-hidden="true"
				></div>
			{/if}
		</div>
		{#if !expanded && entries.length > MOBILE_CAP}
			<button
				type="button"
				class="mt-1 w-full rounded-[10px] py-2 text-left text-[13px] font-medium text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
				onclick={() => (expanded = true)}
			>
				Alle Aktivitäten →
			</button>
		{/if}
	</section>
{/if}
