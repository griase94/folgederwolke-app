// Drain pending bits-ui body-scroll-lock cleanup timers between test files,
// so they fire while happy-dom is still alive instead of leaking into the
// next file's environment.
//
// Root cause: bits-ui's BodyScrollLock.onDestroyEffect calls
// scheduleCleanupIfNoNewLocks which registers `window.setTimeout(..., 24)`.
// When a test renders a bits-ui component (Sheet, Dialog, DropdownMenu, …)
// that opens and then unmounts, the cleanup timer fires ~24ms later. If
// vitest tears down happy-dom for the file before that timer fires, the
// callback runs against a stale environment and throws:
//   ReferenceError: document is not defined
//     at Proxy.resetBodyStyle bits-ui/dist/internal/body-scroll-lock.svelte.js
//
// Why fake timers don't fix this: `vi.useFakeTimers()` does NOT retroactively
// convert PRE-EXISTING real timers to fake ones. bits-ui scheduled the
// cleanup with the real `setTimeout` BEFORE we entered fake-timer mode, so
// `vi.runOnlyPendingTimers()` can't drain it. The previous iteration of this
// stub did exactly that and consequently never actually flushed anything.
//
// What works: wait 50ms with the REAL timer queue at the end of each test
// file. That's longer than bits-ui's 24ms cleanup delay, so any pending
// cleanup callbacks fire while document still exists. Costs ~50ms per test
// file (~6s across the suite) — acceptable.
//
// This is a global `afterAll` — setupFiles run before every test file, so
// a top-level `afterAll` registers per-file.
import { afterAll } from "vitest";

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});
