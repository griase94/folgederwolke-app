import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import GobdTrustBlock from "./GobdTrustBlock.svelte";

afterEach(() => cleanup());

describe("GobdTrustBlock", () => {
  it("renders the default GoBD trust copy + SHA-Kette meta", () => {
    render(GobdTrustBlock);
    expect(screen.getByText("GoBD-sicher dokumentiert")).toBeTruthy();
    expect(screen.getByText(/im Audit-Log verankert/)).toBeTruthy();
    expect(screen.getByText("SHA-256-Kette")).toBeTruthy();
  });

  it("accepts custom title/sub and toggles the stacked variant", () => {
    const { container } = render(GobdTrustBlock, {
      props: { title: "GoBD-Z3 Export", sub: "Betriebsprüfung", stacked: true },
    });
    expect(screen.getByText("GoBD-Z3 Export")).toBeTruthy();
    expect(container.querySelector(".gobd.is-stacked")).not.toBeNull();
  });

  it("hides the integ column when integKey is empty", () => {
    const { container } = render(GobdTrustBlock, { props: { integKey: "" } });
    expect(container.querySelector(".integ")).toBeNull();
  });
});
