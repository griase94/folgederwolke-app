// Drain bits-ui's deferred body-scroll-lock restore timer at the end of every
// test file, so it can't fire after vitest tears down the happy-dom environment.
//
// Root cause: bits-ui's BodyScrollLock.onDestroyEffect schedules
// `window.setTimeout(resetBodyStyle, ~24ms)` when a Sheet/Dialog/DropdownMenu is
// unmounted while open (e.g. via testing-library `cleanup()`). `resetBodyStyle`
// touches `document.body`; if the environment is destroyed before the timer
// fires, the whole run aborts (even when every test passed) with:
//   ReferenceError: document is not defined
//     at Proxy.resetBodyStyle bits-ui/dist/internal/body-scroll-lock.svelte.js
//
// Why the previous fake-timers approach did NOT work: the cleanup timer is
// registered with the REAL `window.setTimeout` during unmount, BEFORE this hook
// runs. `vi.useFakeTimers()` only replaces the timer functions going forward, so
// `vi.runOnlyPendingTimers()` never sees the already-scheduled real timer — the
// hook was effectively a no-op and the flake was pure timing luck.
//
// Fix: keep REAL timers and simply wait past bits-ui's ~24ms delay in an async
// afterAll, while happy-dom is still alive. Timers fire in deadline order, so
// the 24ms cleanup callback always runs before this 50ms wait resolves
// (load delays both equally, preserving the order) — it resets the body style
// harmlessly and is gone before teardown. afterAll (once per file) is enough:
// only the final test's cleanup timer risks outliving the environment; earlier
// ones fire naturally during the file run.
import { afterAll } from "vitest";

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});
