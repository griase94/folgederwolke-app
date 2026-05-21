// Drain pending timers at the end of every test file to prevent bits-ui's
// body-scroll-lock module from leaking setTimeout callbacks that fire AFTER
// vitest's happy-dom environment is torn down.
//
// Root cause: bits-ui's BodyScrollLock.onDestroyEffect calls
// scheduleCleanupIfNoNewLocks which registers window.setTimeout(..., 24).
// When a test renders a bits-ui component (DropdownMenu, Sheet, Dialog, etc.)
// that opens and then unmounts without closing, the cleanup timer fires after
// vitest destroys the happy-dom environment, producing:
//   ReferenceError: document is not defined
//     at Proxy.resetBodyStyle bits-ui/dist/internal/body-scroll-lock.svelte.js
//
// The fix: after every test file runs, briefly switch to fake timers, flush
// any remaining pending timers (including bits-ui's 24ms cleanup callback),
// then restore real timers. The timers fire while happy-dom is still alive.
//
// This is a global afterAll — it runs after every test file because
// setupFiles are evaluated once per worker/fork before any test file, and
// afterAll at the top level of a setupFile applies to the entire suite.
import { afterAll, vi } from "vitest";

afterAll(() => {
  vi.useFakeTimers();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});
