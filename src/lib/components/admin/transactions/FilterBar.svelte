<script lang="ts">
	/**
	 * FilterBar — shared chip filter-bar for all three transaction tabs.
	 *
	 * Presentational + URL-driven: it reflects the current `FilterState` and emits
	 * changes by serializing a new state with `serializeFilterState` and calling
	 * `goto(?<query>)`. The URL query is the single source of truth — the parent
	 * page re-parses it via `parseFilterState` on the next `load` and feeds a fresh
	 * `state` back in. This component never holds filter state of its own.
	 *
	 * Composition (consumes the A3 primitives — does NOT rebuild them):
	 *  - desktop: a `Popover` per registry field; inside, the field picker
	 *    (enum-multi → checkboxes, member-picker → `Combobox`, amount-range → two
	 *    number inputs, boolean → toggle). Active selections render as removable
	 *    `MultiselectChip`s inline.
	 *  - mobile (<sm): the "+ Filter" trigger + chips collapse into a `Sheet`
	 *    holding the same field pickers; the search input + "Ansichten ▾" stay
	 *    inline. The "+ Filter" trigger carries a `filter-count-badge` showing the
	 *    number of active fields.
	 *  - saved views (Task 7): "Ansichten ▾" lists built-in presets + custom views
	 *    from `$lib/client/saved-views`; selecting one navigates to its query,
	 *    "Speichern" persists the current query as a new custom view.
	 *
	 * §13: this component only EMITS filter-state. Row-level Sphäre (left
	 * color-rule) / Status (filled badge) rendering is owned by the tab pages.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		FILTER_REGISTRY,
		serializeFilterState,
		type FilterState,
		type FilterFieldDef,
		type TabKey,
	} from '$lib/domain/transaction-filters.js';
	import {
		listViews,
		saveView,
		deleteView,
		type SavedView,
	} from '$lib/client/saved-views.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { MultiselectChip } from '$lib/components/ui/multiselect-chip/index.js';

	type Option = { value: string; label: string };
	/** Canonical member-option shape (Phase-3 scaffold + Task-6 `listMemberOptions`). */
	type MemberOption = { id: string; label: string };

	interface Props {
		tab: TabKey;
		state: FilterState;
		/** Runtime-loaded kategorie options; `value` = kategorie name-snapshot (P2-04). */
		kategorieOptions?: Option[];
		/** Runtime-loaded member options for member-picker fields; `id` = member uuid. */
		memberOptions?: MemberOption[];
		/** Live count of matching rows, shown as the result anchor. */
		resultCount?: number;
	}

	// External prop is `state` (Phase-3 contract); alias locally to `filterState`
	// to avoid colliding with Svelte's `$state` rune namespace in this runes file.
	let {
		tab,
		state: filterState,
		kategorieOptions = [],
		memberOptions = [],
		resultCount,
	}: Props = $props();

	// German display labels for the tab key (the raw key is lowercase + reads off
	// in UI copy).
	const TAB_LABEL = {
		ausgaben: 'Ausgaben',
		einnahmen: 'Einnahmen',
		spenden: 'Spenden',
	} as const;

	// Registry fields for the active tab, with runtime options injected for the
	// kategorie field (the registry leaves its `options` undefined — P2-04).
	const fields = $derived(
		FILTER_REGISTRY[tab].map((f) =>
			f.key === 'kategorie' ? { ...f, options: kategorieOptions } : f
		)
	);

	// ── State helpers ───────────────────────────────────────────────────────────
	// Each mutation clones `state`, applies the change, serializes, and navigates.
	// URL is the source of truth; we never mutate the incoming `state` prop.

	function clone(s: FilterState): FilterState {
		return {
			search: s.search,
			enums: { ...s.enums },
			members: { ...s.members },
			amount: { ...s.amount },
			booleans: { ...s.booleans },
		};
	}

	function navigate(next: FilterState) {
		const qs = serializeFilterState(tab, next);
		// Preserve non-filter params already on the URL (e.g. ?year, ?sort, ?dir) by
		// merging: filter params we own are replaced wholesale, others kept.
		// `page` is owned-and-reset: any filter change can shrink the result set, so
		// a stale ?page=5 would strand the user past the last page — strip it so
		// pagination falls back to page 1.
		const current = new URLSearchParams($page.url.search);
		const ownedKeys = new Set<string>(['q', 'betragMin', 'betragMax', 'page']);
		for (const f of FILTER_REGISTRY[tab]) ownedKeys.add(f.key);
		for (const k of ownedKeys) current.delete(k);
		const merged = new URLSearchParams(qs);
		for (const [k, v] of current) merged.set(k, v);
		const search = merged.toString();
		goto(`${$page.url.pathname}${search ? `?${search}` : ''}`, {
			keepFocus: true,
			noScroll: true,
		});
	}

	function setEnum(key: string, values: string[]) {
		const next = clone(filterState);
		if (values.length) next.enums[key] = values;
		else delete next.enums[key];
		navigate(next);
	}

	function removeEnumValue(key: string, value: string) {
		setEnum(
			key,
			(filterState.enums[key] ?? []).filter((v) => v !== value)
		);
	}

	function setMember(key: string, id: string | undefined) {
		const next = clone(filterState);
		if (id) next.members[key] = id;
		else delete next.members[key];
		navigate(next);
	}

	function setBoolean(key: string, on: boolean) {
		const next = clone(filterState);
		if (on) next.booleans[key] = true;
		else delete next.booleans[key];
		navigate(next);
	}

	function setAmount(field: 'betragMin' | 'betragMax', raw: string) {
		const next = clone(filterState);
		const n = raw.trim() === '' ? undefined : Number(raw);
		if (n != null && Number.isFinite(n) && n >= 0) next.amount[field] = Math.trunc(n);
		else delete next.amount[field];
		navigate(next);
	}

	function setSearch(raw: string) {
		const next = clone(filterState);
		const trimmed = raw.trim();
		if (trimmed) next.search = trimmed.slice(0, 200);
		else delete next.search;
		navigate(next);
	}

	function resetAll() {
		navigate({ enums: {}, members: {}, amount: {}, booleans: {} });
	}

	// ── Active-state derivations (chips + count badge) ────────────────────────────

	function labelFor(field: FilterFieldDef, value: string): string {
		const opt = field.options?.find((o) => o.value === value);
		return opt?.label ?? value;
	}

	function memberLabel(id: string): string {
		return memberOptions.find((o) => o.id === id)?.label ?? id;
	}

	interface Chip {
		key: string;
		fieldLabel: string;
		valueLabel: string;
		onRemove: () => void;
	}

	const chips = $derived.by<Chip[]>(() => {
		const out: Chip[] = [];
		for (const f of fields) {
			if (f.type === 'enum-multi') {
				for (const v of filterState.enums[f.key] ?? [])
					out.push({
						key: `${f.key}:${v}`,
						fieldLabel: f.label,
						valueLabel: labelFor(f, v),
						onRemove: () => removeEnumValue(f.key, v),
					});
			} else if (f.type === 'member-picker') {
				const id = filterState.members[f.key];
				if (id)
					out.push({
						key: `${f.key}:${id}`,
						fieldLabel: f.label,
						valueLabel: memberLabel(id),
						onRemove: () => setMember(f.key, undefined),
					});
			} else if (f.type === 'boolean') {
				if (filterState.booleans[f.key])
					out.push({
						key: f.key,
						fieldLabel: f.label,
						valueLabel: 'Ja',
						onRemove: () => setBoolean(f.key, false),
					});
			} else if (f.type === 'amount-range') {
				if (filterState.amount.betragMin != null)
					out.push({
						key: 'betragMin',
						fieldLabel: `${f.label} min`,
						valueLabel: String(filterState.amount.betragMin),
						onRemove: () => setAmount('betragMin', ''),
					});
				if (filterState.amount.betragMax != null)
					out.push({
						key: 'betragMax',
						fieldLabel: `${f.label} max`,
						valueLabel: String(filterState.amount.betragMax),
						onRemove: () => setAmount('betragMax', ''),
					});
			}
		}
		return out;
	});

	// Active-FIELD count (not value count): a field with ≥1 selection counts once.
	const activeFieldCount = $derived.by<number>(() => {
		let n = 0;
		for (const f of fields) {
			if (f.type === 'enum-multi' && (filterState.enums[f.key]?.length ?? 0) > 0) n++;
			else if (f.type === 'member-picker' && filterState.members[f.key]) n++;
			else if (f.type === 'boolean' && filterState.booleans[f.key]) n++;
			else if (
				f.type === 'amount-range' &&
				(filterState.amount.betragMin != null || filterState.amount.betragMax != null)
			)
				n++;
		}
		return n;
	});

	const hasActiveFilters = $derived(chips.length > 0 || !!filterState.search);

	// ── Saved views (Task 7) ──────────────────────────────────────────────────────

	let views = $state<SavedView[]>([]);
	let viewsOpen = $state(false);

	$effect(() => {
		// Re-read on open so a just-saved view shows up.
		if (viewsOpen) views = listViews(tab);
	});

	function applyView(view: SavedView) {
		viewsOpen = false;
		const search = view.query;
		goto(`${$page.url.pathname}${search ? `?${search}` : ''}`, {
			keepFocus: true,
			noScroll: true,
		});
	}

	function saveCurrentView() {
		const name = (typeof prompt === 'function' ? prompt('Name der Ansicht?') : null)?.trim();
		if (!name) return;
		saveView(tab, { name, query: serializeFilterState(tab, filterState) });
		views = listViews(tab);
	}

	function removeView(view: SavedView) {
		deleteView(tab, view.id);
		views = listViews(tab);
	}

	// Mobile filter sheet
	let sheetOpen = $state(false);
