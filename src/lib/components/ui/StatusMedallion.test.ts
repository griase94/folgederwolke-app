import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import StatusMedallion from "./StatusMedallion.svelte";

afterEach(() => cleanup());

const icon = createRawSnippet(() => ({ render: () => `<svg></svg>` }));

describe("StatusMedallion", () => {
  it("carries the tone as a data attribute", () => {
    render(StatusMedallion, { props: { tone: "done", icon } });
    expect(
      screen.getByTestId("status-medallion").getAttribute("data-tone"),
    ).toBe("done");
  });

  it("INVARIANT: done=green (einnahme), reject=critical, s404=neutral — tones never cross", () => {
    render(StatusMedallion, { props: { tone: "done", icon } });
    expect(screen.getByTestId("status-medallion").className).toContain(
      "text-type-einnahme",
    );
    cleanup();
    render(StatusMedallion, { props: { tone: "reject", icon } });
    expect(screen.getByTestId("status-medallion").className).toContain(
      "text-severity-critical-text",
    );
    cleanup();
    render(StatusMedallion, { props: { tone: "s404", icon } });
    const el = screen.getByTestId("status-medallion").className;
    expect(el).toContain("text-ink-500");
    expect(el).not.toMatch(/einnahme|critical/);
  });
});
