import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import ExportManifestLine from "./ExportManifestLine.svelte";

afterEach(() => cleanup());

describe("ExportManifestLine", () => {
  it("shows the byte-exact filename (mono) + description", () => {
    render(ExportManifestLine, {
      props: {
        filename: "03_Spendenliste-2025.csv",
        desc: "Spendenliste (CSV, BMF-Pflicht)",
      },
    });
    const fn = screen.getByText("03_Spendenliste-2025.csv");
    expect(fn.classList.contains("el-fn")).toBe(true);
    expect(fn.getAttribute("title")).toBe("03_Spendenliste-2025.csv");
    expect(screen.getByText("Spendenliste (CSV, BMF-Pflicht)")).toBeTruthy();
  });

  it("renders the highlight variant + badge for the GoBD-Z3 line", () => {
    const { container } = render(ExportManifestLine, {
      props: {
        filename: "05_GoBD-Z3-2025/gobd_z3_2025.xml",
        highlight: true,
        badge: "GoBD-Z3",
        note: "IDEA-XML",
      },
    });
    expect(container.querySelector(".export-line.is-highlight")).not.toBeNull();
    expect(screen.getByText("GoBD-Z3")).toBeTruthy();
    expect(screen.getByText("IDEA-XML")).toBeTruthy();
  });
});
