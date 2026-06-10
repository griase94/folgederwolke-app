import { cpus } from "node:os";
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

// Bound the number of parallel test forks (= the number of cloned worker DBs
// alive at once). Conservative by default so a 2-core CI runner's postgres
// service isn't thrashed; override with VITEST_MAX_FORKS. Local dev (many
// cores) gets up to 4.
const maxForks =
  Number(process.env["VITEST_MAX_FORKS"]) ||
  Math.max(2, Math.min(4, (cpus().length || 2) - 1));

export default defineConfig({
  plugins: [sveltekit()],
  // Use the browser export condition so @testing-library/svelte can mount
  // components — Svelte's `mount()` is unavailable in the SSR build.
  resolve: {
    conditions: ["browser"],
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: [
      "src/**/*.{test,spec}.{js,ts}",
      "tests/unit/**/*.{test,spec}.{js,ts}",
      "tests/canary/**/*.{test,spec}.{js,ts}",
      "tests/integration/**/*.{test,spec}.{js,ts}",
    ],
    pool: "forks",
    // Each test file runs in its own fork (isolate:true default → fresh module
    // registry, incl. db/index.ts's lazy client). The per-file setup
    // tests/setup/per-worker-db.ts clones a pristine DB from the seeded template
    // and repoints DATABASE_URL at it, so files run in PARALLEL and can never
    // observe or mutate each other's data — the suite is order-independent on
    // any platform (no shared-DB leakage). maxForks bounds the live clone count.
    poolOptions: { forks: { maxForks } },
    globalSetup: "./tests/vitest-global-setup.ts",
    // per-worker-db.ts MUST be first: it injects the per-fork DATABASE_URL /
    // FILE_STORAGE_ROOT before any test imports db/index.ts or env.ts.
    setupFiles: [
      "./tests/setup/per-worker-db.ts",
      "./tests/setup/bits-ui-body-scroll-lock-stub.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{js,ts,svelte}"],
      exclude: ["src/**/*.{test,spec}.{js,ts}", "src/lib/components/ui/**"],
    },
  },
});
