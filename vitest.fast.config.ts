// vitest.fast.config.ts — for PURE-LOGIC tests only (no DB). Run: pnpm test:fast <file>
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  // Use the browser export condition so $lib aliases and Svelte imports resolve.
  resolve: {
    conditions: ["browser"],
  },
  test: {
    environment: "happy-dom",
    globals: true,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // NO globalSetup — these tests must not touch the DB.
    // NO setupFiles — the bits-ui scroll-lock stub is only needed for component
    //   DOM tests, not pure-logic tests.
  },
});
