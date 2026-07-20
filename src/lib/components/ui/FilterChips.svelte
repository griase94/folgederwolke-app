<script lang="ts">
	/**
	 * FilterChips — Aurora filter chip row (master plan §2.5 FROZEN contract,
	 * spec §8 chip contract).
	 *
	 * Visual chip 28px desktop / 32px mobile; the BUTTON keeps a ≥44px hit
	 * area via vertical padding. 12px side padding, 8px gaps, 13px/600.
	 * Active = solid primary-strong + white (no gradient — §2 budget) +
	 * aria-current. Inactive = white + hairline. Selecting writes
	 * ?{paramName}= via goto keepFocus (deep-linkable, focus preserved).
	 *
	 * Behavioral law (master §2.5): the empty-value chip ("Alle") DELETES
	 * the param instead of setting it empty, and ANY chip change deletes
	 * ?page= — the result set changes, so pagination resets.
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let {
		options,
		active,
		paramName
	}: {
		/** `count`, when present, renders a `.cnt` badge after the label (plate). */
		options: { value: string; label: string; count?: number }[];
		active: string;
		paramName: string;
	} = $props();

	function select(value: string): void {
		const u = new URL(page.url);
		if (value === '') u.searchParams.delete(paramName);
		else u.searchParams.set(paramName, value);
		// The result set changes → pagination resets.
		u.searchParams.delete('page');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(u.pathname + u.search, { keepFocus: true, noScroll: true });
	}
</script>

<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Filter">
	{#each options as opt (opt.value)}
		{@const isActive = opt.value === active}
		<button
			type="button"
			data-testid={`filter-chip-${opt.value || 'alle'}`}
			aria-current={isActive ? 'true' : undefined}
			onclick={() => select(opt.value)}
			class="flex min-h-11 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-10"
		>
			<span
				class={'flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors md:h-7 ' +
					(isActive
						? 'bg-primary-strong text-white'
						: 'border border-hairline bg-background text-ink-700 hover:bg-secondary')}
				>{opt.label}{#if opt.count !== undefined}<span
						class={'text-[11px] font-bold tabular-nums ' +
							(isActive ? 'text-white/75' : 'text-ink-300')}>{opt.count}</span
					>{/if}</span
			>
		</button>
	{/each}
</div>
