/**
 * @vitest-environment node
 *
 * Year-close guardrail (deep-verification HIGH): the in-progress (current)
 * Berlin year — and any future year — must NEVER be festgeschrieben mid-year.
 * The guard throws BEFORE touching the DB, so this is a pure unit test.
 */
import { describe, it, expect } from "vitest";
import { closeBuchhaltungsjahr } from "../../src/lib/server/domain/jahresabschluss.js";
import { berlinYear } from "../../src/lib/domain/year.js";

const ACTOR = "00000000-0000-0000-0000-000000000000";

describe("closeBuchhaltungsjahr — mid-year guardrail", () => {
  it("rejects closing the current (in-progress) year", async () => {
    await expect(closeBuchhaltungsjahr(berlinYear(), ACTOR)).rejects.toThrow(
      /läuft noch/,
    );
  });

  it("rejects closing a future year", async () => {
    await expect(
      closeBuchhaltungsjahr(berlinYear() + 1, ACTOR),
    ).rejects.toThrow(/läuft noch/);
  });
});
