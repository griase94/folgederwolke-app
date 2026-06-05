// BelegViewer.test.ts — Task 5, Phase 3.
//
// happy-dom does not fully implement <canvas>/2d-context and cannot render a
// real PDF, so we MOCK pdfjs-dist: getDocument().promise resolves a fake doc
// with numPages + getPage().render() that no-ops. We assert STRUCTURE/behavior
// (not pixels):
//   - image mimeType → renders <img src="/api/files/<id>/blob">
//   - pdf mimeType   → attempts canvas render + shows page/zoom controls
//   - a rejected getDocument → shows the "Original öffnen" fallback link
//   - mode="fold" vs "inline" render the right shell
//   - the "Original öffnen" link points at the inlined blobUrl
//
// We control whether getDocument resolves or rejects per-test via a module-level
// switch the vi.mock factory reads.
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mutable switch read by the pdfjs mock factory. Toggle to simulate a PDF that
// fails to load (encrypted/corrupt/huge) so we can assert the fallback.
const pdfState = { shouldReject: false };

// The component fetches the blob bytes before handing them to pdfjs. Stub fetch
// so the PDF byte-fetch resolves with fake bytes (happy-dom's real fetch would
// otherwise hit the network). pdfjs itself is mocked, so the bytes are inert.
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as unknown as Response),
  );
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.clearAllMocks();
});

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: pdfState.shouldReject
      ? Promise.reject(new Error("corrupt pdf"))
      : Promise.resolve({
          numPages: 1,
          getPage: () =>
            Promise.resolve({
              getViewport: () => ({ width: 100, height: 141 }),
              render: () => ({ promise: Promise.resolve() }),
            }),
          destroy: () => Promise.resolve(),
        }),
  }),
}));

import BelegViewer from "./BelegViewer.svelte";

// happy-dom's <canvas> returns null from getContext("2d"). Stub a no-op 2d
// context so the on-screen render path completes deterministically (in a real
// browser getContext succeeds). Without this the success path races the
// render-failure fallback and tests flake. The fake context's methods are
// inert — we assert structure, not pixels.
beforeEach(() => {
  pdfState.shouldReject = false;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as unknown as CanvasRenderingContext2D,
  );
});

describe("BelegViewer", () => {
  it("renders an <img> for image belege", () => {
    render(BelegViewer, {
      props: {
        fileId: "f1",
        mimeType: "image/jpeg",
        originalFilename: "b.jpg",
      },
    });
    expect((screen.getByRole("img") as HTMLImageElement).src).toContain(
      "/api/files/f1/blob",
    );
  });

  it("renders zoom + page controls + Original öffnen for PDFs", async () => {
    render(BelegViewer, {
      props: {
        fileId: "f2",
        mimeType: "application/pdf",
        originalFilename: "b.pdf",
      },
    });
    const link = await screen.findByRole("link", { name: /Original öffnen/i });
    expect(link).toBeTruthy();
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe(
      "/api/files/f2/blob",
    );
    expect(
      screen.getByRole("button", { name: /vergrößern|\+|zoom in/i }),
    ).toBeTruthy();
  });

  it("attempts an on-screen canvas render for PDFs (no OffscreenCanvas)", async () => {
    const { container } = render(BelegViewer, {
      props: {
        fileId: "f3",
        mimeType: "application/pdf",
        originalFilename: "b.pdf",
        mode: "inline",
      },
    });
    await waitFor(() => {
      expect(container.querySelector("canvas")).not.toBeNull();
    });
  });

  it("falls back to the body 'Original öffnen' link when the PDF cannot be rendered", async () => {
    pdfState.shouldReject = true;
    render(BelegViewer, {
      props: {
        fileId: "f4",
        mimeType: "application/pdf",
        originalFilename: "broken.pdf",
        mode: "inline",
      },
    });
    // The header always carries an "Original öffnen" icon-link; the BODY render-
    // failure fallback is a separate link that only mounts once `pdfFailed`
    // flips (a later microtask after the rejected getDocument). We scope to the
    // body fallback via its testid so we deterministically assert the FALLBACK
    // link — not the always-present header link — points at the blobUrl. The
    // fallback also waits for the "Vorschau nicht verfügbar" copy, proving the
    // canvas branch was abandoned and the graceful fallback rendered.
    const fallback = (await screen.findByTestId(
      "beleg-fallback-link",
    )) as HTMLAnchorElement;
    expect(screen.getByText(/Vorschau nicht verfügbar/i)).toBeTruthy();
    expect(fallback.getAttribute("href")).toBe("/api/files/f4/blob");
    // The body fallback carries a distinct accessible name so it is not a second
    // link identically named "Original öffnen" for screen-reader users.
    expect(fallback.getAttribute("aria-label")).toBe(
      "Original in neuem Tab öffnen",
    );
    // And the canvas branch is gone (we fell back, not rendered a blank canvas).
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("renders the inline shell (permanent viewer) for mode=inline", () => {
    const { container } = render(BelegViewer, {
      props: {
        fileId: "f5",
        mimeType: "image/png",
        originalFilename: "x.png",
        mode: "inline",
      },
    });
    expect(
      container.querySelector('[data-beleg-mode="inline"]'),
    ).not.toBeNull();
  });

  it("renders the fold peek card for mode=fold and opens full-screen on tap", async () => {
    const { container } = render(BelegViewer, {
      props: {
        fileId: "f6",
        mimeType: "image/png",
        originalFilename: "x.png",
        mode: "fold",
      },
    });
    expect(container.querySelector('[data-beleg-mode="fold"]')).not.toBeNull();
    // The peek card is a button that opens the full-screen viewer.
    const peek = screen.getByRole("button", { name: /Beleg ansehen|ansehen/i });
    await fireEvent.click(peek);
    // Once opened, the full-screen viewer exposes the Schließen control.
    expect(
      await screen.findByRole("button", { name: /schließen|close/i }),
    ).toBeTruthy();
  });

  it("renders page-1 to a small canvas in the fold peek for PDFs (icon only on failure)", async () => {
    const { container } = render(BelegViewer, {
      props: {
        fileId: "f7",
        mimeType: "application/pdf",
        originalFilename: "b.pdf",
        mode: "fold",
      },
    });
    // P3-05: the fold peek renders page-1 to a small canvas by default.
    await waitFor(() => {
      expect(container.querySelector("canvas")).not.toBeNull();
    });
  });

  it("shows originalFilename in the header (inline)", () => {
    render(BelegViewer, {
      props: {
        fileId: "f8",
        mimeType: "image/png",
        originalFilename: "rechnung-2026.png",
        mode: "inline",
      },
    });
    expect(screen.getByText(/rechnung-2026\.png/)).toBeTruthy();
  });
});
