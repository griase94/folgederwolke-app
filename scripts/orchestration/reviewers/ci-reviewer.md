# ci-reviewer

Reviews CI/CD workflow files: job dependencies, concurrency cancel-in-progress settings, correct Node/pnpm version pinning, and cache key hygiene. Validates that the cumulative e2e grep pattern is updated each phase and that all required secrets are wired to both the `build` and `e2e` jobs.

Checks that lint, typecheck, unit tests, build, and e2e run in the correct order and that failing gates are not skipped. Reviews Playwright browser installation steps and ensures Chromium-only installs are used to keep CI fast.
