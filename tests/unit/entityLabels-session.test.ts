import { describe, it, expect } from "vitest";

// C4-DASH-lite (2026-05-21): activity-feed labeled "session" rows as
// lowercase "session" because the entityLabels map had no entry for the
// kind. Verify the German label "Sitzung" is returned by buildActivityLabel.
//
// buildActivityLabel is exported from $lib/server/domain/dashboard.ts so
// this unit test can exercise it without spinning up the DB.

import { buildActivityLabel } from "$lib/server/domain/dashboard";

describe("entityLabels.session", () => {
  it("maps 'session' entity kind to 'Sitzung'", () => {
    const label = buildActivityLabel("create", "session", "SES-2025-001");
    expect(label).toContain("Sitzung");
    // And not the lowercase passthrough we are fixing.
    expect(label).not.toMatch(/\bsession\b/);
  });
});
