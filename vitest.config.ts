import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: [
      "src/**/*.{test,spec}.{js,ts}",
      "tests/unit/**/*.{test,spec}.{js,ts}",
      "tests/canary/**/*.{test,spec}.{js,ts}",
    ],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    globalSetup: "./tests/vitest-global-setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{js,ts,svelte}"],
      exclude: ["src/**/*.{test,spec}.{js,ts}", "src/lib/components/ui/**"],
    },
  },
});
