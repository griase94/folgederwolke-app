# Transactions Phase 1 — Foundation (data layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read the ROADMAP (`docs/plans/2026-06-03-transactions-ROADMAP.md`) and spec (`docs/specs/2026-06-03-transactions-three-tabs-design.md`) first. **Phase 0 (rebase onto origin/main) must be done before Task 1.** (Rev 2 — incorporates the independent-review findings.)

**Goal:** Establish the data foundation for the three-tab redesign — new donation/expense columns + `wertermittlung_methode` enum, mandatory `kategorie_id` (NOT NULL across **every** write path: app forms, approval, importer, donations), the sphere + donation-Kategorie derivation helpers, the kategorien reseed (derivation lookup + sentinel), a fast pure-unit test lane, and a valuable showcase seed corpus — on a clean (wiped) base.

**Architecture:** Three sequential migrations (additive → wipe → constrain) since all data is disposable test data pre-launch (spec §3/§15). Pure, unit-tested domain helpers. **All four insert paths** (createExpense/createIncome/createDonation, approveSubmission, the importer) resolve a non-null `kategorie_id` before NOT NULL lands. Showcase corpus added to `seed-fixtures.ts`.

**Tech Stack:** SvelteKit, Drizzle ORM, Postgres (Neon), Vitest (forks, single-fork, `globalSetup` resets the DB once per `vitest run`), hand-written SQL migrations.

**Testing approach (per ROADMAP):** run one file/test per step, cheapest-first. **Pure-logic tests use the new no-reset fast lane (`pnpm test:fast <file>`, Task 2)** so they cost <1s instead of a ~3-6s DB reset. DB/integration tests use `pnpm test --run <file>` (each such invocation triggers exactly one full reset via `globalSetup`). Reserve `pnpm lint` + `pnpm check` + the broader regression subset for the phase boundary (Task 12). Never bare `pnpm test` mid-step.

**Migration numbering:** confirm the highest `drizzle/NNNN_*.sql` after rebase (expected `0028`) → this plan uses `0029/0030/0031`. Shift all three + the `_journal.json` `idx`/`tag` if different.

**Sentinel category:** one row **"Unkategorisiert (Import)"** seeded for both `kind='expense'` and `kind='income'` (Task 5). It is the non-null fallback for the **importer** (Task 8) and, interim, the **approval path** (Task 9). Phase 4 replaces the approval fallback with a required Kategorie picker; the importer keeps it permanently.

---

### Task 1: New enum + additive columns (migration 0029 + schema) `[model: opus]`

**Files:**

- Create: `drizzle/0029_transactions_redesign_additive.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/server/db/schema/enums.ts`, `donations.ts`, `expenses.ts`
- Test: `tests/unit/migration-0029-additive.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/migration-0029-additive.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";

describe("migration 0029 — additive columns", () => {
  it("adds wertermittlung_methode enum + donation/expense columns", async () => {
    const db = getDb();
    const cols = await db.execute<{
      table_name: string;
      column_name: string;
    }>(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'donations' AND column_name IN ('wertermittlung_methode','zustand_beschreibung','herkunftsbeleg_file_id'))
         OR (table_name = 'expenses'  AND column_name = 'beleg_verzicht_grund')`);
    const names = (cols as { table_name: string; column_name: string }[]).map(
      (c) => `${c.table_name}.${c.column_name}`,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "donations.wertermittlung_methode",
        "donations.zustand_beschreibung",
        "donations.herkunftsbeleg_file_id",
        "expenses.beleg_verzicht_grund",
      ]),
    );
    const ev = await db.execute<{ enumlabel: string }>(sql`
      SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE t.typname='wertermittlung_methode' ORDER BY e.enumsortorder`);
    expect((ev as { enumlabel: string }[]).map((r) => r.enumlabel)).toEqual([
      "marktpreis",
      "kaufbeleg",
      "schaetzung",
      "buchwert",
    ]);
  });
});
```

- [ ] **Step 2: Write the migration SQL.**

```sql
-- drizzle/0029_transactions_redesign_additive.sql
CREATE TYPE "wertermittlung_methode" AS ENUM ('marktpreis', 'kaufbeleg', 'schaetzung', 'buchwert');--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "wertermittlung_methode" "wertermittlung_methode";--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "zustand_beschreibung" text;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "herkunftsbeleg_file_id" uuid REFERENCES "files"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "beleg_verzicht_grund" text;
```

- [ ] **Step 3: Append the journal entry** (`drizzle/meta/_journal.json`, `entries` array). Use a fixed epoch greater than the last entry (no `Date.now()`):

```json
{
  "idx": 29,
  "version": "7",
  "when": 1751500000000,
  "tag": "0029_transactions_redesign_additive",
  "breakpoints": true
}
```

- [ ] **Step 4: Mirror in Drizzle schema.**

```ts
// enums.ts
export const wertermittlungMethodeEnum = pgEnum("wertermittlung_methode", [
  "marktpreis",
  "kaufbeleg",
  "schaetzung",
  "buchwert",
]);
```

```ts
// donations.ts — import { wertermittlungMethodeEnum } + ensure files imported; add columns:
wertermittlungMethode: wertermittlungMethodeEnum("wertermittlung_methode"),
zustandBeschreibung: text("zustand_beschreibung"),
herkunftsbelegFileId: uuid("herkunftsbeleg_file_id").references(() => files.id, { onDelete: "restrict" }),
```

```ts
// expenses.ts — add column:
belegVerzichtGrund: text("beleg_verzicht_grund"),
```

- [ ] **Step 5: Run the test.**

Run: `pnpm test --run tests/unit/migration-0029-additive.test.ts`
Expected: `1 passed` (one DB reset via globalSetup, then this file).

- [ ] **Step 6: Commit.**

```bash
git add drizzle/0029_transactions_redesign_additive.sql drizzle/meta/_journal.json \
        src/lib/server/db/schema/enums.ts src/lib/server/db/schema/donations.ts src/lib/server/db/schema/expenses.ts \
        tests/unit/migration-0029-additive.test.ts
