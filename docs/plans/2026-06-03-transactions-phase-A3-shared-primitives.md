# Transactions Track A3 — Shared UI Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`. This is a **Tier-A, dependency-free track** (see ROADMAP parallelization map) — it can run concurrently with Phase 1 and Phase 2's pure engine. **It must merge before** Phase 2's `FilterBar` (B1) and Phase 3's forms/scaffold (B3), which consume these primitives. Branch: `feat/transactions-three-tabs-v2`.

**Goal:** Add the shadcn/bits-ui-style UI primitives the filter bar + entry forms need and that `src/lib/components/ui/` currently lacks: **`popover`/`combobox`**, **`tooltip`**, **`pagination`**, **`multiselect-chip`**. (Spec §13 "primitives to add".) **Do NOT build a money-input or date-field — `ui/money` and `ui/date-field` already exist; reuse them.**

**Architecture:** Each primitive follows the **existing `ui/*` conventions** in this repo (bits-ui-backed where a bits-ui primitive exists — e.g. `ui/dialog`, `ui/sheet`, `ui/dropdown-menu` are bits-ui shadcn wrappers; mirror their file shape: an `index.ts` barrel + the `.svelte` parts, `data-slot` attributes, Tailwind classes, `WithElementRef` prop typing). `combobox` builds on `popover` + a filterable list; `multiselect-chip` is a thin presentational chip + remove-button used by `FilterBar`. Keep each primitive **dumb/presentational** — no app state, no DB, no `$app/*` imports — so they're trivially testable and reusable.

**Tech Stack:** SvelteKit, bits-ui (already a dep — confirm the installed version + API before building), Tailwind, `@testing-library/svelte`. **Model:** `[model: sonnet]` for all tasks (well-bounded, convention-following) **except Task 2 combobox** `[model: opus]` (keyboard/a11y + popover composition).

**Testing approach:** component render/interaction tests run on the **reset lane** (`pnpm test --run <file>`) because they mount Svelte + need `setupFiles` (the bits-ui body-scroll-lock stub). Pure helpers (if any) use `pnpm test:fast`. One file per step.

**Pre-step (all tasks):** read an existing bits-ui wrapper for the exact local convention — `src/lib/components/ui/dropdown-menu/` (closest to popover/combobox) and `src/lib/components/ui/dialog/` — and match their structure (barrel exports, `data-slot`, class-merge `cn()` util, prop typing). Confirm `bits-ui` exposes `Popover`/`Tooltip` primitives in the installed version; if not, fall back to a minimal custom implementation with the same public API.

---

### Task 1: `ui/popover` `[model: sonnet]`

**Files:** Create `src/lib/components/ui/popover/{index.ts,popover-content.svelte}` (wrap bits-ui `Popover` like `ui/dialog` wraps `Dialog`); Test `src/lib/components/ui/popover/popover.test.ts`

- [ ] **Step 1: Failing test** — opening the trigger shows the content; Escape/outside-click closes it; focus returns to the trigger.

```ts
// popover.test.ts
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import PopoverHarness from "./popover.test.svelte"; // mounts Root+Trigger+Content with a "hello" body
describe("ui/popover", () => {
  it("opens on trigger click and closes on Escape", async () => {
    const u = userEvent.setup();
    render(PopoverHarness);
    await u.click(screen.getByRole("button", { name: /open/i }));
    expect(await screen.findByText("hello")).toBeTruthy();
    await u.keyboard("{Escape}");
    expect(screen.queryByText("hello")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run src/lib/components/ui/popover/popover.test.ts`
- [ ] **Step 3: Implement** the barrel (`Root`, `Trigger`, `Content`, `Portal`, `Close`) re-exporting bits-ui `Popover` + a styled `PopoverContent` (`data-slot="popover-content"`, `cn()` classes mirroring `DialogContent`). Add the test harness `popover.test.svelte`.
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): popover primitive (bits-ui wrapper)"`

---

### Task 2: `ui/combobox` `[model: opus]`

Filterable single/multi select over `popover` — the "+ Filter" field menu + member-picker + kategorie picker bind to this.

**Files:** Create `src/lib/components/ui/combobox/{index.ts,combobox.svelte}`; Test `src/lib/components/ui/combobox/combobox.test.ts`

- [ ] **Step 1: Failing test** — typing filters the options; arrow keys move the active option; Enter selects; `multiple` mode toggles + keeps the popover open; `onValueChange` fires with the selected value(s).

```ts
// combobox.test.ts — render with options=[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}]
it("filters by query and selects with keyboard", async () => {
  const u = userEvent.setup();
  const onValueChange = vi.fn();
  render(Combobox, {
    props: {
      options,
      value: [],
      multiple: true,
      onValueChange,
      placeholder: "Suchen…",
    },
  });
  await u.click(screen.getByRole("button"));
  await u.type(screen.getByRole("combobox"), "be");
  expect(screen.queryByText("Alpha")).toBeNull(); // filtered out
  await u.keyboard("{ArrowDown}{Enter}");
  expect(onValueChange).toHaveBeenCalledWith(["b"]);
});
```

- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement** contract:

```ts
interface ComboboxProps {
  options: { value: string; label: string }[];
  value: string[]; // selected (single = length 0/1)
  onValueChange: (v: string[]) => void;
  multiple?: boolean; // default false
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
}
```

