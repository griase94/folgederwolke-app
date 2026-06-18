/**
 * E2E Mitglieder Beitragsbefreiung + neue Rollen — @phase-9 C5-MEM-full.
 *
 * Covers:
 *   - Add dialog: role selector lists `extern` + `helfer`.
 *   - Edit dialog: toggling `Beitragspflicht aussetzen` + Begründung
 *     persists; the member row shows the amber `befreit` badge.
 *   - MemberMatrix header shows the `{N} befreit` chip when at least
 *     one active member is exempt.
 *   - Reminder CTA is disabled for exempt members.
 *
 * Strategy: drives the browser end-to-end and reads the DB only to
 * cleanup the test member afterwards.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
  `;
  await client.end();

  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mismatch.click();
  }
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-9 C5-MEM-full — exempt + new roles", () => {
  test("AddMemberDialog role <select> lists extern + helfer", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    await page.click("button:has-text('Mitglied hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const select = page.getByTestId("add-role-select");
    await expect(select).toBeVisible();
    const optionValues = await select
      .locator("option")
      .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value));
    expect(optionValues).toContain("extern");
    expect(optionValues).toContain("helfer");
  });

  test("Add → mark exempt → MemberRow shows 'Befreit' status pill", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    // ── Add a fresh member ──────────────────────────────────────────────
    const unique = randomBytes(4).toString("hex");
    const nachname = `Exempt-${unique}`;
    await page.click("button:has-text('Mitglied hinzufügen')");
    await page.fill('input[name="vorname"]', "Befreit");
    await page.fill('input[name="nachname"]', nachname);
    // Toggle exempt + add reason at create time
    await page.getByTestId("add-beitrag-exempt").check();
    await page.fill(
      'input[name="beitrag_exempt_reason"]',
      "Ehrenmitglied 2026",
    );
    await page.click('button[type="submit"]:has-text("Mitglied anlegen")');

    // Dialog closes, member appears in the list with the canonical status pill
    // reading "Befreit" (BeitragStatusPill state=permanently_exempt).
    // The old standalone "befreit badge" is gone — the pill IS the indicator.
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5_000,
    });
    const row = page.locator(`[data-testid="member-row"]`).filter({
      hasText: nachname,
    });
    await expect(row).toBeVisible({ timeout: 5_000 });
    // The status pill inside the row renders "Befreit" for permanently_exempt state.
    await expect(
      row.locator('[data-testid="beitrag-status-pill"]'),
    ).toBeVisible();
    await expect(
      row.locator('[data-testid="beitrag-status-pill"]'),
    ).toContainText("Befreit");

    // Cleanup: hard-delete the test member to avoid the soft-delete-blocked
    // check for unpaid Beiträge polluting the next run.
    const { default: postgres } = await import("postgres");
    const client = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    try {
      await client`DELETE FROM members WHERE nachname = ${nachname}`;
    } finally {
      await client.end();
    }
  });

  test("MemberMatrix header surfaces 'N befreit' chip when an active member is exempt", async ({
    page,
  }) => {
    // Insert a fresh exempt member directly so the chip math is unambiguous.
    const { default: postgres } = await import("postgres");
    const client = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    const unique = randomBytes(4).toString("hex");
    const nachname = `ChipTest-${unique}`;
    try {
      await client`
        INSERT INTO members (vorname, nachname, email, role, beitrag_exempt, beitrag_exempt_reason)
        VALUES ('Befreit', ${nachname}, ${`chip-${unique}@example.test`}, 'mitglied', true, 'Test')
      `;
    } finally {
      await client.end();
    }

    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    const chip = page.getByTestId("matrix-header-exempt");
    await expect(chip).toBeVisible({ timeout: 5_000 });
    await expect(chip).toContainText(/\d+ befreit/);

    // Cleanup
    const cleanup = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    try {
      await cleanup`DELETE FROM members WHERE nachname = ${nachname}`;
    } finally {
      await cleanup.end();
    }
  });

  test("Detail page: exempt member shows 'Befreit' status and NO reminder CTA (no-false-debt rule)", async ({
    page,
  }) => {
    // Insert an exempt member with an email so we can confirm the reminder is
    // absent for reasons of exemption, not "no email".
    const { default: postgres } = await import("postgres");
    const client = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    const unique = randomBytes(4).toString("hex");
    const nachname = `ReminderGate-${unique}`;
    let memberId: string;
    try {
      const rows = await client<{ id: string }[]>`
        INSERT INTO members (vorname, nachname, email, role, beitrag_exempt, beitrag_exempt_reason)
        VALUES ('Reminder', ${nachname}, ${`rg-${unique}@example.test`}, 'mitglied', true, 'Ehrenmitglied')
        RETURNING id
      `;
      memberId = rows[0]?.id ?? "";
    } finally {
      await client.end();
    }
    expect(memberId).not.toBe("");

    await signIn(page);
    await page.goto(`/app/mitglieder/${memberId}`);

    // The redesign's no-false-debt rule: for an exempt member, canSendReminder
    // is false → stickyMode = 'none' → the sticky bar (including the reminder
    // button) is hidden entirely. Assert the button is not present at all.
    const stickyBar = page.getByTestId("member-detail-sticky-bar");
    await expect(stickyBar).toHaveCount(0);
    const reminderBtn = page.getByTestId("sticky-bar-reminder");
    await expect(reminderBtn).toHaveCount(0);

    // The Beitrag hero shows the canonical "Befreit" status pill.
    await expect(page.getByTestId("beitrags-hero")).toBeVisible();
    await expect(
      page
        .getByTestId("beitrags-hero")
        .locator('[data-testid="beitrag-status-pill"]'),
    ).toContainText("Befreit");

    // No pay CTA in the hero (exempt → heroCTAMode = null).
    await expect(page.getByTestId("beitrags-hero-cta")).toHaveCount(0);

    // Beitragsverlauf shows the exempt banner.
    await expect(
      page.getByTestId("beitragsverlauf-exempt-banner"),
    ).toBeVisible();

    // Cleanup
    const cleanup = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    try {
      await cleanup`DELETE FROM members WHERE id = ${memberId}`;
    } finally {
      await cleanup.end();
    }
  });
});
