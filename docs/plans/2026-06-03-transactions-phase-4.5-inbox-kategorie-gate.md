# Transactions Phase 4.5 — Inbox Kategorie Gate (Tier C.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read the ROADMAP (Parallelization map, **Tier C.5**) + spec **§4.5 / §4.6 / §6 / §7.3** before starting.

**Goal:** Replace the interim Import-sentinel kategorie on Auslagen-approval with a **mandatory, treasurer-chosen Kategorie** on both inbox approve surfaces (the list inline "Genehmigen" and the detail review card), deriving `sphere_snapshot` strictly from the chosen Kategorie.

**Architecture:** A single domain change — `approveSubmission()` gains a **required `kategorieName`**, resolves it name-authoritatively via the shipped `resolveKategorieByName("expense", …)`, and stamps `kategorie_id` / `kategorie_name_snapshot` / `sphere_snapshot` from it (replacing the sentinel + the hardcoded `"ideeller"`). Two thin UI wirings feed a `KategoriePicker` into the two approve forms and pass `kategorieName` through the two route actions. **No migration** — the columns are already `NOT NULL` since Phase 1.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), Drizzle, Postgres 17, Vitest (mock-DB harness), Playwright. German UI copy.

---

## ⚠ Sequencing & refinement status (READ FIRST)

