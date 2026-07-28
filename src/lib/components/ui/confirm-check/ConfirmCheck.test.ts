import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import ConfirmCheck from "./ConfirmCheck.svelte";

afterEach(() => cleanup());

const label = createRawSnippet(() => ({ render: () => "<span>Ich bestätige</span>" }));

describe("ConfirmCheck tone", () => {
  it("destroy (default) uses the sev-critical accent when checked", () => {
    const { container } = render(ConfirmCheck, {
      props: { checked: true, children: label },
    });
    const box = container.querySelector("span[aria-hidden]")!;
    expect(box.className).toContain("var(--sev-critical)");
  });

  it("complete uses the type-einnahme accent when checked", () => {
    const { container } = render(ConfirmCheck, {
      props: { checked: true, tone: "complete", children: label },
    });
    const box = container.querySelector("span[aria-hidden]")!;
    expect(box.className).toContain("var(--type-einnahme)");
  });
});
