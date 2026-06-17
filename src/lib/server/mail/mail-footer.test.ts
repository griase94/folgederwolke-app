// @vitest-environment node
/**
 * @phase-1 @gmail-safe
 *
 * Unit test for the shared, prop-driven MailFooter component (white-label
 * Phase 1, Task 2.1). The footer must render entirely from props — no
 * hardcoded "Folge der Wolke" identity literal — so a forking Verein can
 * deploy without impersonating FdW.
 */

import { describe, expect, it } from "vitest";
import { renderMailTemplate } from "./render.js";
import MailFooter from "./templates/MailFooter.svelte";
import { BRAND_PRIMARY_STRONG } from "$lib/brand.js";

describe("MailFooter", () => {
  const footerProps = {
    vereinName: "Verein X e.V.",
    adresse: "Str 1, Ort",
    vr: "VR 999",
    steuernummer: "1/2/3",
  };

  it("renders all four identity fields from props", () => {
    const { html } = renderMailTemplate(MailFooter as never, footerProps);

    expect(html).toContain("Verein X e.V.");
    expect(html).toContain("Str 1, Ort");
    expect(html).toContain("VR 999");
    expect(html).toContain("1/2/3");
  });

  it("contains no hardcoded Folge der Wolke literal", () => {
    const { html } = renderMailTemplate(MailFooter as never, footerProps);

    expect(html).not.toContain("Folge der Wolke");
  });

  it("uses the default brand color when none is passed", () => {
    const { html } = renderMailTemplate(MailFooter as never, footerProps);

    // The default brandColor (BRAND_PRIMARY_STRONG — Aurora fill-behind-white
    // tier) drives the footer accent on the Verein name; mail clients strip
    // CSS vars so this is a render-time prop.
    expect(html).toContain(BRAND_PRIMARY_STRONG);
  });

  it("honours an explicit brandColor prop", () => {
    const { html } = renderMailTemplate(MailFooter as never, {
      ...footerProps,
      brandColor: "#123456",
    });

    expect(html).toContain("#123456");
    expect(html).not.toContain(BRAND_PRIMARY_STRONG);
  });
});
