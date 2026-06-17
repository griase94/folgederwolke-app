import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import InlineAlert from "./InlineAlert.svelte";

afterEach(() => cleanup());

describe("InlineAlert", () => {
  it("renders info severity with role=status and data attributes", () => {
    const { getByTestId } = render(InlineAlert, {
      props: {
        severity: "info",
        text: "Du wurdest abgemeldet.",
        testid: "sign-in-reason-banner",
        reason: "signed-out",
      },
    });
    const el = getByTestId("sign-in-reason-banner");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.textContent).toContain("Du wurdest abgemeldet.");
    expect(el.getAttribute("data-reason")).toBe("signed-out");
  });

  it("renders warn severity with role=alert", () => {
    const { getByTestId } = render(InlineAlert, {
      props: {
        severity: "warn",
        text: "Dein Account hat keinen Zugriff auf diese Seite.",
        testid: "sign-in-reason-banner",
        reason: "not-authorised",
      },
    });
    const el = getByTestId("sign-in-reason-banner");
    expect(el.getAttribute("role")).toBe("alert");
    expect(el.textContent).toContain("keinen Zugriff");
  });

  it("renders an action link when linkHref + linkLabel are provided", () => {
    const { getByRole } = render(InlineAlert, {
      props: {
        severity: "warn",
        text: "Dein Account hat keinen Zugriff auf diese Seite.",
        linkHref: "/auslage-einreichen",
        linkLabel: "Auslage ohne Anmeldung einreichen →",
      },
    });
    const a = getByRole("link", {
      name: "Auslage ohne Anmeldung einreichen →",
    });
    expect(a.getAttribute("href")).toBe("/auslage-einreichen");
  });

  it("renders no link when linkHref is not provided", () => {
    const { container } = render(InlineAlert, {
      props: { severity: "info", text: "Nur Text." },
    });
    expect(container.querySelector("a")).toBeNull();
  });
});