git commit -m "feat(db): additive cols for tx redesign — wertermittlung_methode enum + donation Wertermittlung + expense beleg_verzicht_grund (0029)"
```

---

### Task 2: Fast pure-unit test lane (no DB reset) `[model: opus]`

Opus: test-infra change that must not break the existing harness. Pays off for every pure test in every phase.

**Files:**

- Create: `vitest.fast.config.ts`
- Modify: `package.json` (add `test:fast` script)

- [ ] **Step 1: Create a config identical to `vitest.config.ts` but WITHOUT `globalSetup`** (so no DB reset). Keep the sveltekit plugin + browser conditions + happy-dom so `$lib` aliases and any component imports still resolve.

```ts
// vitest.fast.config.ts — for PURE-LOGIC tests only (no DB). Run: pnpm test:fast <file>
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: { conditions: ["browser"] },
  test: {
    environment: "happy-dom",
    globals: true,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // NO globalSetup — these tests must not touch the DB.
  },
});
```

- [ ] **Step 2: Add the script** to `package.json` `scripts`:

```json
"test:fast": "vitest run --config vitest.fast.config.ts --passWithNoTests",
```

- [ ] **Step 3: Smoke it against an existing pure test** to prove no reset happens and it resolves `$lib`.

Run: `pnpm test:fast --run src/lib/domain/year.test.ts` (or any existing pure test under `src/lib/domain`; if none, defer this smoke to Task 3 Step 4)
Expected: passes in <1s, and the output does NOT show the `reset-test-db` banner.

- [ ] **Step 4: Commit.**

```bash
git add vitest.fast.config.ts package.json
git commit -m "test: add no-reset fast lane (test:fast) for pure-logic unit tests"
```

---

### Task 3: `kategorieSphere()` helper (pure) `[model: sonnet]`

**Files:** Modify `src/lib/domain/sphere.ts`; Test `tests/unit/kategorie-sphere.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/kategorie-sphere.test.ts
import { describe, it, expect } from "vitest";
import { kategorieSphere } from "$lib/domain/sphere.js";
const KATS = [
  { name: "Eintritt", sphere: "zweckbetrieb" as const },
  { name: "Bar-Umsatz", sphere: "wirtschaftlich" as const },
  { name: "Bankgebühren", sphere: "ideeller" as const },
];
describe("kategorieSphere", () => {
  it("returns the kategorie's sphere by name", () => {
    expect(kategorieSphere(KATS, "Eintritt")).toBe("zweckbetrieb");
    expect(kategorieSphere(KATS, "Bar-Umsatz")).toBe("wirtschaftlich");
  });
  it("falls back to 'ideeller' for an unknown kategorie", () => {
    expect(kategorieSphere(KATS, "Nope")).toBe("ideeller");
  });
});
```

- [ ] **Step 2: Run via the fast lane to verify it fails.**

Run: `pnpm test:fast --run tests/unit/kategorie-sphere.test.ts`
Expected: FAIL — `kategorieSphere is not a function`.

- [ ] **Step 3: Implement** in `src/lib/domain/sphere.ts`.

```ts
/** Strict kategorie → sphere (spec §4.5). NEVER consults a project sphere_default. */
export function kategorieSphere(
  kategorien: readonly { name: string; sphere: Sphere }[],
  kategorieName: string,
): Sphere {
  const match = kategorien.find((k) => k.name === kategorieName);
  return match ? match.sphere : "ideeller";
}
```

- [ ] **Step 4: Run via the fast lane to verify it passes.**

Run: `pnpm test:fast --run tests/unit/kategorie-sphere.test.ts`
Expected: `2 passed`, <1s, no reset banner.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/sphere.ts tests/unit/kategorie-sphere.test.ts
git commit -m "feat(domain): kategorieSphere() — strict kategorie-derived sphere, no project override (spec §4.5)"
```

---

### Task 4: Donation-Kategorie derivation (pure) `[model: sonnet]`

