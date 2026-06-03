/**
 * B2 regression: members-actions role gates.
 *
 * Before the B2 fix, markBeitragPaid accepted any authenticated session
 * (including member_self_service and steuerberater) and never queried the
 * user's role. After the fix, only "admin" is allowed.
 *
 * These tests use the real DB (not mocked) to verify the full code path.
 *
 * @phase-0
 */

import { describe, it, expect } from "vitest";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";
import {
  markBeitragPaid,
  addMember,
  softDeleteMember,
} from "$lib/server/domain/members-actions.js";
import {
  ADMIN_USER_ID_MOCK,
  STEUERBERATER_USER_ID_MOCK,
  MEMBER_SELF_SERVICE_USER_ID_MOCK,
} from "../fixtures/ids.js";

describe("@phase-0 members-actions role gates (B2)", () => {
  it("rejects markBeitragPaid called by member_self_service", async () => {
    const member = await seedMember({ name: "RoleTestMember1" });
    await seedOpenBeitrag({ memberId: member.id, year: 2026 });

    const result = await markBeitragPaid(
      member.id,
      2026,
      MEMBER_SELF_SERVICE_USER_ID_MOCK,
      "member_self_service",
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; status: number }).status).toBe(403);
  });

  it("rejects markBeitragPaid called by steuerberater", async () => {
    const member = await seedMember({ name: "RoleTestMember2" });
    await seedOpenBeitrag({ memberId: member.id, year: 2026 });

    const result = await markBeitragPaid(
      member.id,
      2026,
      STEUERBERATER_USER_ID_MOCK,
      "steuerberater",
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; status: number }).status).toBe(403);
  });

  it("allows markBeitragPaid for admin", async () => {
    const member = await seedMember({ name: "RoleTestMember3" });
    await seedOpenBeitrag({ memberId: member.id, year: 2026 });

    const result = await markBeitragPaid(
      member.id,
      2026,
      ADMIN_USER_ID_MOCK,
      "admin",
    );
    expect(result.ok).toBe(true);
  });

  it("allows markBeitragPaid with null actorUserId and admin role", async () => {
    const member = await seedMember({ name: "RoleTestMember4" });
    await seedOpenBeitrag({ memberId: member.id, year: 2026 });

    const result = await markBeitragPaid(member.id, 2026, null, "admin");
    expect(result.ok).toBe(true);
  });

  // FIX 3 (P2): fail-closed on undefined/omitted role — pins require-role.ts behaviour.
  it("rejects markBeitragPaid when actorRole is undefined (fail-closed)", async () => {
    const member = await seedMember({ name: "RoleTestMember5" });
    await seedOpenBeitrag({ memberId: member.id, year: 2026 });

    const result = await markBeitragPaid(
      member.id,
      2026,
      ADMIN_USER_ID_MOCK,
      undefined,
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; status: number }).status).toBe(403);
  });
});

describe("@phase-0 members-actions role gates — addMember / softDeleteMember", () => {
  const validAddRaw = {
    vorname: "Test",
    nachname: "User",
    email: "",
    eintritts_datum: "2026-01-01",
    role: "mitglied",
    iban: "",
    telefon: "",
    adresse: "",
    date_of_birth: "",
    beitrag_exempt: "false",
    beitrag_exempt_reason: "",
  };

  it("rejects addMember called by member_self_service", async () => {
    const result = await addMember(
      validAddRaw,
      MEMBER_SELF_SERVICE_USER_ID_MOCK,
      "member_self_service",
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; status: number }).status).toBe(403);
  });

  it("rejects addMember called by steuerberater", async () => {
    const result = await addMember(
      validAddRaw,
      STEUERBERATER_USER_ID_MOCK,
      "steuerberater",
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; status: number }).status).toBe(403);
  });

  it("allows addMember for admin", async () => {
    const result = await addMember(validAddRaw, ADMIN_USER_ID_MOCK, "admin");
    expect(result.ok).toBe(true);
  });

  it("rejects softDeleteMember called by member_self_service", async () => {
    const member = await seedMember({ name: "RoleTestDelete1" });

    const result = await softDeleteMember(
      member.id,
      MEMBER_SELF_SERVICE_USER_ID_MOCK,
      "member_self_service",
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; status: number }).status).toBe(403);
  });

  it("rejects softDeleteMember called by steuerberater", async () => {
    const member = await seedMember({ name: "RoleTestDelete2" });

    const result = await softDeleteMember(
      member.id,
      STEUERBERATER_USER_ID_MOCK,
      "steuerberater",
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; status: number }).status).toBe(403);
  });

  it("allows softDeleteMember for admin", async () => {
    const member = await seedMember({ name: "RoleTestDelete3" });

    const result = await softDeleteMember(
      member.id,
      ADMIN_USER_ID_MOCK,
      "admin",
    );
    expect(result.ok).toBe(true);
  });
});
