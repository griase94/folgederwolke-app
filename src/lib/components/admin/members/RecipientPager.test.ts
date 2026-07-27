/**
 * RecipientPager — ‹ Name › preview pager (selected recipients only).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import RecipientPager from "./RecipientPager.svelte";

afterEach(() => cleanup());

const NAMES = ["Jonas Köhler", "Tim Schäfer", "Tanja Ulrich"];

describe("RecipientPager", () => {
  it("shows the first full name and 1/3 position", () => {
    render(RecipientPager, { props: { names: NAMES } });
    expect(screen.getByTestId("recipient-pager-name").textContent).toMatch(
      /Jonas Köhler/,
    );
    expect(screen.getByTestId("recipient-pager-position").textContent).toMatch(
      /1\/3/,
    );
  });

  it("next advances the name + position; prev goes back", async () => {
    render(RecipientPager, { props: { names: NAMES } });
    await fireEvent.click(screen.getByTestId("recipient-pager-next"));
    expect(screen.getByTestId("recipient-pager-name").textContent).toMatch(
      /Tim Schäfer/,
    );
    expect(screen.getByTestId("recipient-pager-position").textContent).toMatch(
      /2\/3/,
    );
    await fireEvent.click(screen.getByTestId("recipient-pager-prev"));
    expect(screen.getByTestId("recipient-pager-name").textContent).toMatch(
      /Jonas Köhler/,
    );
  });

  it("prev is disabled at the start, next at the end", async () => {
    render(RecipientPager, { props: { names: NAMES, index: 2 } });
    expect(
      (screen.getByTestId("recipient-pager-next") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("recipient-pager-prev") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("hides the position readout for a single recipient", () => {
    render(RecipientPager, { props: { names: ["Jonas Köhler"] } });
    expect(screen.queryByTestId("recipient-pager-position")).toBeNull();
    expect(screen.getByTestId("recipient-pager-name").textContent).toMatch(
      /Jonas Köhler/,
    );
  });
});