</script>

<!--
  Layout: a single filter row.
  - search input + "Ansichten ▾" + "Zurücksetzen" + result count are always inline.
  - desktop (sm+): a Popover per field + the active chips render inline.
  - mobile (<sm): the field Popovers + chips are hidden; a "+ Filter" trigger
    opens a bottom Sheet holding the same field pickers. The count badge lives on
    the trigger.
-->
<div data-slot="filter-bar" class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center gap-2">
		<!-- Persistent search (inline on every breakpoint) -->
		<input
			type="search"
			value={filterState.search ?? ''}
			placeholder="Suchen…"
			aria-label="Suchen"
			class="border-input bg-background focus-visible:ring-ring h-11 min-h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-1 sm:w-56"
			onchange={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
		/>

		<!--
		  Desktop (sm+): a single "+ Filter" Popover holding every registry field
		  picker. The count badge lives on the trigger. Active selections surface as
		  removable chips below (not on the trigger), so the field labels live only
		  inside the closed popover — no duplicate label text leaks into the bar.
		-->
		<div class="hidden sm:block">
			<Popover.Root>
				<Popover.Trigger
					data-slot="filter-trigger"
					class="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-11 min-h-11 items-center gap-2 rounded-md border px-3 text-sm whitespace-nowrap transition-colors"
				>
					+ Filter
					{#if activeFieldCount > 0}
						<span
							aria-hidden="true"
							class="bg-primary text-primary-foreground inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium"
						>
							{activeFieldCount}
						</span>
					{/if}
				</Popover.Trigger>
				<Popover.Content class="flex w-80 flex-col gap-4 p-3">
					{#each fields as field (field.key)}
						<fieldset class="flex flex-col gap-1">
							<legend class="text-sm font-medium">{field.label}</legend>
							{@render fieldPicker(field)}
						</fieldset>
					{/each}
				</Popover.Content>
			</Popover.Root>
		</div>

		<!-- Mobile (<sm): the same field pickers collapse into a bottom Sheet. -->
		<div class="sm:hidden">
			<Sheet.Root bind:open={sheetOpen}>
				<Sheet.Trigger
					data-slot="filter-trigger"
					class="border-input bg-background hover:bg-accent inline-flex h-11 min-h-11 items-center gap-2 rounded-md border px-3 text-sm whitespace-nowrap transition-colors"
				>
					+ Filter
					{#if activeFieldCount > 0}
						<span
							aria-hidden="true"
							class="bg-primary text-primary-foreground inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium"
						>
							{activeFieldCount}
						</span>
					{/if}
				</Sheet.Trigger>
				<Sheet.Content side="bottom" class="max-h-[85vh] overflow-y-auto p-4">
					<Sheet.Header>
						<Sheet.Title>Filter</Sheet.Title>
						<Sheet.Description>Filter für {TAB_LABEL[tab]} auswählen.</Sheet.Description>
					</Sheet.Header>
					<div class="flex flex-col gap-4 py-2">
						{#each fields as field (field.key)}
							<fieldset class="flex flex-col gap-1">
								<legend class="text-sm font-medium">{field.label}</legend>
								{@render fieldPicker(field)}
							</fieldset>
						{/each}
					</div>
					<Sheet.Footer>
						<button
							type="button"
							class="hover:bg-accent h-11 min-h-11 rounded-md border px-3 text-sm"
							onclick={resetAll}>Zurücksetzen</button
						>
					</Sheet.Footer>
				</Sheet.Content>
			</Sheet.Root>
		</div>

		<!--
		  Canonical active-filter count: always mounted (single source of truth for
		  the `filter-count-badge` test id + the screen-reader announcement). The
		  visual count pills on the two breakpoint triggers above are aria-hidden
		  duplicates of this value.
		-->
		{#if activeFieldCount > 0}
			<span
				data-testid="filter-count-badge"
				class="sr-only"
				aria-live="polite"
			>
				{activeFieldCount} aktive Filter
			</span>
		{/if}

		<!-- Saved views (Task 7): "Ansichten ▾" -->
		<Popover.Root bind:open={viewsOpen}>
			<Popover.Trigger
				class="border-input bg-background hover:bg-accent inline-flex h-11 min-h-11 items-center gap-1 rounded-md border px-3 text-sm whitespace-nowrap transition-colors"
			>
				Ansichten
				<span aria-hidden="true">▾</span>
			</Popover.Trigger>
			<Popover.Content class="w-64 p-1">
				<ul class="flex flex-col">
					{#each views as view (view.id)}
						<li class="flex items-center justify-between gap-1">
							<button
								type="button"
								class="hover:bg-accent min-h-11 flex-1 rounded-md px-2 py-1.5 text-left text-sm"
								onclick={() => applyView(view)}>{view.name}</button
							>
							{#if !view.readonly}
								<button
									type="button"
									aria-label="{view.name} löschen"
									class="text-muted-foreground hover:text-destructive flex min-h-11 min-w-11 items-center justify-center rounded-md text-sm"
									onclick={() => removeView(view)}>×</button
								>
							{/if}
						</li>
					{:else}
						<li class="text-muted-foreground px-2 py-1.5 text-sm">Keine Ansichten</li>
					{/each}
					<li class="mt-1 border-t pt-1">
						<button
							type="button"
							class="hover:bg-accent min-h-11 w-full rounded-md px-2 py-1.5 text-left text-sm"
							onclick={saveCurrentView}>Aktuelle Filter speichern…</button
						>
					</li>
				</ul>
			</Popover.Content>
		</Popover.Root>

		<!-- Reset -->
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground hover:bg-accent ml-auto h-11 min-h-11 rounded-md px-3 text-sm disabled:opacity-50"
			disabled={!hasActiveFilters}
			onclick={resetAll}>Zurücksetzen</button
		>

		<!-- Live result count -->
		{#if resultCount != null}
			<span data-slot="result-count" class="text-muted-foreground text-sm whitespace-nowrap">
				{resultCount} Ergebnisse
			</span>
		{/if}
	</div>

	<!-- Active chips (desktop inline; hidden on mobile where the Sheet owns filters) -->
	{#if chips.length}
		<div class="hidden flex-wrap items-center gap-2 sm:flex">
			{#each chips as chip (chip.key)}
				<MultiselectChip
					label={chip.fieldLabel}
					value={chip.valueLabel}
					onRemove={chip.onRemove}
				/>
			{/each}
		</div>
	{/if}
</div>

<!--
  Field picker snippet — shared by the desktop Popover and the mobile Sheet.
  enum-multi → checkbox list; member-picker → Combobox over memberOptions;
  amount-range → two number inputs; boolean → toggle checkbox.
-->
{#snippet fieldPicker(field: FilterFieldDef)}
	{#if field.type === 'enum-multi'}
		<div role="group" aria-label={field.label} class="flex flex-col gap-1">
			{#each field.options ?? [] as opt (opt.value)}
				<label class="hover:bg-accent flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm">
					<input
						type="checkbox"
						class="size-4"
						checked={(filterState.enums[field.key] ?? []).includes(opt.value)}
						onchange={(e) => {
							const cur = filterState.enums[field.key] ?? [];
							const next = (e.currentTarget as HTMLInputElement).checked
								? [...cur, opt.value]
								: cur.filter((v) => v !== opt.value);
							setEnum(field.key, next);
						}}
					/>
					<span>{opt.label}</span>
				</label>
			{:else}
				<span class="text-muted-foreground px-2 py-1.5 text-sm">Keine Optionen</span>
			{/each}
		</div>
	{:else if field.type === 'member-picker'}
		<Combobox
			options={memberOptions.map((m) => ({ value: m.id, label: m.label }))}
			value={filterState.members[field.key] ? [filterState.members[field.key]] : []}
			multiple={false}
			ariaLabel={field.label}
			placeholder="{field.label} wählen…"
			onValueChange={(v) => setMember(field.key, v[0])}
		/>
	{:else if field.type === 'amount-range'}
		<div class="flex items-center gap-2">
			<label class="flex flex-1 flex-col gap-0.5 text-xs">
				<span class="text-muted-foreground">Min (€)</span>
				<input
					type="number"
					inputmode="numeric"
					min="0"
					aria-label="{field.label} minimum"
					value={filterState.amount.betragMin ?? ''}
					class="border-input bg-background h-11 min-h-11 w-full rounded-md border px-2 text-sm outline-none"
					onchange={(e) => setAmount('betragMin', (e.currentTarget as HTMLInputElement).value)}
				/>
			</label>
			<label class="flex flex-1 flex-col gap-0.5 text-xs">
				<span class="text-muted-foreground">Max (€)</span>
				<input
					type="number"
					inputmode="numeric"
					min="0"
					aria-label="{field.label} maximum"
					value={filterState.amount.betragMax ?? ''}
					class="border-input bg-background h-11 min-h-11 w-full rounded-md border px-2 text-sm outline-none"
					onchange={(e) => setAmount('betragMax', (e.currentTarget as HTMLInputElement).value)}
				/>
			</label>
		</div>
	{:else if field.type === 'boolean'}
		<label class="hover:bg-accent flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm">
			<input
				type="checkbox"
				class="size-4"
				checked={!!filterState.booleans[field.key]}
				onchange={(e) => setBoolean(field.key, (e.currentTarget as HTMLInputElement).checked)}
			/>
			<span>{field.label}</span>
		</label>
	{/if}
{/snippet}