- **✅ Phase 8 is DONE and merged** into `feat/transactions-three-tabs-v2` (merge **`470a328`**). This plan was refined against that reality on 2026-06-05 and is **ready to build**. We chose **8 → 4.5** (not parallel) because Phase 8 Task 6 (old-route retirement) ends with a repo-wide grep-gate asserting **zero** `/app/transactions` references in `src/`; that gate could only pass once the inbox `goto` was repointed too, so it had to be the _last_ cross-cutting step.
- **VERIFIED post-merge:** `src/routes/app/transactions/` is **gone**; the only remaining `/app/transactions` strings in `src/` are comments/test-assertions (none in `inbox/`); and `src/routes/app/inbox/[ausId]/+page.svelte:99`'s `goto` already reads `` `/app/ausgaben/${data.linkedExpense!.id}` `` (the button label at `:102` still literally says "Zur Transaktion →" — optional cosmetic nudge to "Zur Ausgabe →" in Task 2). **Phase 4.5 touches no routing/retirement code.**
- **Base to build on:** `feat/transactions-three-tabs-v2` @ `470a328` (the whole tx suite — Phases 1–8 — lives on this one branch; **nothing is on `main` yet**, pending the reviewed-by-opus gate). Phase 4.5 is the **final unit** on this branch before the entire effort goes to `main`. Build it directly on the branch (sequential — no separate worktree needed; the Tier-C parallel-worktree machinery is retired).
- **Decisions locked at this refinement pass** (see **Decisions** below): **name-authoritative** contract kept (the shipped Tier-C code is name-authoritative; the broader name→id question is parked in issue **#115**, not a blocker); **list inline-approve UX = progressive reveal** (Decision 4a).

---

## Established facts (RE-VERIFIED against `feat/transactions-three-tabs-v2` @ `470a328`, post-Phase-8 merge)

- **Phase 8 did not touch the inbox/audit domain** — every line ref below was re-confirmed unchanged after the merge, **except** the detail `goto` which Phase 8 already repointed to `` `/app/ausgaben/${data.linkedExpense!.id}` `` (`[ausId]/+page.svelte:99`).
- **`approveSubmission()`** lives in `src/lib/server/domain/audit-inbox-actions.ts` (`:286`). Today it:
  - resolves the **Import sentinel** (`fetchImportSentinelKategorie()`, `:372`) and inserts `kategorieId: sentinel.id`, `kategorieNameSnapshot: sentinel.name`, **`sphereSnapshot: "ideeller"` (hardcoded, `:400`)**;
  - emits `auslage.approved` with **`kategorie: sentinel.name`** (`:554`) — this string is rendered in the ApprovalMail (`events/handlers.ts:97`, `events/types.ts:149` types it `kategorie: string`).
  - Input is `{ submissionId, actorUserId }` (`ApproveSubmissionInput`, `:241`); returns `{ ok, created, expenseId, expenseBusinessId }` on success.
- **Two call sites** (both interactive, admin-only):
  - list inline action `inbox/+page.server.ts` `?/inline-approve` (`:266`, calls `:285`);
  - detail action `inbox/[ausId]/+page.server.ts` `?/approve` (`:268`).
- **Two approve UIs:**
  - `InboxCard.svelte` — one-click green **"Genehmigen"** form posting `?/inline-approve` (`:172–199`), kebab → "Ablehnen…".
  - `AuditCard.svelte` — detail **"Freigeben"** form posting `?/approve` (`:180`, button `:209`); footnote at `:246` ("…auf der Transaktionsseite") needs a copy nudge → "Ausgabenseite".
- **Helpers already shipped (consume read-only):**
  - `listKategorieOptions(kind)` → `KategorieOption[]` `{ id, kind, name, sphere, sortOrder, deactivated }` (`transaction-pickers.ts:132`).
  - `resolveKategorieByName(kind, name)` → `{ id, sphere, name }`, **throws** `Kategorie not found: …` on miss (`transactions.ts:1290`).
  - `KategoriePicker.svelte` (`components/admin/transactions/fields/`) — native `<select>`, **value = kategorie NAME**, default `name="kategorieName"`, props `{ options: {name, sphere, eurZeile?}[], value, onChange, onSphere, id?, name?, required? }`, derives + shows `SphereBadge` from `kategorieSphere`.
- **Name-authoritative is the law here:** `createExpense` (`transactions.ts:1186`) deliberately **ignores `input.kategorieId`** and resolves by name (`resolveKategorieByName`), then sets `kategorieId/NameSnapshot/sphereSnapshot` from the resolved row. We mirror that exactly.
- **The sentinel in `audit-inbox-actions.ts` is used ONLY by `approveSubmission`.** The importer has its **own** copy (`import/runner.ts:455` `fetchImportSentinelKategorieId`). So after this change, `fetchImportSentinelKategorie` + `IMPORT_SENTINEL_NAME` in `audit-inbox-actions.ts` become **dead code → delete them**.
- **Tests today:**
  - `tests/unit/audit-inbox-actions.test.ts` — mock-DB harness with a `kategorienStore` (seeds the expense sentinel in `beforeEach`, `:502`); `approveSubmission` cases at `:518+`; the assertion to supersede is **"sets a non-null kategorie_id (interim Import sentinel)"** (`:637`).
  - `src/routes/app/inbox/page.server.test.ts` — mocks `approveSubmission`; asserts it is/ isn't called (`:99`, `:106`).
  - E2E: `tests/e2e/c7-inbox-filter-actions.spec.ts` (**`@phase-9`**) clicks `inbox-card-approve` in "inline approve …" (`:259/:274`) — **will break** under the gate; `tests/e2e/inbox.spec.ts` (**`@phase-4`**) only asserts the detail "Freigeben" button is visible (`:158`).
- **No DB migration needed:** `expenses.kategorie_id` / `kategorie_name_snapshot` / `sphere_snapshot` are already `NOT NULL` (Phase 1). This phase only changes the _value_ written.

---

## Decisions (LOCKED at the post-Phase-8 refinement pass, 2026-06-05)

1. **Contract = `kategorieName` (name-authoritative), not `kategorieId`.** Follows the shipped `createExpense`/`KategoriePicker` convention; the old Phase-4 extraction note said "kategorieId" before Tier-C settled on names. User reviewed the name-vs-id tradeoff explicitly and kept name for consistency; the app-wide name→id question is parked in issue **#115** (not a blocker — correctness rests on the unique `(kind,name)` index).
2. **Sphere is derived, fixing a latent bug.** Approval currently always stamps `sphere_snapshot = "ideeller"`; with a real Kategorie it becomes `kat.sphere`. This is correct per spec §4.5 and is **in scope**.
3. **Empty/stale Kategorie → graceful 400, not a silent fallback and not a 500.** No sentinel fallback on the interactive path (the gate's whole point). `approveSubmission` returns `{ ok:false, status:400 }` for an empty pick, and **catches `resolveKategorieByName`'s throw** (renamed/missing Kategorie) into the same clean 400 — both route actions already surface `result.error` as a German toast. This closes the one rough edge the existing `createExpense` path still has (uncaught 500 on a stale name) — tracked app-wide in issue #115.
4. **List inline-approve UX = progressive reveal (LOCKED).** Clicking "Genehmigen" on a card reveals an inline `KategoriePicker` + a confirm "✓ Freigeben" in the same footer (no new dialog/popover component; native select; preserves the no-detour speed). Considered + rejected: (b) a small Approve **dialog** symmetric with `RejectDialog`; (c) drop inline approve and force the detail card.
5. **Out of scope:** the `manual-import` action (creates a _submission_, not an expense — no Kategorie at import time); the Aufwandsspende stub; any routing/retirement (owned by Phase 8); EÜR/dashboard (already reflect `kategorie`/`sphere`).

---

## File ownership & sequencing

**Owned by Phase 4.5 (this unit):**

| File                                                     | Change                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/domain/audit-inbox-actions.ts`           | required `kategorieName`; name-resolve; derived sphere; `kategorie: kat.name` emit; delete dead sentinel                            |
| `src/routes/app/inbox/+page.server.ts`                   | `load` adds `kategorieOptions`; `?/inline-approve` reads + validates `kategorieName`                                                |
| `src/routes/app/inbox/[ausId]/+page.server.ts`           | `load` adds `kategorieOptions`; `?/approve` reads + validates `kategorieName`                                                       |
| `src/routes/app/inbox/+page.svelte`                      | pass `kategorieOptions` → `InboxList`                                                                                               |
| `src/routes/app/inbox/[ausId]/+page.svelte`              | pass `kategorieOptions` → `AuditCard`                                                                                               |
| `src/lib/components/admin/inbox/InboxList.svelte`        | thread `kategorieOptions` → each `InboxCard`                                                                                        |
| `src/lib/components/admin/inbox/InboxCard.svelte`        | progressive-reveal `KategoriePicker` in the approve footer                                                                          |
| `src/lib/components/admin/inbox/AuditCard.svelte`        | `KategoriePicker` (NO outer `<label>` — it owns its own) in the `?/approve` form; copy nudge `:246`                                 |
| `tests/unit/audit-inbox-actions.test.ts`                 | extend mock (`sphereSnapshot`); seed one expense kategorie; delete test-file sentinel consts; new tests; update all calls           |
| `tests/unit/server/events/auslage-approved.test.ts`      | **(was missed)** add kategorien mock+store+seed; pass `kategorieName` to all 5 `approveSubmission` calls; update payload assertions |
| `src/routes/app/inbox/page.server.test.ts`               | inline-approve passes `kategorieName`; missing → 400                                                                                |
| `tests/e2e/c7-inbox-filter-actions.spec.ts` (`@phase-9`) | inline-approve picks a Kategorie; **+ a new `@phase-9` detail-card gate test** (moved here so CI's grep runs it)                    |

**Read-only shared deps:** `listKategorieOptions` (`transaction-pickers.ts`), `resolveKategorieByName` (`transactions.ts`), `KategoriePicker.svelte`, `SphereBadge`, `kategorieSphere`.

**Sequencing (resolved):** Phase 8 is **already merged** on this branch (`470a328`) and touched none of the files above except the one `goto` (already repointed). So 4.5 is simply the **next, final unit** built directly on `feat/transactions-three-tabs-v2` — sequential, no separate worktree, no grep-gate coupling. After 4.5 lands, the whole branch (Phases 1–8 + 4.5) goes to `main` as the transactions effort (reviewed-by-opus gate — [[feedback_no-bypass-reviewed-by-opus-gate]]).

---

## Per-step testing (cost-aware — see ROADMAP "Testing approach")

Run the **single file/test** per step, never the bare suite mid-step:

- Domain: `pnpm test --run tests/unit/audit-inbox-actions.test.ts`
- Second `approveSubmission` caller suite (event pathway): `pnpm test --run tests/unit/server/events/auslage-approved.test.ts`
- List route: `pnpm test --run src/routes/app/inbox/page.server.test.ts`
- Components render via the route/unit tests above (no separate harness needed for the picker wiring).
- Phase-boundary only (before the final commit): the **three** unit files above + `pnpm check` + `pnpm lint` + the e2e spec(s) by grep.

---

## Task 1 — Domain: `approveSubmission` requires `kategorieName`, derives sphere `[model: opus]`

**Files:**

- Modify: `src/lib/server/domain/audit-inbox-actions.ts` (`ApproveSubmissionInput` `:241`; sentinel `:194–235`, `:372`; INSERT `:380–415`; emit `:543–558`) — **add the `resolveKategorieByName` import**
- Test: `tests/unit/audit-inbox-actions.test.ts` (primary) **and `tests/unit/server/events/auslage-approved.test.ts`** (second caller suite — Step 5)

- [ ] **Step 1: Write the failing tests + seed a real Kategorie.** In `tests/unit/audit-inbox-actions.test.ts`, in the `beforeEach` that seeds the sentinel (`~:502`), **replace** the Import-sentinel seed with a single real expense kategorie:

```ts
// The gate resolves the CHOSEN Kategorie by name. The drizzle fake's kategorien
// branch filters by kind only (the `and(...)` mock drops the name eq), so — as
// the existing harness already relied on (":219") — keep EXACTLY ONE expense
// kategorie in the store so resolveKategorieByName is unambiguous. The Import
// sentinel is no longer used by approveSubmission, so it's dropped here.
kategorienStore.clear();
kategorienStore.set("kat-buero", {
  id: "kat-buero",
  kind: "expense",
  name: "Bürobedarf",
  sphere: "wirtschaftlich",
});
```

**Three harness changes are also required in this file** (the new tests assert a derived `sphereSnapshot`, and the old sentinel wiring goes dead):

1. **Thread `sphereSnapshot` through the expense fake** (else `exp.sphereSnapshot` is `undefined` and a TS-unknown property). Add `sphereSnapshot: string | null;` to the `ExpenseRow` interface (`~:54–72`), default it in `makeExpense` (`~:137–161`, e.g. `sphereSnapshot: null`), and thread it in the `insert().returning()` fake (`~:287–289`, next to the existing kategorie threading): `sphereSnapshot: (ctx.values.sphereSnapshot as string | null) ?? null`.
2. **Delete the now-dead test-file sentinel wiring** (else `@typescript-eslint/no-unused-vars` = error fails `pnpm lint`): remove the module-level `IMPORT_SENTINEL_NAME` (`~:95`) and `let importSentinelId` (`~:96`) constants and their use in `beforeEach` (`~:501–505`) — the `kategorienStore.clear()` + `kat-buero` seed above replaces them.
3. **Delete (not rename) the superseded test** "sets a non-null kategorie_id (interim Import sentinel)" (`~:637`), whose body still references `importSentinelId`/`IMPORT_SENTINEL_NAME`.

Then add three cases to `describe("approveSubmission …")`:

```ts
it("stamps the chosen Kategorie + derives sphere from it (spec §4.6/§4.5)", async () => {
  const sub = makeSubmission({ businessId: "AUS-2026-101" });

  const result = await approveSubmission({
    submissionId: sub.id,
    actorUserId: "admin-1",
    kategorieName: "Bürobedarf",
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const exp = expensesStore.get(result.expenseId)!;
  expect(exp.kategorieNameSnapshot).toBe("Bürobedarf");
  expect(exp.sphereSnapshot).toBe("wirtschaftlich"); // NOT the old hardcoded "ideeller"

  // ApprovalMail carries the chosen kategorie, not the sentinel.
  const mailEmit = emitMock.mock.calls.find((c) => c[0] === "auslage.approved");
  expect(mailEmit?.[1]).toMatchObject({ kategorie: "Bürobedarf" });
});

it("rejects approval with no Kategorie (400, no expense created)", async () => {
  const sub = makeSubmission({ businessId: "AUS-2026-102" });

  const result = await approveSubmission({
    submissionId: sub.id,
    actorUserId: "admin-1",
    kategorieName: "  ",
  });

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.status).toBe(400);
  expect(expensesStore.size).toBe(0);
});

it("returns a graceful 400 (not a 500) when the chosen Kategorie no longer exists", async () => {
  // Simulate a stale/renamed Kategorie: empty the store so the name resolves
  // to nothing. resolveKategorieByName THROWS; the gate must catch → 400.
  kategorienStore.clear();
  const sub = makeSubmission({ businessId: "AUS-2026-103" });

  const result = await approveSubmission({
    submissionId: sub.id,
    actorUserId: "admin-1",
    kategorieName: "Bürobedarf",
  });

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.status).toBe(400);
  expect(expensesStore.size).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm test --run tests/unit/audit-inbox-actions.test.ts`
Expected: FAIL — `kategorieName` is not assignable to `ApproveSubmissionInput` (type error); the sphere assertion fails (currently `"ideeller"`); and the graceful-404 case throws (no try/catch yet).

- [ ] **Step 3: Implement the gate.** In `audit-inbox-actions.ts`:

(a) extend the input:

```ts
export interface ApproveSubmissionInput {
  submissionId: string;
  actorUserId: string;
  /** Spec §4.6: the treasurer-chosen expense Kategorie NAME-snapshot (required). */
  kategorieName: string;
}
```

(b) at the top of `approveSubmission`, after destructuring, validate:

```ts
const { submissionId, actorUserId, kategorieName } = input;
if (!submissionId) {
  return { ok: false, status: 400, error: "Fehlende Submission-ID" };
}
const chosenKategorieName = kategorieName?.trim();
if (!chosenKategorieName) {
  return { ok: false, status: 400, error: "Bitte eine Kategorie wählen" };
}
```

(c) **add the import** — `resolveKategorieByName` is NOT currently imported here (the file deliberately used an inline sentinel query). At the top of `audit-inbox-actions.ts`, add `import { resolveKategorieByName } from "$lib/server/domain/transactions.js";` (no import cycle — `transactions.ts` does not import this file). Then replace the sentinel resolution (`const sentinel = await fetchImportSentinelKategorie();`, `:372`) with name-authoritative resolution (mirror `createExpense`), **wrapped so a stale/renamed Kategorie returns a graceful German 400 instead of an uncaught 500** — `resolveKategorieByName` throws on a miss:

```ts
// Spec §4.6/§4.5: resolve the chosen Kategorie by NAME (authoritative) and
// derive sphere strictly from it — never a project default, never hardcoded.
// resolveKategorieByName THROWS on a miss; catch it so a renamed/stale
// Kategorie yields a clean 400 (surfaced as a toast), never a 500.
let kat: Awaited<ReturnType<typeof resolveKategorieByName>>;
try {
  kat = await resolveKategorieByName("expense", chosenKategorieName);
} catch {
  return {
    ok: false,
    status: 400,
    error: "Kategorie nicht gefunden — bitte neu wählen",
  };
}
```

(No change needed in the two route actions: both already do `if (!result.ok) return fail(result.status, { … error: result.error })`, so this graceful message reaches the UI toast automatically.)

(d) in the INSERT `.values({…})`, swap the three lines:

```ts
kategorieId: kat.id,
kategorieNameSnapshot: kat.name,
sphereSnapshot: kat.sphere,   // was the hardcoded "ideeller"
```

(e) in the `auslage.approved` emit, change `kategorie: sentinel.name` → `kategorie: kat.name`.

(f) delete the now-dead `IMPORT_SENTINEL_NAME` const (`:198`) and `fetchImportSentinelKategorie()` (`:212–235`) from this file (the importer keeps its own in `runner.ts`), **including the stale rationale comment (`~:200–206`) that explains "why we don't import `resolveKategorieByName`"** — which is now false. Update the interim comment blocks (`:366–371`, `:393–397`, `:550–553`) to state the gate is live.

Finally, update **every pre-existing** `approveSubmission({ … })` call in `tests/unit/audit-inbox-actions.test.ts` (idempotency, festschreibung, ADR-0007, etc.) to pass `kategorieName: "Bürobedarf"`, and **replace** the old "sets a non-null kategorie_id (interim Import sentinel)" test (`:637`) with the chosen-Kategorie test from Step 1 (delete the superseded one).

- [ ] **Step 4: Run to verify it passes.**

Run: `pnpm test --run tests/unit/audit-inbox-actions.test.ts`
Expected: PASS (all cases, including the three new ones — chosen-Kategorie+sphere, empty→400, stale/missing→graceful 400).

- [ ] **Step 5: Fix the SECOND `approveSubmission` caller suite** (`tests/unit/server/events/auslage-approved.test.ts`). This file (separate harness) calls `approveSubmission({ submissionId, actorUserId })` **five times** (`~:411/:434/:443/:455/:483`) with **no `kategorieName`** and has **no kategorien mock** — so after Task 1 it fails `pnpm check` (TS2741, required prop) and at runtime (resolution finds nothing → 400). Mirror the sibling harness:
  - Add a schema mock next to the others (`~:345`): `vi.mock("$lib/server/db/schema/kategorien.js", () => ({ kategorien: { _kind: "kategorien", id: "id", kind: "kind", name: "name", sphere: "sphere" } }))`.
  - Add `const kategorienStore = new Map<string, { id: string; kind: string; name: string; sphere: string }>();` near `expensesStore` (`~:77`).
  - Add a `kategorien` branch to the db-fake `then()` (after the `sentMails` branch, `~:205`): `} else if (ctx.table === "kategorien") { rows = [...kategorienStore.values()].filter((r) => ctx.whereField ? (r as Record<string, unknown>)[ctx.whereField!] === ctx.whereValue : true); }`. (`ctx.table` is typed `string` here and `from()` already maps `table._kind`, so no type change; `and:(a)=>a` collapses to the kind eq → the single seeded expense kategorie, same as the sibling.)
  - In `beforeEach` (`~:390`, after `expensesStore.clear()`): `kategorienStore.clear(); kategorienStore.set("kat-buero", { id: "kat-buero", kind: "expense", name: "Bürobedarf", sphere: "wirtschaftlich" });`.
  - Pass `kategorieName: "Bürobedarf"` to **all five** `approveSubmission(...)` calls.
  - Update any `auslage.approved` payload assertion that checks `kategorie` to expect `"Bürobedarf"` (the emit now sends the chosen name, not the sentinel).

  Run: `pnpm test --run tests/unit/server/events/auslage-approved.test.ts` → Expected: PASS (idempotency / send_attempt / P2-B6 re-approve all green).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/server/domain/audit-inbox-actions.ts tests/unit/audit-inbox-actions.test.ts tests/unit/server/events/auslage-approved.test.ts
git commit -m "feat(inbox): require Kategorie on Auslage approval + derive sphere (spec §4.6, replaces interim sentinel)"
```

---

## Task 2 — Detail approve UI: KategoriePicker in `AuditCard` `[model: sonnet]`

**Files:**

- Modify: `src/routes/app/inbox/[ausId]/+page.server.ts` (`load` `:42`, `?/approve` `:240–284`)
- Modify: `src/routes/app/inbox/[ausId]/+page.svelte` (pass options to `<AuditCard>`)
- Modify: `src/lib/components/admin/inbox/AuditCard.svelte` (form `:178–211`, copy `:246`)

- [ ] **Step 1: Write the failing test** — add it to **`tests/e2e/c7-inbox-filter-actions.spec.ts`** (the `@phase-9` spec — the CI grep is `@phase-0|@phase-1|@phase-2|@phase-9`, so a `@phase-4` test in `inbox.spec.ts` would **never run in CI**). Self-seed (mirror the inline test's `seedPendingSubmission`) and navigate to the detail page by AUS-id:

```ts
test("@phase-9 detail card approves only after a Kategorie is chosen", async ({
  page,
}) => {
  const seeded = await seedPendingSubmission("DET");
  await page.goto(`/app/inbox/${seeded.businessId}`);

  const approve = page.locator('button:has-text("Freigeben")');
  await expect(approve).toBeDisabled(); // gated until a Kategorie is picked

  await page.getByLabel("Kategorie").selectOption({ index: 1 });
  await expect(approve).toBeEnabled();
  await approve.click();

  await expect(page.getByText("Freigegeben")).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm test:e2e tests/e2e/c7-inbox-filter-actions.spec.ts -g "detail card approves only after"`
Expected: FAIL — no Kategorie field; "Freigeben" is enabled with no selection.

- [ ] **Step 3: Load the options.** In `[ausId]/+page.server.ts` `load`, after the existing fetches, add (note the **sentinel exclusion** — the whole point of the gate is a real Kategorie, so don't offer "Unkategorisiert (Import)", which `listKategorieOptions` returns since it isn't `deactivated`):

```ts
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
// …
const kategorieOptions = (await listKategorieOptions("expense"))
  .filter((o) => o.name !== "Unkategorisiert (Import)")
  .map((o) => ({ name: o.name, sphere: o.sphere }));
```

and include `kategorieOptions` in the returned object.

> Note: the create/edit Ausgaben pickers (already shipped) still offer the sentinel via the same `listKategorieOptions` — that's a pre-existing app-wide property, out of scope here; if it should be hidden everywhere, do it at the loader level (or flag the sentinel) as a follow-up (relates to issue #115).

- [ ] **Step 4: Gate the `?/approve` action.** In the same file's `approve` action (before the `approveSubmission` call at `:268`):

```ts
const kategorieName = formData.get("kategorieName")?.toString().trim() ?? "";
if (!kategorieName) {
  return fail(400, { action: "approve", error: "Bitte eine Kategorie wählen" });
}

const result = await approveSubmission({
  submissionId,
  actorUserId: userId,
  kategorieName,
});
```

- [ ] **Step 5: Wire the picker into `AuditCard`.** Add a prop + the field. In `AuditCard.svelte` `<script>`:

```ts
import KategoriePicker from "$lib/components/admin/transactions/fields/KategoriePicker.svelte";
import type { KategorieOption } from "$lib/components/admin/transactions/fields/KategoriePicker.svelte";
// add to Props:
//   kategorieOptions: KategorieOption[];
let kategorieName = $state("");
```

Inside the `?/approve` `<form>` (above the `<Button type="submit">` at `:198`), add the picker **with NO outer `<label>`** — `KategoriePicker` already renders its own `<label for={id}>Kategorie *</label>` (`KategoriePicker.svelte:80–82`); a wrapper label would duplicate the text and bind a second `<label for="approve-kategorie">` to the same select (the exact bug the shipped `AusgabeFields`/`AusgabeDetailFields` carry warning comments about):

```svelte
<div class="mb-2">
  <KategoriePicker
    id="approve-kategorie"
    options={kategorieOptions}
    value={kategorieName}
    onChange={(n) => (kategorieName = n)}
    onSphere={() => {}}
    required
  />
</div>
```

`KategoriePicker` already renders `<select name="kategorieName">`, so the value posts with the form automatically, and its single internal label keeps the e2e `getByLabel("Kategorie")` unambiguous. Gate the button: `disabled={approving || !kategorieName}`. Update the footnote at `:246` text "…auf der Transaktionsseite." → "…auf der Ausgabenseite.".

In `[ausId]/+page.svelte`, pass the prop: `<AuditCard submission={data.submission} decided={isDecided} kategorieOptions={data.kategorieOptions} />`.

- [ ] **Step 6: Relabel the handoff button.** `[ausId]/+page.svelte:99` already reads `` `/app/ausgaben/${data.linkedExpense!.id}` `` (Phase 8 repointed it) — leave the URL untouched. **Change the button label at `:102` from "Zur Transaktion →" to "Zur Ausgabe →"** (no longer optional): it now navigates to the Ausgaben tab and spec §7.3 frames the handoff as "links to the new row in the Ausgaben tab," so the stale label is misleading. Pure copy, no behavior.

- [ ] **Step 7: Run to verify it passes.**

Run: `pnpm test:e2e tests/e2e/c7-inbox-filter-actions.spec.ts -g "detail card approves only after"`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add src/routes/app/inbox/\[ausId\]/+page.server.ts src/routes/app/inbox/\[ausId\]/+page.svelte src/lib/components/admin/inbox/AuditCard.svelte tests/e2e/c7-inbox-filter-actions.spec.ts
git commit -m "feat(inbox): Kategorie picker on the detail approval card (spec §4.6)"
```

---

## Task 3 — List inline approve UI: Kategorie reveal in `InboxCard` `[model: sonnet]`

> Implements **Decision 4(a)** (progressive reveal). If refinement picks (b) dialog or (c) detail-only, this is the only task that changes.

**Files:**

- Modify: `src/routes/app/inbox/+page.server.ts` (`load` `:43`, `?/inline-approve` `:266–296`)
- Modify: `src/routes/app/inbox/+page.svelte` (pass options → `InboxList`)
- Modify: `src/lib/components/admin/inbox/InboxList.svelte` (thread prop)
- Modify: `src/lib/components/admin/inbox/InboxCard.svelte` (reveal + picker, `:166–224`)
- Test: `src/routes/app/inbox/page.server.test.ts`; `tests/e2e/c7-inbox-filter-actions.spec.ts`

- [ ] **Step 1: Write the failing unit test.** In `src/routes/app/inbox/page.server.test.ts`, add to the inline-approve coverage:

Use the file's existing `callAction` / `makeFormData` helpers (`:49–81`); note `makeLocals` stamps the user id as **`"user-1"`**:

```ts
it("inline-approve forwards the chosen kategorieName to approveSubmission", async () => {
  vi.mocked(approveSubmission).mockResolvedValue({
    ok: true,
    created: true,
    expenseId: "e1",
    expenseBusinessId: "AUS-2026-200",
  });
  const fd = makeFormData({
    submissionId: "sub-1",
    kategorieName: "Bürobedarf",
  });

  await callAction("inline-approve", fd, "admin");

  expect(approveSubmission).toHaveBeenCalledWith({
    submissionId: "sub-1",
    actorUserId: "user-1",
    kategorieName: "Bürobedarf",
  });
});

it("inline-approve without a kategorieName returns 400 and never calls approveSubmission", async () => {
  const fd = makeFormData({ submissionId: "sub-1" });

  const result = await callAction("inline-approve", fd, "admin");

  expect((result as { status: number }).status).toBe(400);
  expect(approveSubmission).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm test --run src/routes/app/inbox/page.server.test.ts`
Expected: FAIL — action ignores `kategorieName`; missing-name path still calls `approveSubmission`.

- [ ] **Step 3: Load options + gate the action.** In `inbox/+page.server.ts`:

`load` — add the options and include them in the **existing** return object (which is `{ submissions, activeStatus, counts: { offen, geprueft, abgelehnt } }` at `:145` — add the key, don't rewrite the literal):

```ts
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
// … inside load(), before the return (same sentinel exclusion as the detail load):
const kategorieOptions = (await listKategorieOptions("expense"))
  .filter((o) => o.name !== "Unkategorisiert (Import)")
  .map((o) => ({ name: o.name, sphere: o.sphere }));
// then add `kategorieOptions` to the returned object:
//   return { submissions, activeStatus, counts: { … }, kategorieOptions };
```

`?/inline-approve` — after the `submissionId` check (`:283`):

```ts
const kategorieName = String(formData.get("kategorieName") ?? "").trim();
if (!kategorieName) {
  return fail(400, { error: "Bitte eine Kategorie wählen" });
}

const result = await approveSubmission({
  submissionId,
  actorUserId,
  kategorieName,
});
```

- [ ] **Step 4: Run to verify the unit test passes.**

Run: `pnpm test --run src/routes/app/inbox/page.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the prop + reveal the picker.** In `inbox/+page.svelte`, pass `kategorieOptions` to `<InboxList submissions={…} kategorieOptions={data.kategorieOptions} />`. In `InboxList.svelte`, add `kategorieOptions` to `Props` and forward: `<InboxCard {submission} index={i} {kategorieOptions} />`.

In `InboxCard.svelte`, replace the one-click approve (`:172–199`) with a progressive reveal. **Layout note:** `KategoriePicker` is NOT a bare select — it renders a full block (its own `Kategorie *` label + an `h-11` select + a derived `SphereBadge` row once chosen). So the revealed form is a **vertical panel** (picker on its own line, the action buttons in a row beneath with ≥44px targets), NOT a single cramped footer row — otherwise it wraps/overflows on a narrow card. No outer `<label>` (the picker owns its own):

```svelte
<script>
  // add:
  import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
  import type { KategorieOption } from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
  // add to props: kategorieOptions: KategorieOption[]
  let approveRevealed = $state(false);
  let kategorieName = $state('');
</script>

{#if isOpen}
  <div class="mt-2 flex flex-col items-stretch gap-2 sm:items-end" data-testid="inbox-card-actions" data-aus-id={submission.ausId}>
    {#if !approveRevealed}
      <div class="flex items-center justify-end gap-2">
        <button type="button" data-testid="inbox-card-approve-start"
          onclick={() => (approveRevealed = true)}
          class="min-h-11 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-label="Auslage {submission.ausId} genehmigen">Genehmigen</button>
        <!-- existing kebab → Ablehnen… stays here -->
      </div>
    {:else}
      <!-- Vertical reveal panel: picker on its own line, buttons beneath. -->
      <form method="POST" action="/app/inbox?/inline-approve"
        class="flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:w-80"
        use:enhance={() => {
          approveSubmitting = true;
          return async ({ result }) => {
            approveSubmitting = false;
            if (result.type === 'success') { toast.success(`Auslage ${submission.ausId} genehmigt`); await invalidateAll(); }
            else if (result.type === 'failure') { const d = result.data as { error?: string } | null; toast.error(d?.error ?? 'Genehmigung fehlgeschlagen'); }
          };
        }}>
        <input type="hidden" name="submissionId" value={submission.id} />
        <KategoriePicker id={`approve-kat-${submission.ausId}`} options={kategorieOptions}
          value={kategorieName} onChange={(n) => (kategorieName = n)} onSphere={() => {}} required />
        <div class="flex items-center justify-end gap-2">
          <button type="button" onclick={() => { approveRevealed = false; kategorieName = ''; }}
            class="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Abbrechen</button>
          <button type="submit" data-testid="inbox-card-approve" disabled={approveSubmitting || !kategorieName}
            class="min-h-11 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
            {approveSubmitting ? 'Genehmige…' : '✓ Freigeben'}</button>
        </div>
      </form>
    {/if}
  </div>
{/if}
```

Verify the panel renders cleanly on a narrow (mobile) viewport — it should not push the card width or clip the SphereBadge row.

(Keep the kebab/`RejectDialog` exactly as-is.)

- [ ] **Step 6: Update the inline-approve e2e.** In `tests/e2e/c7-inbox-filter-actions.spec.ts` (`@phase-9`), the "inline approve …" test (`:259`): after locating the card, click the new reveal trigger, choose a Kategorie, then confirm:

```ts
await card.getByTestId("inbox-card-approve-start").click();
await card.getByLabel("Kategorie").selectOption({ index: 1 });
await card.getByTestId("inbox-card-approve").click();
```

(The downstream assertions — `data-decision='approved'` + the `auslage_approved` `sent_mails` row — stay unchanged.)

- [ ] **Step 7: Run the e2e to verify.**

Run: `pnpm test:e2e tests/e2e/c7-inbox-filter-actions.spec.ts -g "inline approve"`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add src/routes/app/inbox/+page.server.ts src/routes/app/inbox/+page.svelte src/lib/components/admin/inbox/InboxList.svelte src/lib/components/admin/inbox/InboxCard.svelte src/routes/app/inbox/page.server.test.ts tests/e2e/c7-inbox-filter-actions.spec.ts
git commit -m "feat(inbox): Kategorie gate on inline list approval (spec §4.6)"
```

---

## Task 4 — Phase-boundary verification + handoff confirmation `[model: opus]`

**Files:** none new — verification + the spec §6 handoff confirmation if not already present.

- [ ] **Step 1: Handoff confirmation (spec §6, UX-03).** Confirm both approve paths surface a link to the new expense after success:
  - Detail: the success path shows the handoff affordance via the existing `linkedExpense` block (`[ausId]/+page.svelte:93–102`) — now points at `/app/ausgaben/<id>` (Phase 8) and relabelled "Zur Ausgabe →" (Task 2 Step 6). No further change.
  - List: the success `toast` already names the AUS-id; no teleport-confusion since the row leaves the Offen filter. No code change expected.

- [ ] **Step 2: Run the owned unit tests** (all THREE — including the second `approveSubmission` caller suite fixed in Task 1 Step 5).

Run: `pnpm test --run tests/unit/audit-inbox-actions.test.ts tests/unit/server/events/auslage-approved.test.ts src/routes/app/inbox/page.server.test.ts`
Expected: PASS (all).

- [ ] **Step 3: Typecheck + lint.**

Run: `pnpm check && pnpm lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Run the e2e spec.**

Run: `pnpm test:e2e tests/e2e/c7-inbox-filter-actions.spec.ts`
Expected: PASS. **CI coverage:** both approve-gate e2e tests (inline + detail) are `@phase-9`, which **is** in the CI grep (`.github/workflows/ci.yml:139` = `@phase-0|@phase-1|@phase-2|@phase-9`). `@phase-4` is **not** in the grep — so the detail test was deliberately placed in the `@phase-9` spec (Task 2 Step 1) rather than `inbox.spec.ts`, which would never run in CI.

- [ ] **Step 5: Open the PR (standalone unit on `main`).**

```bash
git push -u origin phase-4.5-inbox-kategorie
gh pr create --title "phase(4.5): Inbox Kategorie gate — mandatory Kategorie on Auslage approval (spec §4.6)" \
  --body "Replaces the interim Import-sentinel kategorie on approval with a treasurer-chosen Kategorie on both approve surfaces; derives sphere from it. No migration. Lands after Phase 8."
```

The PR needs the `reviewed-by-opus` status before `main` accepts it (independent reviewer, never self-stamped).

---

## Self-Review (writing-plans checklist)

1. **Spec coverage:** §4.6 mandatory Kategorie on approval (T1 domain + T2 detail UI + T3 list UI) ✓; §4.5 sphere derived strictly from Kategorie (T1, fixes hardcoded `ideeller`) ✓; §6 Belegprüfung approve flow + handoff confirmation (T4 S1) ✓; ApprovalMail kategorie (T1 emit) ✓; ROADMAP Tier C.5 "standalone unit after the C-tabs" + name-authoritative resolution (T1) ✓.
2. **Placeholder scan:** none — every step has concrete code, exact paths, and a run command with an expected signal.
3. **Type/signature consistency:** `kategorieName: string` added once to `ApproveSubmissionInput` (T1) and used identically at both call sites (T2 S4, T3 S3) and both tests; `KategorieOption` mapping `{name, sphere}` is consistent across both loads and both components; `KategoriePicker` posts `name="kategorieName"`, matching the action reads. ✓
4. **No-migration claim:** verified — columns already `NOT NULL` since Phase 1; this phase only changes the written value. ✓
5. **Dead-code:** `IMPORT_SENTINEL_NAME` + `fetchImportSentinelKategorie` deleted from `audit-inbox-actions.ts` only (importer keeps its own in `runner.ts`). ✓
6. **Robust + graceful:** correctness rests on the unique `(kind,name)` index (unambiguous resolution); the lone rough edge (stale/renamed name → 500) is caught → graceful 400 (T1 S3c + the third T1 test). The broader name→id convention is deferred to issue #115 (not a safety item). ✓
7. **Refinement pass complete (2026-06-05):** re-pinned to post-Phase-8 reality (`470a328`) — `/app/transactions` retired, inbox `goto` already → `/app/ausgaben`, all signatures re-verified unchanged; Decisions 1 + 4 locked.
8. **Independent multi-expert review applied (2026-06-05):** 5-lens workflow + adversarial verify → 11 confirmed findings, all incorporated: **[blocker]** the second `approveSubmission` caller suite `tests/unit/server/events/auslage-approved.test.ts` (T1 S5); **[high]** thread `sphereSnapshot` through the test mock (T1 S1); **[high]** detail e2e moved to the `@phase-9` spec so CI actually runs it (T2 S1, T4 S4); **[med]** add the `resolveKategorieByName` import (T1 S3c); drop the duplicate outer `<label>` (T2 S5); delete dead test-file sentinel consts (T1 S1); vertical inline-reveal panel (T3 S5); **[nit]** exclude the Import sentinel from the approve dropdowns (T2/T3 S3); non-optional "Zur Ausgabe →" relabel (T2 S6); self-seed the detail e2e (T2 S1). Plan is **build-ready**.
