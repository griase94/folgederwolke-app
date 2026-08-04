<script lang="ts">
  /**
   * FilterBar — the list toolbar for the three transaction tabs.
   *
   * Presentational + URL-driven: it reflects the current `FilterState` and emits
   * changes by serializing a new state with `serializeFilterState` and calling
   * `goto(?<query>)`. The URL query is the single source of truth — the parent
   * page re-parses it via `parseFilterState` on the next `load` and feeds a fresh
   * `state` back in. This component never holds filter state of its own.
   *
   * Anatomy (spec §3, Andys Regel 7) — it owns the WHOLE toolbar, including the
   * page's export + primary action, because a filter bar that only owns its left
   * half cannot keep the right half from moving when a chip row appears:
   *
   *   row 1  [search · + Filter · Ansichten] —— [N von M · CSV · <actions>]
   *   row 2  [chips …  Zurücksetzen]
   *
   * Filter surface (spec §4, Andys Regel 8) — never a meterlong checkbox wall:
   *  - short enums (Sphäre, Status, Bezahlt von, …) are wrap TogglePills;
   *  - Monat is a 4×3 grid of the same pill;
   *  - Kategorie (up to ~35 options) gets as-you-type search + an internally
   *    scrolling list with the active selection pinned to the top;
   *  - Betrag is min/max side by side, booleans are single toggle rows;
   *  - the popover itself is capped at min(70vh, 640px) and scrolls internally,
   *    so it can never grow past the viewport.
   *
   * Mobile (<md) uses the SAME sections in a bottom sheet, plus the CSV export
   * (which has no room in the toolbar there) and a [Zurücksetzen][Fertig] footer.
   *
   * §13: this component only EMITS filter-state. Row-level Sphäre (left
   * color-rule) / Status (filled badge) rendering is owned by the tab pages.
   */
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    FILTER_REGISTRY,
    serializeFilterState,
    type FilterState,
    type FilterFieldDef,
    type TabKey,
  } from "$lib/domain/transaction-filters.js";
  import {
    listViews,
    saveView,
    deleteView,
    type SavedView,
  } from "$lib/client/saved-views.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import { Combobox } from "$lib/components/ui/combobox/index.js";
  import { MultiselectChip } from "$lib/components/ui/multiselect-chip/index.js";
  import {
    ListToolbar,
    TOOLBAR_CONTROL as CONTROL,
    TOOLBAR_BUTTON as CONTROL_BUTTON,
  } from "$lib/components/ui/list-toolbar/index.js";
  import { TogglePill } from "$lib/components/ui/toggle-pill/index.js";
  import { parseEuroToCents, formatCentsAsEuro } from "$lib/domain/money.js";

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
    /** Rows matching the current filters. */
    resultCount?: number;
    /** Rows in scope before filtering — the M of "N von M". */
    totalCount?: number;
    /** CSV export of the filtered + sorted list (all pages). */
    exportHref?: string;
    /** The page's own actions — the ONE primary CTA, plus any extra link. */
    pageActions?: Snippet;
  }

  // External prop is `state` (Phase-3 contract); alias locally to `filterState`
  // to avoid colliding with Svelte's `$state` rune namespace in this runes file.
  let {
    tab,
    state: filterState,
    kategorieOptions = [],
    memberOptions = [],
    resultCount,
    totalCount,
    exportHref,
    pageActions,
  }: Props = $props();

  // German display labels for the tab key (the raw key is lowercase + reads off
  // in UI copy).
  const TAB_LABEL: Record<TabKey, string> = {
    ausgaben: "Ausgaben",
    einnahmen: "Einnahmen",
    spenden: "Spenden",
    transaktionen: "Transaktionen",
  };

  /** Above this many options a list gets search + internal scroll (spec §4). */
  const SEARCHABLE_FROM = 8;

  // Registry fields for the active tab, with runtime options injected for the
  // kategorie field (the registry leaves its `options` undefined — P2-04).
  const fields = $derived(
    FILTER_REGISTRY[tab].map((f) =>
      f.key === "kategorie" ? { ...f, options: kategorieOptions } : f,
    ),
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
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder, not a Svelte reactive store
    const current = new URLSearchParams($page.url.search);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local set of owned keys, not a Svelte reactive store
    const ownedKeys = new Set<string>(["q", "betragMin", "betragMax", "page"]);
    for (const f of FILTER_REGISTRY[tab]) ownedKeys.add(f.key);
    for (const k of ownedKeys) current.delete(k);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder, not a Svelte reactive store
    const merged = new URLSearchParams(qs);
    for (const [k, v] of current) merged.set(k, v);
    const search = merged.toString();
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-origin query string, not a typed route id
    goto(`${$page.url.pathname}${search ? `?${search}` : ""}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  // ── Debounced enum toggles ──────────────────────────────────────────────────
  // Toggling a pill used to navigate (goto) on EVERY click. Rapid successive
  // toggles each fired a navigation AND each read a stale `filterState` (the
  // previous nav's load may not have re-parsed yet), so two quick toggles could
  // drop one. We keep a `pendingEnums` overlay that accumulates toggles locally
  // and debounce the navigate, so a burst of toggles batches into ONE navigation
  // with the correct combined selection. The popover/sheet stays open across the
  // single keepFocus navigation (URL is still the source of truth).
  //
  // 500ms (raised from 250 in spec §4): a multi-select pill row invites picking
  // three or four values in a row, and 250ms fired mid-burst — the list flickered
  // through intermediate result sets while the user was still choosing.
  const ENUM_DEBOUNCE_MS = 500;
  let pendingEnums = $state<Record<string, string[]> | null>(null);
  let enumNavTimer: ReturnType<typeof setTimeout> | null = null;

  // The effective enum selection for a key: the pending overlay (mid-burst) wins,
  // else the URL-derived `filterState`. Drives the pill `pressed` state so a
  // toggle reflects instantly even before the debounced navigation lands.
  function effectiveEnum(key: string): string[] {
    return pendingEnums?.[key] ?? filterState.enums[key] ?? [];
  }

  function flushEnums() {
    if (enumNavTimer) {
      clearTimeout(enumNavTimer);
      enumNavTimer = null;
    }
    if (!pendingEnums) return;
    const next = clone(filterState);
    next.enums = { ...next.enums };
    for (const [k, vals] of Object.entries(pendingEnums)) {
      if (vals.length) next.enums[k] = vals;
      else delete next.enums[k];
    }
    pendingEnums = null;
    navigate(next);
  }

  // Clone `filterState` AND fold in any in-flight enum overlay, cancelling the
  // pending debounce. The non-enum mutators (member / amount / boolean / search)
  // navigate immediately; without this they would clone ONLY the URL-derived
  // `filterState`, and the later debounced flush would re-clone a now-stale
  // `filterState` — silently dropping a mid-burst enum toggle. By committing the
  // overlay into the SAME `next` they navigate with, the enum change rides along
  // in that single navigation instead of being lost.
  function cloneWithPendingEnums(): FilterState {
    const next = clone(filterState);
    if (pendingEnums) {
      if (enumNavTimer) {
        clearTimeout(enumNavTimer);
        enumNavTimer = null;
      }
      next.enums = { ...next.enums };
      for (const [k, vals] of Object.entries(pendingEnums)) {
        if (vals.length) next.enums[k] = vals;
        else delete next.enums[k];
      }
      pendingEnums = null;
    }
    return next;
  }

  function setEnum(key: string, values: string[]) {
    // Seed the overlay from the current effective state so concurrent keys keep
    // their pending values, then stage this key's new selection.
    const overlay: Record<string, string[]> = { ...(pendingEnums ?? {}) };
    overlay[key] = values;
    pendingEnums = overlay;
    if (enumNavTimer) clearTimeout(enumNavTimer);
    enumNavTimer = setTimeout(flushEnums, ENUM_DEBOUNCE_MS);
  }

  function toggleEnum(key: string, value: string) {
    const cur = effectiveEnum(key);
    setEnum(
      key,
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    );
  }

  function removeEnumValue(key: string, value: string) {
    // Chip removal is a deliberate single action — flush immediately (no debounce
    // wait) so the chip disappears at once.
    const overlay: Record<string, string[]> = { ...(pendingEnums ?? {}) };
    overlay[key] = effectiveEnum(key).filter((v) => v !== value);
    pendingEnums = overlay;
    flushEnums();
  }

  function setMember(key: string, id: string | undefined) {
    const next = cloneWithPendingEnums();
    if (id) next.members[key] = id;
    else delete next.members[key];
    navigate(next);
  }

  function setBoolean(key: string, on: boolean) {
    const next = cloneWithPendingEnums();
    if (on) next.booleans[key] = true;
    else delete next.booleans[key];
    navigate(next);
  }

  // The amount filter's URL params (betragMin/betragMax) are integer CENTS — the
  // server compares them directly against `betragCents` (transaction-filter-sql.ts).
  // The inputs are EUROS, so we parse de-DE-tolerant (accept the German comma
  // decimal) and convert to cents; the chip + input value convert cents → euros.

  /**
   * Parse a de-DE euros string → integer cents (or undefined for empty/invalid).
   * Delegates to the shared `parseEuroToCents` (the ONE de-DE parser, aligned
   * with the client `parseBetragCents`) so the filter bar can't drift from the
   * separator rules used everywhere else. `parseEuroToCents` throws on
   * empty/malformed and returns a bigint that may be negative; we map a throw →
   * undefined and clamp negatives away (a negative amount filter is meaningless).
   */
  function eurosToCents(raw: string): number | undefined {
    if (raw.trim() === "") return undefined;
    try {
      const cents = parseEuroToCents(raw);
      if (cents < 0n) return undefined;
      return Number(cents);
    } catch {
      return undefined;
    }
  }

  /** Format integer cents → a de-DE euros input value (e.g. 1250 → "12,5"). */
  function centsToEurosInput(cents: number | undefined): string {
    if (cents == null) return "";
    return String(cents / 100).replace(".", ",");
  }

  /** Format integer cents → a de-DE currency chip label (e.g. 1250 → "12,50 €"). */
  function centsToChipLabel(cents: number): string {
    return formatCentsAsEuro(BigInt(cents));
  }

  function setAmount(field: "betragMin" | "betragMax", raw: string) {
    const next = cloneWithPendingEnums();
    const cents = eurosToCents(raw);
    if (cents != null) next.amount[field] = cents;
    else delete next.amount[field];
    navigate(next);
  }

  function setSearch(raw: string) {
    const next = cloneWithPendingEnums();
    const trimmed = raw.trim();
    if (trimmed) next.search = trimmed.slice(0, 200);
    else delete next.search;
    navigate(next);
  }

  function resetAll() {
    optionQuery = {};
    navigate({ enums: {}, members: {}, amount: {}, booleans: {} });
  }

  // ── Long-list search (Kategorie) ────────────────────────────────────────────
  // Per-field as-you-type query, local to the popover — it narrows the option
  // list only, never the result set.
  let optionQuery = $state<Record<string, string>>({});

  /**
   * Options for a searchable field: matches first, and within them the active
   * selection pinned to the top so what you picked never scrolls out of sight.
   */
  function visibleOptions(field: FilterFieldDef): Option[] {
    const all = field.options ?? [];
    const q = (optionQuery[field.key] ?? "").trim().toLowerCase();
    const matches = q
      ? all.filter((o) => o.label.toLowerCase().includes(q))
      : all;
    const active = effectiveEnum(field.key);
    if (active.length === 0) return matches;
    return [
      ...matches.filter((o) => active.includes(o.value)),
      ...matches.filter((o) => !active.includes(o.value)),
    ];
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

  const activeChips = $derived.by<Chip[]>(() => {
    const out: Chip[] = [];
    for (const f of fields) {
      if (f.type === "enum-multi") {
        for (const v of filterState.enums[f.key] ?? [])
          out.push({
            key: `${f.key}:${v}`,
            fieldLabel: f.label,
            valueLabel: labelFor(f, v),
            onRemove: () => removeEnumValue(f.key, v),
          });
      } else if (f.type === "member-picker") {
        const id = filterState.members[f.key];
        if (id)
          out.push({
            key: `${f.key}:${id}`,
            fieldLabel: f.label,
            valueLabel: memberLabel(id),
            onRemove: () => setMember(f.key, undefined),
          });
      } else if (f.type === "boolean") {
        if (filterState.booleans[f.key])
          out.push({
            key: f.key,
            fieldLabel: f.label,
            valueLabel: "Ja",
            onRemove: () => setBoolean(f.key, false),
          });
      } else if (f.type === "amount-range") {
        if (filterState.amount.betragMin != null)
          out.push({
            key: "betragMin",
            fieldLabel: `${f.label} min`,
            valueLabel: centsToChipLabel(filterState.amount.betragMin),
            onRemove: () => setAmount("betragMin", ""),
          });
        if (filterState.amount.betragMax != null)
          out.push({
            key: "betragMax",
            fieldLabel: `${f.label} max`,
            valueLabel: centsToChipLabel(filterState.amount.betragMax),
            onRemove: () => setAmount("betragMax", ""),
          });
      }
    }
    return out;
  });

  // Active-FIELD count (not value count): a field with ≥1 selection counts once.
  const activeFieldCount = $derived.by<number>(() => {
    let n = 0;
    for (const f of fields) {
      if (
        f.type === "enum-multi" &&
        (filterState.enums[f.key]?.length ?? 0) > 0
      )
        n++;
      else if (f.type === "member-picker" && filterState.members[f.key]) n++;
      else if (f.type === "boolean" && filterState.booleans[f.key]) n++;
      else if (
        f.type === "amount-range" &&
        (filterState.amount.betragMin != null ||
          filterState.amount.betragMax != null)
      )
        n++;
    }
    return n;
  });

  const hasActiveFilters = $derived(
    activeChips.length > 0 || !!filterState.search,
  );

  // The result anchor is a comparison, so it only means something once something
  // is filtered away (spec §5 format canon: filtered "N von M", unfiltered
  // nothing — an unfiltered "47 Ergebnisse" merely repeats the header).
  const showResultMeta = $derived(
    hasActiveFilters && resultCount != null && totalCount != null,
  );

  // ── Saved views (Task 7) ──────────────────────────────────────────────────────

  let views = $state<SavedView[]>([]);
  let viewsOpen = $state(false);
  let newViewName = $state("");

  $effect(() => {
    // Re-read on open so a just-saved view shows up.
    if (viewsOpen) views = listViews(tab);
  });

  function applyView(view: SavedView) {
    viewsOpen = false;
    const search = view.query;
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-origin query string, not a typed route id
    goto(`${$page.url.pathname}${search ? `?${search}` : ""}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  /**
   * Save the current query under a typed name. The name is entered inline in the
   * popover — `window.prompt` is not an option here (guidelines §2.3: the browser
   * dialog is unstyled, unthemeable and blocks the PWA).
   */
  function saveCurrentView() {
    const name = newViewName.trim();
    if (!name) return;
    saveView(tab, { name, query: serializeFilterState(tab, filterState) });
    newViewName = "";
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
  Section list — rendered identically in the desktop popover and the mobile
  sheet, so the two never drift apart.
-->
{#snippet sections()}
  {#each fields as field (field.key)}
    {#if field.type === "boolean"}
      <!-- A boolean needs no heading: the toggle already carries the label. -->
      <TogglePill
        label={field.label}
        pressed={!!filterState.booleans[field.key]}
        onToggle={() => setBoolean(field.key, !filterState.booleans[field.key])}
        class="w-full"
        data-filter-boolean={field.key}
      />
    {:else}
      <section class="flex flex-col gap-2" data-filter-section={field.key}>
        <h3
          class="text-[11px] font-semibold uppercase tracking-wider text-ink-500"
        >
          {field.label}
        </h3>

        {#if field.type === "enum-multi" && field.key === "monat"}
          <!-- Monat is a picker, not twelve checkboxes (Andys Regel 8). -->
          <div class="grid grid-cols-4 gap-1.5" role="group" aria-label={field.label}>
            {#each field.options ?? [] as opt (opt.value)}
              <TogglePill
                label={opt.label}
                pressed={effectiveEnum(field.key).includes(opt.value)}
                onToggle={() => toggleEnum(field.key, opt.value)}
              />
            {/each}
          </div>
        {:else if field.type === "enum-multi" && (field.options?.length ?? 0) > SEARCHABLE_FROM}
          <!-- Long list: search + internal scroll, active selection pinned. -->
          <input
            type="search"
            value={optionQuery[field.key] ?? ""}
            oninput={(e) => {
              optionQuery = {
                ...optionQuery,
                [field.key]: (e.currentTarget as HTMLInputElement).value,
              };
            }}
            placeholder="{field.label} suchen…"
            aria-label="{field.label} suchen"
            class="w-full {CONTROL}"
          />
          <div
            class="max-h-[242px] overflow-y-auto rounded-[10px] border border-hairline"
            role="group"
            aria-label={field.label}
          >
            {#each visibleOptions(field) as opt (opt.value)}
              {@const on = effectiveEnum(field.key).includes(opt.value)}
              <label
                class="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-sm text-ink-700 transition-colors hover:bg-secondary md:min-h-10"
              >
                <input
                  type="checkbox"
                  class="size-4 shrink-0 rounded border-hairline accent-primary"
                  checked={on}
                  onchange={() => toggleEnum(field.key, opt.value)}
                />
                <span class="truncate">{opt.label}</span>
              </label>
            {:else}
              <p class="px-3 py-3 text-sm text-ink-500">Keine Treffer</p>
            {/each}
          </div>
        {:else if field.type === "enum-multi"}
          <!-- Short enum: wrap pills, multi-select. -->
          <div class="flex flex-wrap gap-1.5" role="group" aria-label={field.label}>
            {#each field.options ?? [] as opt (opt.value)}
              <TogglePill
                label={opt.label}
                pressed={effectiveEnum(field.key).includes(opt.value)}
                onToggle={() => toggleEnum(field.key, opt.value)}
              />
            {:else}
              <span class="text-sm text-ink-500">Keine Optionen</span>
            {/each}
          </div>
        {:else if field.type === "member-picker"}
          <Combobox
            options={memberOptions.map((m) => ({ value: m.id, label: m.label }))}
            value={[filterState.members[field.key]].filter(
              (v): v is string => v !== undefined,
            )}
            multiple={false}
            ariaLabel={field.label}
            placeholder="{field.label} wählen…"
            onValueChange={(v) => setMember(field.key, v[0])}
          />
        {:else if field.type === "amount-range"}
          <div class="flex items-end gap-2">
            <label class="flex flex-1 flex-col gap-1 text-xs">
              <span class="text-ink-500">Min (€)</span>
              <input
                type="text"
                inputmode="decimal"
                aria-label="{field.label} minimum"
                placeholder="0,00"
                value={centsToEurosInput(filterState.amount.betragMin)}
                class="w-full tabular-nums {CONTROL}"
                onchange={(e) =>
                  setAmount(
                    "betragMin",
                    (e.currentTarget as HTMLInputElement).value,
                  )}
              />
            </label>
            <label class="flex flex-1 flex-col gap-1 text-xs">
              <span class="text-ink-500">Max (€)</span>
              <input
                type="text"
                inputmode="decimal"
                aria-label="{field.label} maximum"
                placeholder="0,00"
                value={centsToEurosInput(filterState.amount.betragMax)}
                class="w-full tabular-nums {CONTROL}"
                onchange={(e) =>
                  setAmount(
                    "betragMax",
                    (e.currentTarget as HTMLInputElement).value,
                  )}
              />
            </label>
          </div>
        {/if}
      </section>
    {/if}
  {/each}
{/snippet}

{#snippet filterCountBadge()}
  {#if activeFieldCount > 0}
    <span
      aria-hidden="true"
      class="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary-strong px-1.5 text-xs font-medium text-primary-foreground"
    >
      {activeFieldCount}
    </span>
  {/if}
{/snippet}

{#snippet csvLink(extraClass: string)}
  {#if exportHref}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a
      href={exportHref}
      data-testid="export-cta"
      title="Gefilterte und sortierte Liste vollständig herunterladen (alle Seiten)"
      class="{CONTROL_BUTTON} {extraClass}"
    >
      <svg
        class="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 15V3" /><path
          d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        /><path d="m7 10 5 5 5-5" />
      </svg>CSV
    </a>
  {/if}
{/snippet}

<ListToolbar hasChips={activeChips.length > 0}>
  {#snippet leading()}
    <input
      type="search"
      value={filterState.search ?? ""}
      placeholder="Suchen…"
      aria-label="Suchen"
      class="w-full {CONTROL} md:w-56"
      onchange={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
    />

    <!-- Desktop: the sections live in a capped popover. -->
    <div class="hidden md:block">
      <Popover.Root>
        <Popover.Trigger data-slot="filter-trigger" class={CONTROL_BUTTON}>
          + Filter
          {@render filterCountBadge()}
        </Popover.Trigger>
        <Popover.Content
          class="flex max-h-[min(70vh,640px)] w-[380px] flex-col p-0"
        >
          <div
            class="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2"
          >
            <span class="text-sm font-semibold text-ink-900">Filter</span>
            <button
              type="button"
              class="rounded px-1 text-sm text-ink-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              disabled={!hasActiveFilters}
              onclick={resetAll}>Zurücksetzen</button
            >
          </div>
          <div class="flex flex-col gap-4 overflow-y-auto p-3">
            {@render sections()}
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>

    <!-- Mobile (<md): the same sections in a bottom sheet. -->
    <div class="md:hidden">
      <Sheet.Root bind:open={sheetOpen}>
        <Sheet.Trigger data-slot="filter-trigger" class={CONTROL_BUTTON}>
          + Filter
          {@render filterCountBadge()}
        </Sheet.Trigger>
        <Sheet.Content side="bottom" class="max-h-[85vh] gap-0 p-0">
          <Sheet.Header class="shrink-0 border-b border-hairline">
            <Sheet.Title>Filter</Sheet.Title>
            <Sheet.Description>
              Filter für {TAB_LABEL[tab]} auswählen.
            </Sheet.Description>
          </Sheet.Header>
          <div class="flex flex-col gap-4 overflow-y-auto p-4">
            {@render sections()}
          </div>
          <Sheet.Footer class="shrink-0 gap-2 border-t border-hairline">
            <!-- CSV has no room in the mobile toolbar, so it lives here. -->
            {@render csvLink("w-full justify-center")}
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="{CONTROL_BUTTON} flex-1 justify-center disabled:opacity-40"
                disabled={!hasActiveFilters}
                onclick={resetAll}>Zurücksetzen</button
              >
              <button
                type="button"
                class="inline-flex h-11 min-h-11 flex-1 items-center justify-center rounded-[10px] bg-primary-strong px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onclick={() => (sheetOpen = false)}>Fertig</button
              >
            </div>
          </Sheet.Footer>
        </Sheet.Content>
      </Sheet.Root>
    </div>

    <span data-testid="filter-count-badge" class="sr-only" aria-live="polite">
      {#if activeFieldCount > 0}
        {activeFieldCount} aktive Filter
      {/if}
    </span>

    <!-- Saved views -->
    <Popover.Root bind:open={viewsOpen}>
      <Popover.Trigger class={CONTROL_BUTTON}>
        Ansichten
        <span aria-hidden="true">▾</span>
      </Popover.Trigger>
      <Popover.Content class="w-72 p-1">
        <ul class="flex flex-col">
          {#each views as view (view.id)}
            <li class="flex items-center gap-1">
              <button
                type="button"
                class="min-h-11 flex-1 rounded-[10px] px-2 text-left text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10"
                onclick={() => applyView(view)}>{view.name}</button
              >
              {#if !view.readonly}
                <button
                  type="button"
                  aria-label="{view.name} löschen"
                  class="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-sm text-ink-500 hover:text-severity-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 md:min-w-10"
                  onclick={() => removeView(view)}>×</button
                >
              {/if}
            </li>
          {:else}
            <li class="px-2 py-1.5 text-sm text-ink-500">Keine Ansichten</li>
          {/each}
          <li class="mt-1 flex items-center gap-1 border-t border-hairline pt-2">
            <input
              type="text"
              bind:value={newViewName}
              placeholder="Aktuelle Filter speichern als…"
              aria-label="Name der Ansicht"
              class="min-w-0 flex-1 {CONTROL}"
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveCurrentView();
                }
              }}
            />
            <button
              type="button"
              class="{CONTROL_BUTTON} disabled:opacity-40"
              disabled={newViewName.trim() === ""}
              onclick={saveCurrentView}>Speichern</button
            >
          </li>
        </ul>
      </Popover.Content>
    </Popover.Root>
  {/snippet}

  {#snippet meta()}
    {#if showResultMeta}
      {resultCount} von {totalCount}
    {/if}
  {/snippet}

  {#snippet actions()}
    {@render csvLink("max-md:hidden")}
    {#if pageActions}{@render pageActions()}{/if}
  {/snippet}

  {#snippet chips()}
    {#each activeChips as chip (chip.key)}
      <MultiselectChip
        label={chip.fieldLabel}
        value={chip.valueLabel}
        onRemove={chip.onRemove}
      />
    {/each}
    <!-- "Zurücksetzen" belongs to the chips, not to the resting toolbar: with no
         filter active there is nothing to reset, so a permanently disabled
         button would just be noise (spec §3). -->
    <button
      type="button"
      class="rounded px-1 text-sm font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onclick={resetAll}>Zurücksetzen</button
    >
  {/snippet}
</ListToolbar>
