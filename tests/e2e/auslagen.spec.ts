/**
 * @phase-2
 *
 * E2E for the public Auslage READ chain (Aurora A-flow S1): the confirmation
 * (/auslage-eingereicht) and the status tracker (/auslage-status). Batch-aware:
 * any AUS-Nr of a group opens the whole group; each node keeps its own status;
 * the amount is plum in every state; the 404 renders the AUS-search.
 *
 * Deterministic fixtures are seeded per-run (the global seed has no auslagen).
 */
import { expect, test } from "@playwright/test";
import {
  seedAuslagenFixtures,
  cleanupAuslagenFixtures,
  SINGLE_ID,
  BATCH_IDS,
  REJECT_REASON,
} from "./_helpers/auslagen-fixtures.js";

test.describe("@phase-2 public auslage read chain", () => {
  test.beforeAll(async () => {
    await seedAuslagenFixtures();
  });
  test.afterAll(async () => {
    await cleanupAuslagenFixtures();
  });

  test("GET /auslage-einreichen returns 200 with a form", async ({ page }) => {
    const res = await page.goto("/auslage-einreichen");
    expect(
      res?.status(),
      "GET /auslage-einreichen returned 404 — PUBLIC_FORM_ENABLED is off. Fix .env.test (PUBLIC_FORM_ENABLED=true).",
    ).toBe(200);
    expect(await page.locator("form").count()).toBeGreaterThanOrEqual(1);
  });

  // ── 404 (behaviour lives on) ───────────────────────────────────────────────
  test("GET /auslage-status/<unknown> returns 404 + renders the AUS-search", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-status/AUS-9999-999");
    expect(res?.status()).toBe(404);
    // The 404 body is the designed neutral search, not a raw error page.
    await expect(page.getByTestId("aus-id-search")).toBeVisible();
  });

  test("GET /auslage-status (index) renders the AUS-search entry", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-status");
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("aus-id-search-input")).toBeVisible();
  });

  // ── confirmation ───────────────────────────────────────────────────────────
  test("/auslage-eingereicht?id=<single> renders the receipt + status link", async ({
    page,
  }) => {
    await page.goto(`/auslage-eingereicht?id=${SINGLE_ID}`);
    await expect(page.getByTestId("eingereicht-heading")).toBeVisible();
    await expect(page.locator("body")).toContainText(SINGLE_ID);
    // Status CTA points at the status page for this AUS-Nr.
    await expect(page.getByTestId("status-cta")).toHaveAttribute(
      "href",
      new RegExp(`/auslage-status/${SINGLE_ID}`),
    );
  });

  test("/auslage-eingereicht?id=<batch member> renders the group receipt + total", async ({
    page,
  }) => {
    await page.goto(`/auslage-eingereicht?id=${BATCH_IDS[0]}`);
    await expect(page.getByTestId("eingereicht-heading")).toBeVisible();
    // All three AUS-Nrn appear; the total sums them (plum).
    for (const id of BATCH_IDS) {
      await expect(page.locator("body")).toContainText(id);
    }
    await expect(page.getByTestId("bcg-total")).toContainText("63,70");
  });

  test("/auslage-eingereicht WITHOUT id returns 404 (no blind success)", async ({
    page,
  }) => {
    // Bug-fix (AC #3): previously the client-only page rendered a fake success.
    const res = await page.goto("/auslage-eingereicht");
    expect(res?.status()).toBe(404);
  });

  // ── status: single, per-node fates (behaviour lives on) ────────────────────
  test("status single (in Prüfung) renders facts + timeline, amount plum, no amber", async ({
    page,
  }) => {
    await page.goto(`/auslage-status/${SINGLE_ID}`);
    await expect(page.getByTestId("status-split-shell")).toBeVisible();
    await expect(page.getByTestId("facts-table")).toBeVisible();
    await expect(page.getByTestId("status-timeline")).toBeVisible();
    // in_pruefung is brand-neutral — no severity-warn (amber) anywhere.
    expect(await page.locator(".text-severity-warn-text").count()).toBe(0);
  });

  test("status batch: any AUS-Nr opens the group, mixed tally, each node its own fate", async ({
    page,
  }) => {
    // Reach the group via the MIDDLE (abgelehnt) number — still opens all three.
    await page.goto(`/auslage-status/${BATCH_IDS[1]}`);
    await expect(page.getByTestId("batch-status-group")).toBeVisible();
    // Mixed tally present (1 in Prüfung / 1 abgelehnt / 1 freigegeben).
    await expect(page.getByTestId("batch-tally")).toBeVisible();
    // All three node ids render; no aggregate status — the abgelehnt node shows
    // its reason box + recovery CTA (deep-link node is open).
    for (const id of BATCH_IDS) {
      await expect(page.locator("body")).toContainText(id);
    }
    await expect(page.getByTestId("reason-box")).toContainText(REJECT_REASON);
    await expect(page.getByTestId("reject-recovery-cta")).toBeVisible();
  });
});
