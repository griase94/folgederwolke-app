/**
 * Keyboard helpers for Playwright E2E tests.
 *
 * Global shortcuts (⌘K search, inbox navigation) are wired through
 * `<svelte:window onkeydown={…}>`, so the listener exists only once the page
 * has hydrated. A keypress that lands before hydration is dropped without a
 * trace: no listener runs, nothing changes, and no later assertion can bring
 * it back — `expect(input).toBeFocused()` then polls a state that will never
 * flip and fails with "inactive" even though the element is perfectly fine.
 *
 * That is a race, not a bug in the shortcut: a specs' first action after
 * sign-in can outrun hydration whenever the run is slow (cold shard, throttled
 * CI runner). The only shape that is correct on both sides of hydration is to
 * retry the gesture itself, which is what this helper does.
 */

import { expect, type Page } from "@playwright/test";

/**
 * Press a global keyboard shortcut until `check` passes.
 *
 * `check` should assert the observable effect of the shortcut (e.g. that the
 * search input is focused). It is re-run after every press, so it must use a
 * short per-attempt timeout; the overall budget is `timeout`.
 *
 * Fails with the assertion error from `check` if the shortcut never takes
 * effect — a genuinely broken shortcut still turns the test red.
 */
export async function pressShortcutUntil(
  page: Page,
  shortcut: string,
  check: () => Promise<unknown>,
  timeout = 15_000,
): Promise<void> {
  await expect(async () => {
    await page.keyboard.press(shortcut);
    await check();
  }).toPass({ timeout, intervals: [100, 200, 400, 800] });
}
