<script lang="ts" module>
	export interface YearMenuOption {
		year: number;
		closed: boolean;
	}
</script>

<script lang="ts">
	/**
	 * C2 — Compact year-switcher dropdown (topbar, sticky).
	 *
	 * Replaces the wide SegmentedControl (YearSwitcher) + native select
	 * (MobileYearPicker) with ONE compact dropdown that works on every
	 * viewport. The trigger is a small pill showing the current year +
	 * a ChevronDown icon; the menu lists years newest-first with a check
	 * on the active entry and a lock icon on festgeschriebene years.
	 *
	 * Cookie persistence (fdw_year): when the user picks a year, we write
	 * document.cookie BEFORE the goto() so the server sees the cookie on
	 * the very next SSR request and resolves the same year without a flash.
	 * The cookie is set in the browser; the server reads it in
	 * /app/+layout.server.ts when no ?year= URL param is present.
	 *
	 * Resolves: VB-002, JB-001, JB-003, JB-006, UX-010, UI-009, C2-4, C2-5.
	 */

	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuRadioGroup,
		DropdownMenuRadioItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger,
	} from '$lib/components/ui/dropdown-menu/index.js';
	import { ALL_YEARS, yearScopeLabel, type YearScope } from '$lib/domain/year.js';

	interface Props {
		years: YearMenuOption[];
		selected: YearScope;
		onChange: (year: YearScope) => void;
		allowAllYears?: boolean;
	}

	let { years, selected, onChange, allowAllYears = false }: Props = $props();

	const triggerLabel = $derived(yearScopeLabel(selected));

	const ariaLabel = $derived(
		`Buchungsjahr wählen (aktuell: ${triggerLabel})`
	);

	function handleSelect(value: string) {
		if (value === ALL_YEARS) {
			onChange(ALL_YEARS);
			return;
		}
		const n = Number.parseInt(value, 10);
		if (Number.isFinite(n)) onChange(n);
	}

	// Derive the string value for the RadioGroup binding
	const radioValue = $derived(String(selected));
</script>

<DropdownMenu>
	<DropdownMenuTrigger
		class="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-hairline bg-secondary/40 px-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
		aria-label={ariaLabel}
		data-fdw="year-menu-trigger"
	>
		{triggerLabel}
		<!-- ChevronDown icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-ink-500"
			aria-hidden="true"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</DropdownMenuTrigger>

	<DropdownMenuContent align="start" class="min-w-[10rem]">
		<DropdownMenuRadioGroup value={radioValue} onValueChange={handleSelect}>
			{#each years as y (y.year)}
				<DropdownMenuRadioItem
					value={String(y.year)}
					class={y.closed ? 'text-muted-foreground' : ''}
					aria-label={y.closed ? `${y.year} (festgeschrieben)` : String(y.year)}
				>
					<span class="flex items-center gap-1.5">
						{#if y.closed}
							<!-- Lock icon — aria-hidden, SR gets it from the aria-label -->
							<svg
								data-testid={`year-lock-${y.year}`}
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="size-3 shrink-0 text-muted-foreground"
								aria-hidden="true"
							>
								<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
								<path d="M7 11V7a5 5 0 0 1 10 0v4" />
							</svg>
						{/if}
						<span>{y.year}</span>
					</span>
				</DropdownMenuRadioItem>
			{/each}

			{#if allowAllYears}
				<DropdownMenuSeparator />
				<DropdownMenuRadioItem value={ALL_YEARS} aria-label="Alle Jahre">
					Alle Jahre
				</DropdownMenuRadioItem>
			{/if}
		</DropdownMenuRadioGroup>
	</DropdownMenuContent>
</DropdownMenu>
