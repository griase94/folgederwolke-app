/**
 * @phase-2 Task 2.9 — setBeitragssatz action.
 *
 * Role gate, validation, festschreibung gate, upsert + audit event.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { registerHandlers } from "$lib/server/events/index.js";
import { setBeitragssatz } from "$lib/server/domain/beitragssatz-actions.js";

// The audit handlers are registered on app startup via hooks.server.ts; in unit
// tests we register them explicitly so emitted events write audit rows.
beforeAll(() => {
  registerHandlers();
});

// decided_by_user_id is a real FK to users; tests that persist a row pass null
// (column is nullable). Role-gate tests use a string role independent of the id.
const ACTOR = null;
const TEST_YEAR = 2031; // far future, outside any festschreibung

describe("@phase-2 setBeitragssatz", () => {
  it("rejects non-admin callers with 403", async () => {
    const r = await setBeitragssatz({
      year: TEST_YEAR,
      cents: 8000n,
      actorUserId: ACTOR,
      actorRole: "steuerberater",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("rejects negative cents with 400", async () => {
    const r = await setBeitragssatz({
      year: TEST_YEAR,
      cents: -1n,
      actorUserId: ACTOR,
      actorRole: "admin",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("upserts a new rate for admin and persists it", async () => {
    const r = await setBeitragssatz({
      year: TEST_YEAR,
      cents: 8000n,
      faelligkeitAt: `${TEST_YEAR}-03-31`,
      decisionNote: "MV 2031, TOP 4",
      actorUserId: ACTOR,
      actorRole: "admin",
    });
    expect(r.ok).toBe(true);

    const db = getDb();
    const [row] = await db
      .select()
      .from(beitragssatzByYear)
      .where(eq(beitragssatzByYear.year, TEST_YEAR));
    expect(row?.cents).toBe(8000n);
    expect(row?.decisionNote).toBe("MV 2031, TOP 4");
  });

  it("updates an existing rate (onConflictDoUpdate)", async () => {
    await setBeitragssatz({
      year: TEST_YEAR,
      cents: 8000n,
      actorUserId: ACTOR,
      actorRole: "admin",
    });
    const r = await setBeitragssatz({
      year: TEST_YEAR,
      cents: 9000n,
      actorUserId: ACTOR,
      actorRole: "admin",
    });
    expect(r.ok).toBe(true);
    const db = getDb();
    const [row] = await db
      .select()
      .from(beitragssatzByYear)
      .where(eq(beitragssatzByYear.year, TEST_YEAR));
    expect(row?.cents).toBe(9000n);
  });

  it("writes an audit row (entity_id null — uuid column safe)", async () => {
    // Regression: the settings.beitragssatz_changed handler previously wrote a
    // non-uuid string into the uuid entity_id column, throwing at INSERT time.
    const auditYear = 2034;
    const r = await setBeitragssatz({
      year: auditYear,
      cents: 7700n,
      actorUserId: ACTOR,
      actorRole: "admin",
    });
    expect(r.ok).toBe(true);

    const db = getDb();
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityKind, "settings"));
    const match = rows.find(
      (a) =>
        (a.payload as Record<string, unknown> | null)?.["kind"] ===
          "beitragssatz_changed" &&
        (a.payload as Record<string, unknown> | null)?.["year"] === auditYear,
    );
    expect(match).toBeTruthy();
    expect(match?.entityId).toBeNull();
  });
});
