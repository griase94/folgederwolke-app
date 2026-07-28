/**
 * Grep-guard (§4.1.1 #2): the Mitglieder reminder actions must dispatch the
 * BeitragsReminder mail through the event bus (`beitrag.reminder_requested`),
 * never by importing/calling `sendMail` inline. A regression that re-introduces
 * an inline send would bypass the bus (and its ADR-0005 idempotency handler),
 * so it is cheaper to fail here than in a board.
 *
 * Scope = the two mitglieder route action files. The annual cron
 * (cron-tasks.ts) still sends inline (Flow-G territory) and is intentionally
 * out of this guard's scope.
 *
 * @aurora-impl-c2
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "src/routes/app/mitglieder/+page.server.ts",
  "src/routes/app/mitglieder/[id]/+page.server.ts",
];

describe("reminder path emits via the event bus, never inline sendMail", () => {
  for (const rel of FILES) {
    it(`${rel} contains no inline sendMail call or import`, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      // A real call `sendMail(` (no space — prettier-normalized) or an import
      // of it. The prose "inline sendMail (§…)" has a space before the paren,
      // so it is not a call and is correctly ignored.
      expect(src).not.toMatch(/sendMail\(/);
      expect(src).not.toMatch(/import[^;]*\bsendMail\b/);
      // And it DOES emit the reminder event (positive assertion).
      expect(src).toContain("beitrag.reminder_requested");
    });
  }
});