**Files:** Create `src/lib/domain/spenden-kategorie.ts`; Test `tests/unit/spenden-kategorie.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/spenden-kategorie.test.ts
import { describe, it, expect } from "vitest";
import { deriveDonationKategorieName } from "$lib/domain/spenden-kategorie.js";
describe("deriveDonationKategorieName", () => {
  it("maps Geldspende by Zweckbindung", () => {
    expect(deriveDonationKategorieName("geldspende", "zweckfrei")).toBe(
      "Geldspende zweckfrei",
    );
    expect(deriveDonationKategorieName("geldspende", "zweckgebunden")).toBe(
      "Geldspende zweckgebunden",
    );
  });
  it("maps Sachspende regardless of Zweckbindung", () => {
    expect(deriveDonationKategorieName("sachspende", "zweckfrei")).toBe(
      "Sachspende",
    );
    expect(deriveDonationKategorieName("sachspende", "zweckgebunden")).toBe(
      "Sachspende",
    );
  });
});
```

- [ ] **Step 2: Run via fast lane → fails.**

Run: `pnpm test:fast --run tests/unit/spenden-kategorie.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// src/lib/domain/spenden-kategorie.ts
export type SpendeKind = "geldspende" | "sachspende" | "aufwandsspende";
export type ZweckbindungKind = "zweckfrei" | "zweckgebunden";
/** (Spendenart, Zweckbindung) → seeded income-Kategorie name (spec §4.3/§4.4). */
export function deriveDonationKategorieName(
  spendeKind: SpendeKind,
  zweckbindungKind: ZweckbindungKind,
): string {
  if (spendeKind === "sachspende") return "Sachspende";
  if (spendeKind === "aufwandsspende") return "Aufwandsspende"; // Phase 2
  return zweckbindungKind === "zweckgebunden"
    ? "Geldspende zweckgebunden"
    : "Geldspende zweckfrei";
}
```

- [ ] **Step 4: Run via fast lane → passes.**

