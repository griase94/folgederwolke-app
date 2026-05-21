import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

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
    poolOptions: { forks: { singleFork: true } },
    // Phase 9: tests share a single Postgres database. With fileParallelism=true
    // (default), vitest interleaves beforeEach/afterAll across files in the
    // single fork, which makes multiple admin pools race on the same `files`
    // table and produces non-deterministic state leak. Force file-level
    // serialization to keep the DB fixtures hermetic.
    fileParallelism: false,
    globalSetup: "./tests/vitest-global-setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{js,ts,svelte}"],
      exclude: ["src/**/*.{test,spec}.{js,ts}", "src/lib/components/ui/**"],
    },
  },
});
