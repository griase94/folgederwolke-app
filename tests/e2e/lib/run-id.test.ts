// tests/e2e/lib/run-id.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { getRunId, nsEmail, nsLabel } from "./run-id";

describe("e2e run-id helpers", () => {
  const orig = process.env.E2E_RUN_ID;
  afterEach(() => {
    if (orig === undefined) delete process.env.E2E_RUN_ID;
    else process.env.E2E_RUN_ID = orig;
  });

  it("reads E2E_RUN_ID from env", () => {
    process.env.E2E_RUN_ID = "12345-1";
    expect(getRunId()).toBe("12345-1");
  });

  it("falls back to 'local' when unset", () => {
    delete process.env.E2E_RUN_ID;
    expect(getRunId()).toBe("local");
  });

  it("namespaces emails with the run-id", () => {
    process.env.E2E_RUN_ID = "12345-1";
    expect(nsEmail("alice")).toBe("e2e+12345-1+alice@folgederwolke.de");
  });

  it("namespaces labels with the run-id prefix", () => {
    process.env.E2E_RUN_ID = "12345-1";
    expect(nsLabel("Mitglied A")).toBe("e2e-12345-1-Mitglied A");
  });
});
