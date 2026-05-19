import { describe, expect, it } from "vitest";
import { parseSignOff } from "../../../scripts/orchestrate/sign-off-parser.js";

describe("parseSignOff", () => {
  it("returns null on a body with no verdict header", () => {
    expect(parseSignOff("lgtm")).toBeNull();
  });

  it("parses a RESOLVED verdict with reviewer + cycle", () => {
    const body = `[REVIEWER: vereinsbuchhalter] [CYCLE: 2] [VERDICT: RESOLVED]

Body here.`;
    expect(parseSignOff(body)).toEqual({
      reviewer: "vereinsbuchhalter",
      cycle: 2,
      verdict: "RESOLVED",
    });
  });

  it("parses PARTIALLY + NOT RESOLVED", () => {
    expect(
      parseSignOff(
        "[REVIEWER: julia-buchhaltung] [CYCLE: 1] [VERDICT: PARTIALLY]\n…",
      )?.verdict,
    ).toBe("PARTIALLY");
    expect(
      parseSignOff(
        "[REVIEWER: ux-expert] [CYCLE: 3] [VERDICT: NOT RESOLVED]\n…",
      )?.verdict,
    ).toBe("NOT_RESOLVED");
  });

  it("rejects malformed verdict values", () => {
    expect(parseSignOff("[REVIEWER: x] [CYCLE: 1] [VERDICT: lgtm]")).toBeNull();
  });

  it("accepts cycle numbers up to 99", () => {
    expect(
      parseSignOff("[REVIEWER: x] [CYCLE: 12] [VERDICT: RESOLVED]")?.cycle,
    ).toBe(12);
  });
});
