/**
 * FieldGroup — the ONE label/hint/error anatomy (§3).
 *
 * Guards the drift this primitive exists to end: 37 label chains, errors in
 * three colour families, and seven ways of drawing a required asterisk.
 */
import { render, cleanup, screen } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import Harness from "./FieldGroup.test.svelte";

afterEach(() => cleanup());

describe("FieldGroup", () => {
  it("labels the control it is given (for/id actually connect)", () => {
    const { container } = render(Harness, { props: {} });
    const label = container.querySelector("label")!;
    expect(label.getAttribute("for")).toBe("fg-test");
    expect(container.querySelector("#fg-test")).toBeTruthy();
    expect(label.className).toContain("text-sm");
    expect(label.className).toContain("font-medium");
    expect(label.className).toContain("text-ink-900");
  });

  it("draws the required asterisk in severity-critical and hides it from SR", () => {
    const { container } = render(Harness, { props: { required: true } });
    const star = container.querySelector("label span")!;
    expect(star.textContent).toContain("*");
    expect(star.className).toContain("text-severity-critical");
    // The control's own `required` is what gets announced; the glyph must not
    // be read out as "star".
    expect(star.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("#fg-test")!.hasAttribute("required")).toBe(true);
  });

  it("puts the optional marker in the hint, never in the label", () => {
    const { container } = render(Harness, { props: { optional: true } });
    expect(container.querySelector("label")!.textContent).not.toContain("optional");
    expect(screen.getByText(/\(optional\)/)).toBeTruthy();
  });

  it("announces the error and REPLACES the hint with it", () => {
    const { container } = render(Harness, {
      props: { hint: "So steht es auf der Rechnung", error: "Bitte ausfüllen" },
    });
    const err = container.querySelector('[data-slot="field-error"]')!;
    expect(err.textContent).toBe("Bitte ausfüllen");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.className).toContain("text-severity-critical");
    // hint is gone while the error stands
    expect(container.querySelector('[data-slot="field-hint"]')).toBeNull();
  });

  it("uses ONE error colour family — never destructive or a raw red", () => {
    const { container } = render(Harness, { props: { error: "Fehler" } });
    const cls = container.querySelector('[data-slot="field-error"]')!.className;
    expect(cls).not.toMatch(/text-destructive/);
    expect(cls).not.toMatch(/text-red-\d/);
  });

  it("stacks on the §3 rhythm", () => {
    const { container } = render(Harness, { props: {} });
    expect(container.querySelector('[data-slot="field-group"]')!.className).toContain("gap-1.5");
  });
});

describe("FieldGroup — a11y wiring is the primitive's job", () => {
  it("points the control at the error while one is showing", () => {
    const { container } = render(Harness, { props: { error: "Bitte ausfüllen" } });
    const input = container.querySelector("#fg-test")!;
    const err = container.querySelector('[data-slot="field-error"]')!;
    expect(input.getAttribute("aria-describedby")).toBe(err.id);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("points the control at the hint when there is no error", () => {
    const { container } = render(Harness, { props: { hint: "So steht es auf der Rechnung" } });
    const input = container.querySelector("#fg-test")!;
    const hint = container.querySelector('[data-slot="field-hint"]')!;
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("describes nothing when there is nothing to describe", () => {
    const { container } = render(Harness, { props: {} });
    expect(container.querySelector("#fg-test")!.getAttribute("aria-describedby")).toBeNull();
  });
});
