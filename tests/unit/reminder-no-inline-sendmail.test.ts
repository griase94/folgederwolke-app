/**
 * Global grep-guard (§4.1.1 #2): the BeitragsReminder mail dispatches through the
 * event bus (`beitrag.reminder_requested`) from EXACTLY ONE place — the event
 * handler. No route action, domain helper, or cron may call `sendMail` for the
 * reminder inline (that would bypass the bus + its ADR-0005 idempotency).
 *
 * C2 unified all three trigger paths (manual single, Bulk sheet, annual cron)
 * onto the one event, so this guard is now repo-wide, not scoped to the routes.
 *
 * @aurora-impl-c2
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|svelte)$/.test(entry)) acc.push(p);
  }
  return acc;
}

describe("BeitragsReminder dispatches ONLY via the event bus (repo-wide)", () => {
  const files = walk(SRC);

  it("the `beitrag_reminder` sendMail call lives ONLY in the event handler", () => {
    // A `template: "beitrag_reminder"` argument to sendMail is the actual send.
    // (mail/index.ts + subjectFor use `case "beitrag_reminder"`, not `template:`.)
    const callers = files
      .filter((f) =>
        /template:\s*["']beitrag_reminder["']/.test(readFileSync(f, "utf-8")),
      )
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"))
      .sort();
    expect(callers).toEqual(["lib/server/events/handlers.ts"]);
  });

  it("the reminder event is emitted from EXACTLY the two domain emitters", () => {
    // After the C2/S3b consolidation there is ONE reminder domain endpoint
    // (sendBeitragReminderBulk) + the annual cron; both emit the event. The route
    // actions delegate to sendBeitragReminderBulk and no longer emit directly.
    const emitters = files
      .filter((f) =>
        /\bemit\(\s*["']beitrag\.reminder_requested["']/.test(
          readFileSync(f, "utf-8"),
        ),
      )
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"))
      .sort();
    expect(emitters).toEqual([
      "lib/server/domain/cron-tasks.ts",
      "lib/server/domain/members-actions.ts",
    ]);
  });

  it("no reminder trigger path calls sendMail inline", () => {
    const PATHS = [
      "src/routes/app/mitglieder/+page.server.ts",
      "src/routes/app/mitglieder/[id]/+page.server.ts",
      "src/lib/server/domain/cron-tasks.ts",
    ];
    for (const rel of PATHS) {
      const src = readFileSync(join(process.cwd(), rel), "utf-8");
      // A real call `sendMail(` (no space); prose "inline sendMail (§…)" ignored.
      expect(src, `${rel} must not call sendMail inline`).not.toMatch(
        /sendMail\(/,
      );
    }
  });

  it("the single ?/send-reminder action is gone — only the Bulk endpoint remains", () => {
    const ROUTES = [
      "src/routes/app/mitglieder/+page.server.ts",
      "src/routes/app/mitglieder/[id]/+page.server.ts",
    ];
    for (const rel of ROUTES) {
      const src = readFileSync(join(process.cwd(), rel), "utf-8");
      // No standalone `"send-reminder":` action key (the consolidated endpoint is
      // `"send-reminder-bulk":`).
      expect(
        src,
        `${rel} must not define a single send-reminder action`,
      ).not.toMatch(/["']send-reminder["']\s*:/);
      expect(src, `${rel} must define the Bulk endpoint`).toMatch(
        /["']send-reminder-bulk["']\s*:/,
      );
    }
  });
});
