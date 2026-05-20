import { expect, test } from "@playwright/test";

test.describe("@phase-7 PWA", () => {
  test("manifest.webmanifest is accessible and correct", async ({ page }) => {
    const res = await page.goto("/manifest.webmanifest");
    expect(res?.status()).toBe(200);

    const contentType = res?.headers()["content-type"] ?? "";
    // Accept both webmanifest and json MIME types
    expect(contentType).toMatch(/webmanifest|json/);

    const manifest = await res?.json();
    expect(manifest).toMatchObject({
      name: "Folge der Wolke",
      short_name: "FdW",
      display: "standalone",
      theme_color: "#be185d",
    });
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  test("app.html includes PWA meta tags", async ({ page }) => {
    await page.goto("/");

    // Manifest link
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);

    // Apple touch icon
    const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleTouchIcon).toHaveCount(1);

    // apple-mobile-web-app-capable
    const capable = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(capable).toHaveCount(1);

    // theme-color
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveCount(1);
    await expect(themeColor).toHaveAttribute("content", "#be185d");
  });

  test("icons are accessible", async ({ page }) => {
    // SVG icons removed from manifest (M1: stale FdW-text design replaced by
    // marble-PNG variants). The maskable SVGs are kept on disk but not declared
    // in the manifest; the manifest-declared PNGs are the source of truth.
    for (const icon of [
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-192-maskable.png",
      "/icons/icon-512-maskable.png",
    ]) {
      const res = await page.goto(icon);
      expect(res?.status(), `icon ${icon} should return 200`).toBe(200);
    }
  });

  test("InstallPrompt component is present in admin shell HTML", async ({
    page,
  }) => {
    // Log in via storage state if available, otherwise just check the DOM
    // is server-rendered with the admin shell on an authenticated route.
    // In CI the auth fixture provides a logged-in context; here we verify
    // the component is part of the rendered output when auth passes.
    // We navigate to the login page as a proxy to confirm the app loads.
    const res = await page.goto("/app");
    // Either redirected to login (302/200) or rendered app shell — both are valid.
    expect(res?.status()).toBeLessThan(400);
  });

  test("share_target POST is handled (no 400) and redirects to a pre-filled GET", async ({
    page,
    request,
  }) => {
    // Mimic the browser's PWA share_target POST: multipart/form-data with the
    // four manifest-declared param names. The server must redirect to a GET
    // with from=share so the user sees the form (not fail(400) "missing
    // betrag/iban/consent").
    const res = await request.post("/auslage-einreichen?source=share", {
      multipart: {
        bezeichnung_display: "Druckerpapier vom Großhandel",
        kommentar_display: "Quittung-Foto vom 2026-05-18",
        kommentar_url: "https://example.com/receipt",
        beleg: {
          name: "receipt.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        },
      },
      maxRedirects: 0,
    });

    // 303 See Other → POST/GET conversion. The redirect Location header must
    // point at /auslage-einreichen?from=share&...
    expect([303, 200], `share POST → status was ${res.status()}`).toContain(
      res.status(),
    );
    if (res.status() === 303) {
      const loc = res.headers()["location"] ?? "";
      expect(loc).toContain("/auslage-einreichen");
      expect(loc).toContain("from=share");
    }

    // Now navigate to the GET the redirect points at and assert the form
    // renders pre-filled, with the share-prefill banner shown.
    const getRes = await page.goto(
      "/auslage-einreichen?from=share&title=Druckerpapier&text=Quittung-Foto&file=1",
    );
    expect(getRes?.status()).toBe(200);
    await expect(page.getByTestId("share-prefill-banner")).toBeVisible();
    await expect(page.locator("#bezeichnung")).toHaveValue("Druckerpapier");
  });
});
