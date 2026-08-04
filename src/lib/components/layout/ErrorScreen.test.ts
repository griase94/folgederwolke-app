// ErrorScreen.test.ts
//
// Pins the PWA dead-end rule (DESIGN-GUIDELINES §4, Debt-Register L2): the two
// generic +error boundaries share ONE body, and every recovery is an explicit
// navigation. `history.back()` is a no-op in the installed PWA — there is no
// browser chrome and a cold start has an empty history stack.
//
// Reset lane → `pnpm test --run <file>`.
import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import ErrorScreen from "./ErrorScreen.svelte";

afterEach(() => cleanup());

const base = {
  status: 404,
  title: "Seite nicht gefunden",
  description: "Diese Admin-Seite existiert nicht.",
};

describe("ErrorScreen", () => {
  it("renders every action as a real link, never a button", () => {
    const { container } = render(ErrorScreen, {
      props: {
        ...base,
        actions: [
          { href: "/", label: "Zur Startseite" },
          { href: "/sign-in", label: "Anmelden", variant: "outline" as const },
        ],
      },
    });
    expect(container.querySelector("button")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Zur Startseite" }).getAttribute("href"),
    ).toBe("/");
    expect(
      screen.getByRole("link", { name: "Anmelden" }).getAttribute("href"),
    ).toBe("/sign-in");
  });

  it("the /app shape offers exactly one explicit destination (no 'Zurück' no-op)", () => {
    render(ErrorScreen, {
      props: {
        ...base,
        actions: [{ href: "/app", label: "Zurück zum Dashboard" }],
      },
    });
    expect(screen.queryByRole("button", { name: "Zurück" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Zurück zum Dashboard" })
        .getAttribute("href"),
    ).toBe("/app");
  });

  it("states status, title and description", () => {
    const { container } = render(ErrorScreen, {
      props: { ...base, status: 500, actions: [{ href: "/app", label: "Ok" }] },
    });
    expect(
      container
        .querySelector('[data-slot="error-screen"]')
        ?.getAttribute("data-status"),
    ).toBe("500");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      base.title,
    );
    expect(screen.getByText(base.description)).toBeTruthy();
  });

  it("standalone paints its own viewport surface; embedded leaves it to the shell", () => {
    const { container, unmount } = render(ErrorScreen, {
      props: { ...base, actions: [], standalone: true },
    });
    expect(
      container.querySelector('[data-slot="error-screen"]')?.className,
    ).toContain("min-h-svh");
    unmount();
    const embedded = render(ErrorScreen, { props: { ...base, actions: [] } });
    const cls = embedded.container.querySelector(
      '[data-slot="error-screen"]',
    )?.className;
    expect(cls).toContain("py-16");
    expect(cls).not.toContain("min-h-svh");
    expect(cls).not.toContain("bg-background");
  });
});
