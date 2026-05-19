import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDevEmlProvider } from "$lib/server/mail/dev-eml.js";

describe("dev-eml provider", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "fdw-mail-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes an .eml file with subject, to, from", async () => {
    const p = createDevEmlProvider({ root });
    await p.send({
      from: "from@local",
      to: "to@local",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    const files = await readdir(root);
    const eml = files.find((f) => f.endsWith(".eml"));
    expect(eml).toBeDefined();
    const content = await readFile(join(root, eml!), "utf8");
    expect(content).toContain("Subject: Hello");
    expect(content).toContain("From: from@local");
    expect(content).toContain("To: to@local");
    expect(content).toContain("Hi");
  });

  it("returns a stable messageId in dev-eml format", async () => {
    const p = createDevEmlProvider({ root });
    const { messageId } = await p.send({
      from: "f",
      to: "t",
      subject: "s",
      html: "",
      text: "",
    });
    expect(messageId).toMatch(/^dev-eml-/);
  });

  it("logs the magic-link URL from the text body to console", async () => {
    // extractMagicLink() is the whole reason this provider exists in dev:
    // it surfaces the verify URL in the terminal so the developer can click
    // through without opening the .eml. Regression-guard it.
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    };
    try {
      const p = createDevEmlProvider({ root });
      await p.send({
        from: "f",
        to: "t",
        subject: "magic_link",
        html: "",
        text: "Click here: https://localhost:5173/sign-in/verify?token=abc123",
      });
      expect(
        logs.some((l) =>
          l.includes("https://localhost:5173/sign-in/verify?token=abc123"),
        ),
      ).toBe(true);
    } finally {
      console.log = orig;
    }
  });
});
