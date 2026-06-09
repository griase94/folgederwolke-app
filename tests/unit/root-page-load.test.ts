/**
 * @phase-1
 *
 * Unit tests for the root route load() — src/routes/+page.server.ts.
 *
 * Verifies that all three routing branches are governed by locals.session
 * (already populated by hooks.server.ts) rather than a second resolveSession
 * call (PR1 latency optimisation).
 */

import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock("$lib/server/env.js", () => ({
  isPublicFormEnabled: vi.fn(),
  env: {},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockEvent = {
  locals: { session: unknown };
};

async function callLoad(
  event: MockEvent,
): Promise<
  ReturnType<(typeof import("../../src/routes/+page.server.js"))["load"]>
> {
  const { load } = await import("../../src/routes/+page.server.js");
  return load(event as never);
}

function makeEvent(session: unknown): MockEvent {
  return { locals: { session } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("@phase-1 root route load()", () => {
  it("redirects to /app when locals.session is present", async () => {
    const { isPublicFormEnabled } = await import("$lib/server/env.js");
    vi.mocked(isPublicFormEnabled).mockReturnValue(true);

    const event = makeEvent({ user: { id: "u1" } }); // truthy session
    await expect(callLoad(event)).rejects.toMatchObject({
      location: "/app",
      status: 302,
    });
  });

  it("redirects to /sign-in?reason=public-form-coming-soon when no session and public form disabled", async () => {
    vi.resetModules();
    const { isPublicFormEnabled } = await import("$lib/server/env.js");
    vi.mocked(isPublicFormEnabled).mockReturnValue(false);

    const event = makeEvent(null); // no session
    await expect(callLoad(event)).rejects.toMatchObject({
      location: "/sign-in?reason=public-form-coming-soon",
      status: 302,
    });
  });

  it("returns {} (landing page) when no session and public form enabled", async () => {
    vi.resetModules();
    const { isPublicFormEnabled } = await import("$lib/server/env.js");
    vi.mocked(isPublicFormEnabled).mockReturnValue(true);

    const event = makeEvent(null); // no session
    const result = await callLoad(event);
    expect(result).toEqual({});
  });
});
