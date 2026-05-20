<script lang="ts">
	/**
	 * SavedViewsBar — localStorage-backed saved view shortcuts.
	 * Ships with three default views; URL query params are the source of truth.
	 */

	interface SavedView {
		id: string;
		label: string;
		params: Record<string, string>;
	}

	interface Props {
		onselect: (params: Record<string, string>) => void;
	}

	let { onselect }: Props = $props();

	const DEFAULT_VIEWS: SavedView[] = [
		{
			id: 'this-month',
			label: 'Diesen Monat',
			params: {
				year: String(new Date().getFullYear()),
				month: String(new Date().getMonth() + 1),
			},
		},
		{
			id: 'offene-erstattungen',
			label: 'Offene Erstattungen',
			params: { kind: 'expense', status: 'geprueft' },
		},
		{
			id: 'spenden-ytd',
			label: 'Spenden YTD',
			params: {
				kind: 'donation',
				year: String(new Date().getFullYear()),
			},
		},
	];

	// Load saved views from localStorage (user-defined additions) + defaults
	function loadViews(): SavedView[] {
		if (typeof localStorage === 'undefined') return DEFAULT_VIEWS;
		try {
			const stored = localStorage.getItem('fdw:transaction-views');
			if (!stored) return DEFAULT_VIEWS;
			const parsed = JSON.parse(stored) as SavedView[];
			return [...DEFAULT_VIEWS, ...parsed];
		} catch {
			return DEFAULT_VIEWS;
		}
	}

	let views = $state(loadViews());
	let activeId = $state<string | null>(null);

	function selectView(view: SavedView) {
		activeId = view.id;
		onselect(view.params);
	}
</script>

<!--
  Mobile (< sm) → horizontally scrollable strip so the saved-view chips
  don't clip the viewport at 390px (PM-008 sibling). On sm+ the chips wrap
  naturally — that path is the original behaviour.
-->
<div class="flex items-center gap-2 overflow-x-auto sm:flex-wrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
	<span class="shrink-0 text-xs font-medium text-muted-foreground">Ansicht:</span>
	{#each views as view (view.id)}
		<button
			onclick={() => selectView(view)}
			class={[
				'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors',
				activeId === view.id
					? 'border-primary bg-primary/10 text-primary'
					: 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
			].join(' ')}
		>
			{view.label}
		</button>
	{/each}
</div>