Uses `ui/popover` for the dropdown; an internal `<input role="combobox">` filters `options` by `label` (case-insensitive `includes`); `role="listbox"`/`option` with `aria-selected`; full Up/Down/Home/End/Enter/Escape keyboard nav; ≥44px option targets. Single mode closes on select; `multiple` keeps open + toggles.

- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): combobox primitive (filterable single/multi select on popover)"`

---

### Task 3: `ui/multiselect-chip` `[model: sonnet]`

The removable active-filter chip used by `FilterBar`.

**Files:** Create `src/lib/components/ui/multiselect-chip/{index.ts,multiselect-chip.svelte}`; Test `…/multiselect-chip.test.ts`

- [ ] **Step 1: Failing test** — renders `label: value`; clicking the × (or Backspace when focused) calls `onRemove`; the × has a 44px target + an accessible name.

```ts
it("removes on × click and on Backspace when focused", async () => {
  const u = userEvent.setup();
  const onRemove = vi.fn();
  render(MultiselectChip, {
    props: { label: "Status", value: "Genehmigt", onRemove },
  });
  await u.click(screen.getByRole("button", { name: /entfernen/i }));
  expect(onRemove).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement** props `{ label: string; value: string; onRemove: () => void }` → a pill (`data-slot="filter-chip"`) showing `label` (muted) + `value` (medium) + an `aria-label="… entfernen"` × button; `onkeydown` Backspace/Delete → `onRemove`; focusable.
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): multiselect-chip (removable filter chip)"`

---

### Task 4: `ui/tooltip` `[model: sonnet]`

For truncation-with-tooltip (long member names / Bezeichnung — spec §13 a11y).

**Files:** Create `src/lib/components/ui/tooltip/{index.ts,tooltip-content.svelte}` (wrap bits-ui `Tooltip`); Test `…/tooltip.test.ts`

- [ ] **Step 1: Failing test** — hover/focus on the trigger reveals the content with `role="tooltip"`; blur hides it.
- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement** barrel (`Root/Provider/Trigger/Content`) re-exporting bits-ui `Tooltip` + styled `TooltipContent` (`data-slot="tooltip-content"`). Keyboard-focus triggers it (not just hover), for a11y.
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): tooltip primitive (bits-ui wrapper)"`

---

### Task 5: `ui/pagination` `[model: sonnet]`

For the list scaffold (server pages from `listXPage`).

**Files:** Create `src/lib/components/ui/pagination/{index.ts,pagination.svelte}`; Test `…/pagination.test.ts`

- [ ] **Step 1: Failing test** — given `{ page: 2, pageSize: 50, total: 230 }` renders "51–100 von 230", a disabled Prev on page 1, and calls `onPageChange(3)` on Next.

```ts
it("computes range + paginates", async () => {
  const u = userEvent.setup();
  const onPageChange = vi.fn();
  render(Pagination, {
    props: { page: 2, pageSize: 50, total: 230, onPageChange },
  });
  expect(screen.getByText(/51.*100.*230/)).toBeTruthy();
  await u.click(screen.getByRole("button", { name: /weiter|next/i }));
  expect(onPageChange).toHaveBeenCalledWith(3);
});
```

- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement** props `{ page: number; pageSize: number; total: number; onPageChange: (p: number) => void }`; computes `from = (page-1)*pageSize+1`, `to = min(page*pageSize, total)`, `pages = ceil(total/pageSize)`; ‹ Prev / Weiter › buttons (disabled at bounds) + "X–Y von Z"; ≥44px targets; `aria-label`s. Renders nothing when `total <= pageSize`.
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): pagination primitive (range + prev/next)"`

---

### Task 6: Boundary `[model: sonnet]`

- [ ] **Step 1: Run all A3 component tests.** `pnpm test --run src/lib/components/ui/popover/popover.test.ts src/lib/components/ui/combobox/combobox.test.ts src/lib/components/ui/multiselect-chip/multiselect-chip.test.ts src/lib/components/ui/tooltip/tooltip.test.ts src/lib/components/ui/pagination/pagination.test.ts`
- [ ] **Step 2: Typecheck + lint.** `pnpm check && pnpm lint`
- [ ] **Step 3: Tag.** `git tag -f track-a3-primitives-complete`

Primitives ready. Phase 2's `FilterBar` (combobox + multiselect-chip + popover) and Phase 3's forms/scaffold (tooltip + pagination) can now consume them.

---

## Self-Review

1. **Scope:** covers exactly the spec §13 "to add" set (popover/combobox, tooltip, pagination, multiselect-chip); explicitly excludes money/date-field (already exist). ✓
2. **No placeholders:** each task has a concrete contract + a real interaction test; the "match existing bits-ui wrapper convention" pre-step grounds the implementation in `ui/dialog`/`ui/dropdown-menu`. ✓
3. **Dependency-free:** no imports from `$app/*`, `$lib/server/*`, or the domain — pure presentational, so this track runs in Tier A concurrently and merges before B1/B3. ✓
4. **Test lane:** component mounts on the reset lane (need setupFiles); flagged. `userEvent` is available (`@testing-library/user-event` — confirm it's a devDep during impl; if not, use fireEvent).
