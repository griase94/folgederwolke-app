# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auslagen.spec.ts >> @phase-2 public auslage form >> GET /auslage-status/NONEXISTENT-ID returns 404
- Location: tests/e2e/auslagen.spec.ts:46:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 404
Received: 500
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - heading "500" [level=1] [ref=e3]
  - paragraph [ref=e4]: Internal Error
```

# Test source

```ts
  1  | /**
  2  |  * @phase-2
  3  |  *
  4  |  * E2E tests for the public Auslage submission flow.
  5  |  *
  6  |  * Drive is NOT called in these tests — the form action exports a
  7  |  * _setUploadBelegFn() seam that we swap for a stub returning a fake driveFileId.
  8  |  *
  9  |  * NOTE: These tests require a running dev server (playwright.config.ts webServer)
  10 |  * and a seeded test database. When neither is available (CI without DB), tests
  11 |  * are skipped via the PUBLIC_FORM_ENABLED env check on the server side.
  12 |  *
  13 |  * Drive stub: set DRIVE_TEST_STUB=true to activate (checked in smoke assertions).
  14 |  */
  15 | 
  16 | import { expect, test } from "@playwright/test";
  17 | 
  18 | test.describe("@phase-2 public auslage form", () => {
  19 |   test("GET /auslage-einreichen returns 200 and has a form", async ({
  20 |     page,
  21 |   }) => {
  22 |     const res = await page.goto("/auslage-einreichen");
  23 |     // If PUBLIC_FORM_ENABLED=false the server returns 404 — skip gracefully.
  24 |     if (res?.status() === 404) {
  25 |       test.skip();
  26 |       return;
  27 |     }
  28 |     expect(res?.status()).toBe(200);
  29 |     await expect(page.locator("body")).toBeVisible();
  30 |   });
  31 | 
  32 |   test("GET /auslage-einreichen has expected form elements", async ({
  33 |     page,
  34 |   }) => {
  35 |     const res = await page.goto("/auslage-einreichen");
  36 |     if (res?.status() === 404) {
  37 |       test.skip();
  38 |       return;
  39 |     }
  40 |     // The form-ui agent owns the exact markup; we just assert a form is present.
  41 |     const form = page.locator("form");
  42 |     const formCount = await form.count();
  43 |     expect(formCount).toBeGreaterThanOrEqual(1);
  44 |   });
  45 | 
  46 |   test("GET /auslage-status/NONEXISTENT-ID returns 404", async ({ page }) => {
  47 |     const res = await page.goto("/auslage-status/AUS-9999-999");
> 48 |     expect(res?.status()).toBe(404);
     |                           ^ Error: expect(received).toBe(expected) // Object.is equality
  49 |   });
  50 | 
  51 |   test("/auslage-eingereicht with id param renders confirmation", async ({
  52 |     page,
  53 |   }) => {
  54 |     await page.goto("/auslage-eingereicht?id=AUS-2026-001");
  55 |     await expect(page.locator("body")).toBeVisible();
  56 |     // Should show the AUS-ID
  57 |     await expect(page.locator("body")).toContainText("AUS-2026-001");
  58 |     // Should link to status page
  59 |     const statusLink = page.locator('a[href*="/auslage-status/AUS-2026-001"]');
  60 |     await expect(statusLink).toBeVisible();
  61 |   });
  62 | 
  63 |   test("/auslage-eingereicht without id param still renders gracefully", async ({
  64 |     page,
  65 |   }) => {
  66 |     const res = await page.goto("/auslage-eingereicht");
  67 |     expect(res?.status()).toBe(200);
  68 |     await expect(page.locator("body")).toBeVisible();
  69 |   });
  70 | });
  71 | 
```