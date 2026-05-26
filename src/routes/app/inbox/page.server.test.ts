/**
 * @vitest-environment node
 * @c7-inbox-full
 *
 * Unit tests: admin role guard on ?/inline-approve and ?/inline-reject.
 *
 * These guard against regression where a non-admin session bypasses the 403
 * and reaches the domain layer. We mock the domain functions so no DB is
 * needed; the guard must short-circuit before they are called.
 */

import { describe, it, expect, vi } from "vitest";

// Hoist mocks before any imports that reference $lib/... paths.
vi.mock("$lib/server/domain/audit-inbox-actions.js", () => ({
  manualImportSubmission: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
}));

vi.mock("$lib/server/db/index.js", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("$lib/server/domain/auslagen.js", () => ({
  validateAuslageInput: vi.fn(),
}));

vi.mock("$lib/server/db/schema/auslagen_submissions.js", () => ({
  auslagenSubmissions: {},
}));

vi.mock("$lib/server/db/schema/members.js", () => ({
  members: {},
}));

vi.mock("$lib/domain/inbox.js", () => ({}));

import { actions } from "./+page.server.js";
import {
  approveSubmission,
  rejectSubmission,
} from "$lib/server/domain/audit-inbox-actions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(pairs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(pairs)) fd.append(k, v);
  return fd;
}

function makeRequest(fd: FormData): Request {
  return { formData: async () => fd } as unknown as Request;
}

function makeLocals(role: string | undefined) {
  return {
    session: role !== undefined ? { user: { id: "user-1", role } } : null,
  };
}

type ActionResult =
  | { status: number; data: Record<string, unknown> }
  | { success: boolean };

async function callAction(
  actionName: "inline-approve" | "inline-reject",
  fd: FormData,
  role: string | undefined,
): Promise<ActionResult> {
  const action = actions[actionName];
  if (!action) throw new Error(`action ${actionName} not found`);
  const event = {
    request: makeRequest(fd),
    locals: makeLocals(role),
  } as Parameters<typeof action>[0];
  return (await action(event)) as ActionResult;
}

// ---------------------------------------------------------------------------
// Tests: inline-approve role guard
// ---------------------------------------------------------------------------

describe("?/inline-approve — admin role guard", () => {
  it("returns 403 when role is 'member_self_service'", async () => {
    const fd = makeFormData({ submissionId: "sub-1" });
    const result = await callAction(
      "inline-approve",
      fd,
      "member_self_service",
    );
    expect((result as { status: number }).status).toBe(403);
    expect((result as unknown as { data: { error: string } }).data.error).toBe(
      "Nur Admins können freigeben.",
    );
    expect(approveSubmission).not.toHaveBeenCalled();
  });

  it("returns 403 when role is 'steuerberater'", async () => {
    const fd = makeFormData({ submissionId: "sub-2" });
    const result = await callAction("inline-approve", fd, "steuerberater");
    expect((result as { status: number }).status).toBe(403);
    expect(approveSubmission).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: inline-reject role guard
// ---------------------------------------------------------------------------

describe("?/inline-reject — admin role guard", () => {
  it("returns 403 when role is 'member_self_service'", async () => {
    const fd = makeFormData({ submissionId: "sub-3", grund: "Nicht zulässig" });
    const result = await callAction("inline-reject", fd, "member_self_service");
    expect((result as { status: number }).status).toBe(403);
    expect((result as unknown as { data: { error: string } }).data.error).toBe(
      "Nur Admins können freigeben.",
    );
    expect(rejectSubmission).not.toHaveBeenCalled();
  });

  it("returns 403 when role is 'steuerberater'", async () => {
    const fd = makeFormData({ submissionId: "sub-4", grund: "Nicht zulässig" });
    const result = await callAction("inline-reject", fd, "steuerberater");
    expect((result as { status: number }).status).toBe(403);
    expect(rejectSubmission).not.toHaveBeenCalled();
  });
});