Run: `pnpm test:fast --run tests/unit/spenden-kategorie.test.ts`
Expected: `2 passed`, <1s.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/spenden-kategorie.ts tests/unit/spenden-kategorie.test.ts
git commit -m "feat(domain): deriveDonationKategorieName() — Spendenart+Zweckbindung → kategorie name"
```

---

### Task 5: Seed derivation categories + Import sentinel `[model: sonnet]`

**Files:** Modify `scripts/seed.ts`; Test `tests/unit/seed-kategorien.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/seed-kategorien.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { eq, and } from "drizzle-orm";
async function exists(kind: string, name: string) {
  const db = getDb();
  const r = await db
    .select({ id: kategorien.id })
    .from(kategorien)
    .where(and(eq(kategorien.kind, kind), eq(kategorien.name, name)))
    .limit(1);
  return r.length === 1;
}
describe("seed: donation-derivation + import sentinel", () => {
  it("seeds three donation kategorien (income, ideeller)", async () => {
    expect(await exists("income", "Geldspende zweckfrei")).toBe(true);
    expect(await exists("income", "Geldspende zweckgebunden")).toBe(true);
    expect(await exists("income", "Sachspende")).toBe(true);
  });
  it("seeds the import sentinel for both kinds", async () => {
    expect(await exists("expense", "Unkategorisiert (Import)")).toBe(true);
    expect(await exists("income", "Unkategorisiert (Import)")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fails.**

Run: `pnpm test --run tests/unit/seed-kategorien.test.ts`
Expected: FAIL — rows missing.

- [ ] **Step 3: Extend `EINNAHMEN_KATEGORIEN`** in `scripts/seed.ts`:

```ts
  { name: "Geldspende zweckfrei", sphere: "ideeller" },
  { name: "Geldspende zweckgebunden", sphere: "ideeller" },
  { name: "Sachspende", sphere: "ideeller" },
```

Then after the kategorien insert loops, add the sentinel for both kinds:

```ts
for (const kind of ["expense", "income"] as const) {
  await db
    .insert(schema.kategorien)
    .values({
      kind,
      name: "Unkategorisiert (Import)",
      sphere: "ideeller",
      sortOrder: 999,
    })
    .onConflictDoUpdate({
      target: [schema.kategorien.kind, schema.kategorien.name],
      set: { sphere: "ideeller", updatedAt: new Date() },
    });
}
```

- [ ] **Step 4: Run → passes.**

Run: `pnpm test --run tests/unit/seed-kategorien.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit.**

```bash
git add scripts/seed.ts tests/unit/seed-kategorien.test.ts
git commit -m "feat(seed): donation-derivation kategorien + Unkategorisiert (Import) sentinel"
```

---

### Task 6: `createDonation` derives Kategorie + sphere `[model: opus]`

Opus: derive-and-resolve correctness + signature change with the real caller.

**Files:** Modify `src/lib/server/domain/transactions.ts`; Modify the caller `src/routes/app/transactions/neu/+page.server.ts`; Test `tests/unit/create-donation-derivation.test.ts`

- [ ] **Step 1: Write the failing test** (integration; uses the real `allocateBusinessId`).

```ts
// tests/unit/create-donation-derivation.test.ts
import { describe, it, expect } from "vitest";
import { createDonation } from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { eq } from "drizzle-orm";

describe("createDonation derives kategorie + sphere", () => {
  it("zweckgebunden Geldspende → 'Geldspende zweckgebunden', ideeller, kategorie_id set", async () => {
    const businessId = await allocateBusinessId("donation", 2026); // verify prefix/signature in id-allocator.ts during impl
    const { id } = await createDonation({
      betragCents: 25000,
      spendeKind: "geldspende",
      zweckbindungKind: "zweckgebunden",
      zweckbindungText: "Notenständer",
      spenderName: "Test Spender",
      actorUserId: "00000000-0000-0000-0000-000000000000",
      businessId,
    });
    const db = getDb();
    const [row] = await db
      .select()
      .from(donations)
      .where(eq(donations.id, id))
      .limit(1);
    expect(row.kategorieNameSnapshot).toBe("Geldspende zweckgebunden");
    expect(row.sphereSnapshot).toBe("ideeller");
    expect(row.kategorieId).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run → fails.**

Run: `pnpm test --run tests/unit/create-donation-derivation.test.ts`
Expected: FAIL — snapshot is the caller's value / `kategorieId` null.

- [ ] **Step 3: Implement.** In `transactions.ts`: add and **export** a reusable resolver, import `deriveDonationKategorieName` + `kategorien` + `and`/`eq` if missing:

```ts
export async function resolveKategorieByName(
  kind: "expense" | "income",
  name: string,
) {
  const db = getDb();
  const [row] = await db
    .select({
      id: kategorien.id,
      sphere: kategorien.sphere,
      name: kategorien.name,
    })
    .from(kategorien)
    .where(and(eq(kategorien.kind, kind), eq(kategorien.name, name)))
    .limit(1);
  if (!row) throw new Error(`Kategorie not found: ${kind}/${name}`);
  return row;
}
```

In `createDonation`, before the insert, derive + resolve (overriding any caller-passed kategorie/sphere):

```ts
const kategorieName = deriveDonationKategorieName(
  input.spendeKind ?? "geldspende",
  input.zweckbindungKind ?? "zweckfrei",
);
const kat = await resolveKategorieByName("income", kategorieName);
// in .values({...}): kategorieId: kat.id, kategorieNameSnapshot: kat.name, sphereSnapshot: "ideeller",
```

In the caller `src/routes/app/transactions/neu/+page.server.ts` (the **only** `createDonation` caller — the `?/create` action ~line 208): stop passing/relying on a hand-derived `kategorieNameSnapshot`/`kategorieId` for donations (remove the `"Spende"`-lookup logic ~lines 395-405); pass `spendeKind` + `zweckbindungKind` + `zweckbindungText` and let `createDonation` derive. Leave `CreateDonationInput`'s `kategorieId`/`kategorieNameSnapshot`/`sphereSnapshot` fields optional-and-ignored (or remove them).

- [ ] **Step 4: Run → passes.**

Run: `pnpm test --run tests/unit/create-donation-derivation.test.ts`
Expected: `1 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/server/domain/transactions.ts src/routes/app/transactions/neu/+page.server.ts tests/unit/create-donation-derivation.test.ts
git commit -m "feat(donations): createDonation derives kategorie+sphere from Spendenart/Zweckbindung"
```

---

### Task 7: `createExpense` / `createIncome` resolve a non-null Kategorie `[model: opus]`

Opus: closes a NOT-NULL-violation path (the app forms insert null `kategorie_id` today — review finding S1).

**Files:** Modify `src/lib/server/domain/transactions.ts` (both create fns); Test `tests/unit/create-expense-income-kategorie.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/create-expense-income-kategorie.test.ts
import { describe, it, expect } from "vitest";
import {
  createExpense,
  createIncome,
} from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { eq } from "drizzle-orm";

const actor = "00000000-0000-0000-0000-000000000000";

describe("create expense/income resolve kategorie_id by name", () => {
  it("expense gets a non-null kategorie_id + derived sphere from 'Bankgebühren'", async () => {
    const businessId = await allocateBusinessId("expense", 2026);
    const { id } = await createExpense({
      bezeichnung: "Kontoführung",
      betragCents: 490,
      kategorieNameSnapshot: "Bankgebühren",
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Verein",
      belegVerzichtGrund: "Kontoführungsgebühr",
      actorUserId: actor,
      businessId,
    } as any); // sphereSnapshot now derived internally; cast until the input type is updated in this task
    const db = getDb();
    const [row] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id))
      .limit(1);
    expect(row.kategorieId).not.toBeNull();
    expect(row.sphereSnapshot).toBe("ideeller");
  });
  it("income gets a non-null kategorie_id + derived sphere from 'Eintritt'", async () => {
    const businessId = await allocateBusinessId("income", 2026);
    const { id } = await createIncome({
      bezeichnung: "Tickets",
      betragCents: 124000,
      kategorieNameSnapshot: "Eintritt",
      actorUserId: actor,
      businessId,
    } as any);
    const db = getDb();
    const [row] = await db
      .select()
      .from(income)
      .where(eq(income.id, id))
      .limit(1);
    expect(row.kategorieId).not.toBeNull();
    expect(row.sphereSnapshot).toBe("zweckbetrieb");
  });
});
```

- [ ] **Step 2: Run → fails.**

Run: `pnpm test --run tests/unit/create-expense-income-kategorie.test.ts`
Expected: FAIL — `kategorieId` null.

- [ ] **Step 3: Implement.** In `createExpense` and `createIncome`: when `input.kategorieId` is absent, resolve it from `input.kategorieNameSnapshot` via `resolveKategorieByName(kind, name)` (kind `"expense"`/`"income"`), and set `sphereSnapshot = kat.sphere` (strict, no override — spec §4.5). Update `CreateExpenseInput`/`CreateIncomeInput`: make `sphereSnapshot` optional (derived) and keep `kategorieNameSnapshot` required. Update the `neu/+page.server.ts` create action to pass `kategorieNameSnapshot` (it already collects it via `listKategorieOptions(kind)`) and stop passing a hand-computed sphere/override.

```ts
// inside createExpense (and analogously createIncome), before insert:
const kat = input.kategorieId
  ? await resolveKategorieById(input.kategorieId) // add a by-id variant, or
  : await resolveKategorieByName("expense", input.kategorieNameSnapshot);
// .values({...}): kategorieId: kat.id, kategorieNameSnapshot: kat.name, sphereSnapshot: kat.sphere,
```

(Add a small `resolveKategorieById` sibling if `kategorieId` may be passed directly; otherwise resolve by name only.)

- [ ] **Step 4: Run → passes.**

Run: `pnpm test --run tests/unit/create-expense-income-kategorie.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Run the existing tx/inbox domain tests (targeted) for regressions.**

Run: `pnpm test --run tests/unit/transactions.test.ts tests/unit/audit-inbox-actions.test.ts`
Expected: pass (or note breakage to fix in Task 9 — the inbox test is addressed there).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/server/domain/transactions.ts src/routes/app/transactions/neu/+page.server.ts tests/unit/create-expense-income-kategorie.test.ts
git commit -m "feat(tx): createExpense/createIncome resolve non-null kategorie_id + derive sphere by name"
```

---

### Task 8: Importer falls back to the sentinel (no null kategorie_id) `[model: opus]`

**Files:** Modify `src/lib/server/import/transform.ts` + `runner.ts`; update existing `tests/unit/import-transform.test.ts`; Test `tests/unit/import-kategorie-fallback.test.ts`

- [ ] **Step 1: Write the failing test** (export `resolveKategorie` from `transform.ts`).

```ts
// tests/unit/import-kategorie-fallback.test.ts
import { describe, it, expect } from "vitest";
import { resolveKategorie } from "$lib/server/import/transform.js";
describe("importer kategorie fallback", () => {
  it("unmatched expense resolves to the sentinel id (never null)", () => {
    const sentinel = "11111111-1111-1111-1111-111111111111";
    // adapt ctx to the real transform context shape during impl; the contract is: never null.
    const r = resolveKategorie(
      {
        kategorienByName: new Map(),
        sentinelExpenseKategorieId: sentinel,
      } as any,
      "expense",
      "Voll Unbekannt",
      null,
    );
    expect(r.kategorieId).toBe(sentinel);
  });
});
```

- [ ] **Step 2: Run → fails.**

Run: `pnpm test --run tests/unit/import-kategorie-fallback.test.ts`
Expected: FAIL — returns null / not exported.

- [ ] **Step 3: Implement.**
  - Export `resolveKategorie`; change its return type to `{ kategorieId: string; sphereSnapshot: Sphere; snapshot: string }` (non-null).
  - Unmatched branch: `kategorieId: ctx.sentinelExpenseKategorieId` / `sentinelIncomeKategorieId` (by kind).
  - Donation branch (~line 713): set `kategorieId: ctx.sentinelIncomeKategorieId` (keep `kategorieNameSnapshot: "Geldspende (Import)"`; these are `geldspende` so the Sachspende CHECK from Task 11 won't bite — note: do NOT import Sachspende rows without Wertermittlung).
  - Tighten `ExpenseInsert`/`IncomeInsert`/`DonationInsert.kategorieId` → `string`.
  - In `runner.ts`, resolve the two sentinel ids once (query `kategorien` by `kind` + `name='Unkategorisiert (Import)'`) and thread them into the transform context.

- [ ] **Step 4: Run → passes.**

Run: `pnpm test --run tests/unit/import-kategorie-fallback.test.ts`
Expected: `1 passed`.

- [ ] **Step 5: Update the existing importer test to the non-null contract, then run both explicit files.**

`tests/unit/import-transform.test.ts` currently asserts `kategorieId: null`; update those assertions to expect the sentinel id (or non-null). Then:

Run: `pnpm test --run tests/unit/import-transform.test.ts tests/unit/import-kategorie-fallback.test.ts`
Expected: both pass. (Do **not** use a `tests/unit/import` prefix — it also matches unrelated files.)

- [ ] **Step 6: Commit.**

```bash
git add src/lib/server/import/transform.ts src/lib/server/import/runner.ts tests/unit/import-transform.test.ts tests/unit/import-kategorie-fallback.test.ts
git commit -m "fix(import): fall back to Unkategorisiert (Import) sentinel — never insert null kategorie_id"
```

---

### Task 9: Approval path sets a non-null Kategorie `[model: opus]`

Opus: closes the live public-form→approve NOT-NULL-violation path (review blocker B2).

**Files:** Modify `src/lib/server/domain/audit-inbox-actions.ts` (`approveSubmission`); update `tests/unit/audit-inbox-actions.test.ts`

- [ ] **Step 1: Write/extend the failing test** — approving a submission produces an expense with a non-null `kategorie_id`.

```ts
// in tests/unit/audit-inbox-actions.test.ts — add:
it("approveSubmission sets a non-null kategorie_id (interim sentinel)", async () => {
  // arrange: seed a pending submission (reuse existing test's setup helper)
  // act: const { expenseId } = await approveSubmission({ submissionId, actorUserId: actor });
  // assert:
  const db = getDb();
  const [row] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);
  expect(row.kategorieId).not.toBeNull();
});
```

- [ ] **Step 2: Run → fails.**

Run: `pnpm test --run tests/unit/audit-inbox-actions.test.ts`
Expected: FAIL — `kategorieId` null on the approved expense.

- [ ] **Step 3: Implement.** In `approveSubmission` (`audit-inbox-actions.ts` ~lines 326-358), resolve the income/expense sentinel once (`resolveKategorieByName("expense", "Unkategorisiert (Import)")`) and set `kategorieId: sentinel.id`, keep `kategorieNameSnapshot: "(Unkategorisiert)"` (or set to the sentinel name). Add a code comment: "Interim — Phase 4 replaces this with a required Kategorie picker on approval (spec §4.6)."

- [ ] **Step 4: Run → passes.**

Run: `pnpm test --run tests/unit/audit-inbox-actions.test.ts`
Expected: pass.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/server/domain/audit-inbox-actions.ts tests/unit/audit-inbox-actions.test.ts
git commit -m "fix(inbox): approveSubmission sets non-null kategorie_id via sentinel (interim, Phase 4 adds picker)"
```

---

### Task 10: Wipe migration (0030) + constraints (0031) `[model: opus]`

**Files:** Create `drizzle/0030_transactions_wipe_disposable.sql`, `drizzle/0031_transactions_constraints.sql`; Modify `_journal.json`; Modify schema `kategorie_id` `.notNull()` on all three; Test `tests/unit/migration-0031-constraints.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/migration-0031-constraints.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
describe("migration 0031 — constraints", () => {
  it("kategorie_id is NOT NULL on all three tables", async () => {
    const db = getDb();
    const rows = await db.execute<{
      table_name: string;
      is_nullable: string;
    }>(sql`
      SELECT table_name, is_nullable FROM information_schema.columns
      WHERE column_name='kategorie_id' AND table_name IN ('expenses','income','donations')`);
    for (const r of rows as { table_name: string; is_nullable: string }[])
      expect(r.is_nullable).toBe("NO");
  });
  it("the three CHECK constraints exist", async () => {
    const db = getDb();
    const r = await db.execute<{ conname: string }>(sql`
      SELECT conname FROM pg_constraint WHERE conname IN
      ('expenses_beleg_or_grund_ck','donations_zweckbindung_text_ck','donations_sachspende_wertermittlung_ck')`);
    expect((r as unknown[]).length).toBe(3);
  });
});
```

- [ ] **Step 2: Write migration 0030 (wipe — disposable data, CASCADE required for inbound FKs).**

```sql
-- drizzle/0030_transactions_wipe_disposable.sql
-- Pre-launch: all transaction data is disposable test data (spec §3/§15).
-- Reset paid-invoice payment state (semantic; paid_by_income_id has no FK), then wipe.
-- CASCADE is REQUIRED: member_beitrags.paid_via_income_id → income, auslagen_submissions.approved_expense_id → expenses.
UPDATE "invoices" SET "paid_by_income_id" = NULL, "bezahlt_am" = NULL WHERE "paid_by_income_id" IS NOT NULL;--> statement-breakpoint
TRUNCATE TABLE "donations", "expenses", "income" CASCADE;
```

- [ ] **Step 3: Write migration 0031 (constraints).** Tables are empty post-0030, so these apply directly.

```sql
-- drizzle/0031_transactions_constraints.sql
ALTER TABLE "expenses"  ALTER COLUMN "kategorie_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "income"    ALTER COLUMN "kategorie_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "donations" ALTER COLUMN "kategorie_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses"  ADD CONSTRAINT "expenses_beleg_or_grund_ck"
  CHECK ("beleg_file_id" IS NOT NULL OR "beleg_verzicht_grund" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_zweckbindung_text_ck"
  CHECK ("zweckbindung_kind" = 'zweckfrei' OR "zweckbindung_text" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_sachspende_wertermittlung_ck"
  CHECK ("spende_kind" <> 'sachspende' OR ("wertermittlung_methode" IS NOT NULL AND "zustand_beschreibung" IS NOT NULL));
```

- [ ] **Step 4: Append both journal entries.**

```json
{ "idx": 30, "version": "7", "when": 1751500100000, "tag": "0030_transactions_wipe_disposable", "breakpoints": true },
{ "idx": 31, "version": "7", "when": 1751500200000, "tag": "0031_transactions_constraints", "breakpoints": true }
```

- [ ] **Step 5: Update Drizzle schema** — `.notNull()` on `kategorieId` in `expenses.ts`, `income.ts`, `donations.ts`:

```ts
kategorieId: uuid("kategorie_id").notNull().references(() => kategorien.id, { onDelete: "restrict" }),
```

- [ ] **Step 6: Run the constraints test.**

Run: `pnpm test --run tests/unit/migration-0031-constraints.test.ts`
Expected: `2 passed`.

- [ ] **Step 7: Commit.**

```bash
git add drizzle/0030_transactions_wipe_disposable.sql drizzle/0031_transactions_constraints.sql drizzle/meta/_journal.json \
        src/lib/server/db/schema/expenses.ts src/lib/server/db/schema/income.ts src/lib/server/db/schema/donations.ts \
        tests/unit/migration-0031-constraints.test.ts
git commit -m "feat(db): wipe disposable tx data CASCADE (0030) + kategorie_id NOT NULL & 3 CHECKs (0031)"
```

---

### Task 11: Showcase seed corpus `[model: sonnet]`

Sonnet for the data authoring (escalate any nontrivial helper — businessId allocation, file fixtures, festschreibung stamping — to opus).

**Files:** Modify `scripts/seed-fixtures.ts` (add `seedTransactionCorpus(db)` + call from `seedFixtures`); Test `tests/unit/seed-corpus.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/seed-corpus.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
describe("showcase seed corpus", () => {
  it("expenses cover >=3 statuses and >=3 spheres", async () => {
    const db = getDb();
    const s = await db.execute<{ status: string }>(
      sql`SELECT DISTINCT status FROM expenses`,
    );
    expect((s as { status: string }[]).map((r) => r.status)).toEqual(
      expect.arrayContaining(["geprueft", "erstattet", "abgelehnt"]),
    );
    const sp = await db.execute(
      sql`SELECT DISTINCT sphere_snapshot FROM expenses`,
    );
    expect((sp as unknown[]).length).toBeGreaterThanOrEqual(3);
  });
  it("income spans all four spheres", async () => {
    const db = getDb();
    const sp = await db.execute<{ sphere_snapshot: string }>(
      sql`SELECT DISTINCT sphere_snapshot FROM income`,
    );
    expect(
      (sp as { sphere_snapshot: string }[]).map((r) => r.sphere_snapshot),
    ).toEqual(
      expect.arrayContaining([
        "ideeller",
        "vermoegen",
        "zweckbetrieb",
        "wirtschaftlich",
      ]),
    );
  });
  it("donations cover Geldspende + Sachspende across >=2 years", async () => {
    const db = getDb();
    const k = await db.execute<{ spende_kind: string }>(
      sql`SELECT DISTINCT spende_kind FROM donations`,
    );
    expect((k as { spende_kind: string }[]).map((r) => r.spende_kind)).toEqual(
      expect.arrayContaining(["geldspende", "sachspende"]),
    );
    const y = await db.execute(
      sql`SELECT DISTINCT year_of_buchung FROM donations`,
    );
    expect((y as unknown[]).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run → fails.**

Run: `pnpm test --run tests/unit/seed-corpus.test.ts`
Expected: FAIL — empty tables.

- [ ] **Step 3: Implement `seedTransactionCorpus(db)`** per spec §4.7, called from `seedFixtures`. Use `source: "fixture"`; `gebuchtAm` via explicit ISO timestamps across 2024/2025/2026 (no `Date.now()`); resolve `kategorieId` by looking up the real seeded categories by name (use real names: "Miete Location", "Bankgebühren", "GEMA / Abgaben", "Honorar Künstler:innen", "Fahrtkosten (Artists)", "Verpflegung (Event)", "Technik-Miete/-Kauf", "Merch-Einkauf / -Produktion", "Eintritt", "Workshop / Kursgebühr", "Bar-Umsatz", "Merch-Verkauf", "Zuschuss (zweckgebunden)", "Zinsen", "Honorar künstlerische Leistung"); set `kategorieNameSnapshot` + `sphereSnapshot` from those rows. Constraint-satisfying: bank-fee/GEMA rows set `belegVerzichtGrund` (no `belegFileId`); the Sachspende sets `wertermittlungMethode` + `zustandBeschreibung`; zweckgebunden donation sets `zweckbindungText`. Status spread: ≥1 `geprueft` (offen), ≥1 `erstattet`, ≥1 `abgelehnt`; one `geprueft` with an old `gebuchtAm` to drive the aged-open pill. Set `festgeschriebenAt` on the 2024 rows. Donations: Geldspende zweckfrei (with `bescheinigungNr`), Geldspende zweckgebunden (no Bescheinigung), Sachspende. Insert with `onConflictDoNothing({ target: <table>.businessId })`. Use `allocateBusinessId` or fixed `*-2026-9xx` ids reserved for fixtures.

> Pending Belegprüfung submissions (spec §4.7) + the one paid invoice→income link are seeded here too if the helpers are readily available; otherwise note them for Phase 4/5 fixture top-ups. Keep the corpus modest (≈10 expenses, ≈8 income, ≈3 donations).

- [ ] **Step 4: Run → passes.**

Run: `pnpm test --run tests/unit/seed-corpus.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit.**

```bash
git add scripts/seed-fixtures.ts tests/unit/seed-corpus.test.ts
git commit -m "feat(seed): showcase transaction corpus — varied cases across 2024-26 incl. festgeschrieben 2024 (spec §4.7)"
```

---

### Task 12: Phase-boundary verification + milestone `[model: opus]`

**Files:** none (verification only)

- [ ] **Step 1: Run all Phase-1 tests** (pure via fast lane, DB via reset lane):

Run (pure): `pnpm test:fast --run tests/unit/kategorie-sphere.test.ts tests/unit/spenden-kategorie.test.ts`
Run (DB): `pnpm test --run tests/unit/migration-0029-additive.test.ts tests/unit/seed-kategorien.test.ts tests/unit/create-donation-derivation.test.ts tests/unit/create-expense-income-kategorie.test.ts tests/unit/import-transform.test.ts tests/unit/import-kategorie-fallback.test.ts tests/unit/audit-inbox-actions.test.ts tests/unit/migration-0031-constraints.test.ts tests/unit/seed-corpus.test.ts`
Expected: all pass.

- [ ] **Step 2: Regression check on the suites most likely affected by the new seed corpus** (they may assert transaction counts/sums against the previously-empty seed):

Run: `pnpm test --run tests/unit/dashboard.test.ts tests/unit/transactions.test.ts` and any `eur`/`cashflow` unit test (`pnpm test --run $(git ls-files 'tests/unit/*eur*' 'tests/unit/*cashflow*')`)
Expected: pass; if a test asserted "0 transactions" against the old empty seed, update it to the corpus baseline.

- [ ] **Step 3: Typecheck + lint (phase boundary only).**

Run: `pnpm check && pnpm lint`
Expected: no errors in touched files.

- [ ] **Step 4: Confirm a clean reset works end-to-end** (requires `.env.test` + local DB up via `pnpm dev:up`):

Run: `bash scripts/db/reset-test-db.sh 2>&1 | tail -5`
Expected: completes without error (migrate 0029-0031 + seed + fixtures + corpus).

- [ ] **Step 5: Tag the milestone.**

```bash
git tag -f phase-1-foundation-complete
```

Foundation complete: schema, constraints, all-write-path non-null kategorie, derivation helpers, fast test lane, and a varied seed corpus are in place. Phase 2 (filter backbone) can begin.

---

## Self-Review (run after writing; fixed inline)

1. **Spec coverage:** §4.1 expense `beleg_verzicht_grund` (T1) + CHECK (T10) ✓; §4.3 donation Wertermittlung cols+enum (T1) + CHECKs (T10) ✓; §4.4 reseed + derivation + sentinel (T5) ✓; §4.5 `kategorieSphere` no-override (T3) + used in createExpense/Income (T7) + createDonation always ideeller (T6) ✓; §4.6 NOT NULL across **all** write paths — app forms (T7), donations (T6), approval (T9), importer (T8), constraint (T10) ✓; §4.7 corpus (T11) ✓; §15 wipe CASCADE + invoice reset + owner-role (T10) ✓; ROADMAP test-efficiency → fast lane (T2) ✓.
2. **Placeholder scan:** the only "adapt to real signature" notes are T8's transform `ctx` shape and T9's submission setup — both state the behavioral contract + the real call site; every code step has concrete code. No TBD/TODO.
3. **Type/signature consistency:** `resolveKategorieByName(kind,name)` defined in T6, reused in T7/T9; `kategorieSphere(kategorien,name)` (T3); `deriveDonationKategorieName(spendeKind,zweckbindungKind)` (T4); migrations 0029/0030/0031 ↔ journal idx 29/30/31. `allocateBusinessId` signature to be confirmed against `id-allocator.ts` at impl time (flagged in T6/T7).
4. **Ordering:** all four insert-path fixes (T6 donations, T7 expense/income, T8 importer, T9 approval) precede the NOT NULL migration (T10); the corpus (T11) runs after constraints and satisfies all CHECKs; regression check (T12) catches seed-baseline drift.
