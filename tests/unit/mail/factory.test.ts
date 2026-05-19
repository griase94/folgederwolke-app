/**
 * Factory tests for getMailProvider — verify the MAIL_PROVIDER env var
 * routes to the correct provider. SMTP and Resend are not exercised here
 * (they would require network/credentials); the dev-only providers are.
 *
 * The factory is module-cached, so each test resets module state with
 * vi.resetModules() before stubbing env vars and re-importing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getMailProvider factory", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns no-op when MAIL_PROVIDER=no-op", async () => {
    vi.stubEnv("MAIL_PROVIDER", "no-op");
    const { getMailProvider } = await import("$lib/server/mail/provider.js");
    const p = await getMailProvider();
    const { messageId } = await p.send({
      from: "f",
      to: "t",
      subject: "s",
      html: "",
      text: "",
    });
    expect(messageId).toMatch(/^noop-/);
    vi.unstubAllEnvs();
  });

  it("returns dev-eml when MAIL_PROVIDER=dev-eml", async () => {
    vi.stubEnv("MAIL_PROVIDER", "dev-eml");
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "fdw-factory-"));
    vi.stubEnv("MAIL_EML_ROOT", root);
    try {
      const { getMailProvider } = await import("$lib/server/mail/provider.js");
      const p = await getMailProvider();
      const { messageId } = await p.send({
        from: "f",
        to: "t",
        subject: "test",
        html: "",
        text: "",
      });
      expect(messageId).toMatch(/^dev-eml-/);
    } finally {
      await rm(root, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });
});
