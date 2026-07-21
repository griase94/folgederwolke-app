/**
 * B3 Verifier-find — the Ausgabe detail `?/delete` action must not surface the
 * opaque generic „es bestehen noch Verknüpfungen" RESTRICT-409 when the row is an
 * inbox-approved Auslage (FK-pinned by auslagen_submissions.approved_expense_id
 * ON DELETE RESTRICT). Instead it PRE-FLIGHTS the coupling and returns a friendly
 * German 409 that names the submission + points at the Prüf-Eingang (analog to
 * the Rechnung pointer on the Einnahme side). A plain Auslage still deletes (303).
 *
 * Route-test: drives the real `actions.delete` from
 * routes/app/ausgaben/[id]/+page.server.ts with a synthetic event (no HTTP),
 * asserting on the ActionFailure `{ status, data }` vs. the Redirect.
 *
 * RESET lane, fileParallelism=false. DB is real (app_runtime); seeding is via
 * the superuser admin connection so the festschreibung trigger is bypassed.
 *
 * @phase-4
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { getDb } from "$lib/server/db/index.js";
import { users } from "$lib/server/db/schema/users.js";
import { registerHandlers } from "$lib/server/events/index.js";
import { closeAdminConnection } from "./_helpers/festschreibung-reset.js";

const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = !!DIRECT_DATABASE_URL;

// Real bus handlers: the delete path emits `expense.deleted` (audit-log write).
registerHandlers();

type DeleteActions = {
  delete: (event: unknown) => Promise<unknown>;
};

interface RunResult {
  status?: number;
  data?: Record<string, unknown>;
  redirectLocation?: string;
}

async function runDelete(
  actions: DeleteActions,
  id: string,
  actor: string,
): Promise<RunResult> {
  const event = {
    params: { id },
    locals: { session: { user: { id: actor } } },
  };
  try {
    const result = await actions.delete(event);
    const af = result as { status?: number; data?: Record<string, unknown> };
    return { status: af.status, data: af.data };
  } catch (thrown) {
    const r = thrown as { status?: number; location?: string };
    if (r && typeof r.location === "string") {
      return { redirectLocation: r.location, status: r.status };
    }
    throw thrown;
  }
}

describe.skipIf(!dbConfigured)("Ausgabe detail delete — coupling guard", () => {
  let admin: ReturnType<typeof postgres>;
  let ACTOR = "";
  let KAT_ID = "";
  let KAT_NAME = "";
  let ausActions: DeleteActions;

  const YEAR = new Date().getFullYear();
  let seq = 0;

  async function seedExpense(): Promise<string> {
    seq += 1;
    const businessId = `A-${YEAR}-9${String(seq).padStart(4, "0")}`;
    const [r] = await admin<{ id: string }[]>`
      INSERT INTO expenses (
        business_id, source, betrag_cents, currency, bezeichnung,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot,
        bezahlt_von_kind, bezahlt_von_display, status,
        created_by_user_id, beleg_verzicht_grund
      ) VALUES (
        ${businessId}, 'app', 5000, 'EUR', 'delete-coupling fixture',
        ${KAT_ID}::uuid, ${KAT_NAME}, 'ideeller',
        'verein', 'Verein', 'geprueft',
        ${ACTOR}::uuid, 'fixture — kein Beleg'
      ) RETURNING id`;
    if (!r) throw new Error("seed expense failed");
    return r.id;
  }

  async function linkSubmission(expenseId: string): Promise<string> {
    seq += 1;
    const businessId = `AUS-${YEAR}-9${String(seq).padStart(4, "0")}`;
    await admin`
      INSERT INTO auslagen_submissions (
        business_id, bezeichnung, betrag_cents, currency,
        bezahlt_von_kind, bezahlt_von_display,
        consent_text_version, beleg_verzicht_grund,
        approved_expense_id, decided_at, decision
      ) VALUES (
        ${businessId}, 'submission fixture', 5000, 'EUR',
        'verein', 'Verein', 'v1', 'fixture — Verzicht begründet (Test)',
        ${expenseId}::uuid, NOW(), 'approved'
      )`;
    return businessId;
  }

  beforeAll(async () => {
    admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    const mod =
      (await import("../../src/routes/app/ausgaben/[id]/+page.server.js")) as {
        actions: DeleteActions;
      };
    ausActions = mod.actions;

    const [u] = await getDb()
      .insert(users)
      .values({
        email: "detail-del-coupling@example.com",
        emailCanonical: "detail-del-coupling@example.com",
        name: "Detail Delete Coupling",
      })
      .returning({ id: users.id });
    if (!u) throw new Error("failed to seed actor");
    ACTOR = u.id;

    const [k] = await admin<{ id: string; name: string }[]>`
      SELECT id, name FROM kategorien WHERE kind = 'expense' LIMIT 1`;
    if (!k) throw new Error("missing seeded expense kategorie");
    KAT_ID = k.id;
    KAT_NAME = k.name;
  });

  afterAll(async () => {
    if (ACTOR) {
      // Submissions FK-pin their approved expense (ON DELETE RESTRICT) — clear
      // them before the expenses they point at.
      await admin`
        DELETE FROM auslagen_submissions
        WHERE approved_expense_id IN (
          SELECT id FROM expenses WHERE created_by_user_id = ${ACTOR}::uuid
        )`;
      await admin`DELETE FROM expenses WHERE created_by_user_id = ${ACTOR}::uuid`;
      await admin`DELETE FROM audit_log WHERE actor_user_id = ${ACTOR}::uuid`;
      await admin`DELETE FROM users WHERE id = ${ACTOR}::uuid`;
    }
    await admin.end();
    await closeAdminConnection();
  });

  it("returns a friendly 409 pointing at the Prüf-Eingang for a submission-linked Auslage", async () => {
    const expenseId = await seedExpense();
    const subBusinessId = await linkSubmission(expenseId);

    const res = await runDelete(ausActions, expenseId, ACTOR);

    expect(res.status).toBe(409);
    // Not the opaque generic message.
    expect(String(res.data?.["error"])).not.toMatch(/bestehen noch/i);
    // Names the submission + speaks German about the Prüf-Eingang.
    expect(String(res.data?.["error"])).toContain(subBusinessId);
    expect(String(res.data?.["error"])).toMatch(/Prüf-Eingang/i);
    expect(res.data?.["submissionBusinessId"]).toBe(subBusinessId);
    expect(res.data?.["submissionHref"]).toBe(`/app/inbox/${subBusinessId}`);

    // The row must survive the blocked delete.
    const [row] = await admin<{ id: string }[]>`
      SELECT id FROM expenses WHERE id = ${expenseId}::uuid`;
    expect(row?.id).toBe(expenseId);
  });

  it("still deletes a plain Auslage (303 redirect to the list)", async () => {
    const expenseId = await seedExpense();

    const res = await runDelete(ausActions, expenseId, ACTOR);

    expect(res.status).toBe(303);
    expect(res.redirectLocation).toBe("/app/ausgaben");

    const rows = await admin<{ id: string }[]>`
      SELECT id FROM expenses WHERE id = ${expenseId}::uuid`;
    expect(rows.length).toBe(0);
  });
});
