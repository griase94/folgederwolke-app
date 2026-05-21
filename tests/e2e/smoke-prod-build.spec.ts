import { test, expect } from "@playwright/test";

// @phase-9 prod-build smoke — Pre-Flight Task 0.5
//
// Runs against `pnpm build && node server.js` (NOT pnpm preview — project uses
// custom adapter-node wrapper at server.js for share_target Origin header).
// B-2 cluster makes /auslage-einreichen green; until then this is the red
// baseline for Wave 0.

test.describe("@phase-9 prod-build smoke", () => {
  test("GET / returns 200", async ({ request }) => {
    const r = await request.get("/");
    expect(r.status()).toBe(200);
  });

  test("GET /sign-in returns 200", async ({ request }) => {
    const r = await request.get("/sign-in");
    expect(r.status()).toBe(200);
  });

  test("GET /auslage-einreichen returns 200 with form rendered", async ({
    page,
  }) => {
    const r = await page.goto("/auslage-einreichen");
    expect(r?.status()).toBe(200);
    // formEnabled=true is reflected by the form being rendered (not the
    // soft-fallback message). B-2 makes this pass.
    await expect(
      page.getByRole("textbox", { name: /bezeichnung/i }),
    ).toBeVisible();
  });

  test("GET /datenschutz returns 200", async ({ request }) => {
    const r = await request.get("/datenschutz");
    expect(r.status()).toBe(200);
  });

  test("GET /healthz returns 200 with blob: ok", async ({ request }) => {
    const r = await request.get("/healthz");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.blob).toBe("ok");
  });

  test("PUBLIC_FORM_ENABLED=false renders soft-fallback (not 404)", async ({
    page,
  }) => {
    // Requires test harness env override; this test runs against a worker
    // that boots with PUBLIC_FORM_ENABLED=false. B-2 implements the
    // fallback. Until then the test is the failing red of B-2 wave 0.
    test.skip(
      process.env["SMOKE_FORM_DISABLED"] !== "1",
      "Set SMOKE_FORM_DISABLED=1 to exercise the soft-fallback scenario",
    );
    const r = await page.goto("/auslage-einreichen");
    expect(r?.status()).toBe(200);
    await expect(
      page.getByText(/Vorübergehend nicht verfügbar/i),
    ).toBeVisible();
  });
});
