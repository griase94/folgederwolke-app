import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],
  prettier,
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Non-standard browser API declared in src/app.d.ts
        BeforeInstallPromptEvent: "readonly",
      },
    },
    rules: {
      // Allow intentionally-unused params/vars when prefixed with `_`.
      // Phase 9 storage impls use this for interface-required args that a given
      // backend doesn't need (e.g. _mimeType for LocalFs, _year for the mock).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    ignores: [
      "build/",
      ".svelte-kit/",
      "dist/",
      "node_modules/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "src/lib/components/ui/**",
      ".vercel/",
      "drizzle/",
    ],
  },
  // Phase 9: restrict @vercel/blob imports to the one allowed adapter file.
  // All other callers must go through the FileStorage interface
  // (getFileStorage() from $lib/server/files/storage.js).
  {
    files: ["src/**/*.ts", "src/**/*.svelte"],
    ignores: [
      "src/lib/server/files/vercel-blob-impl.ts", // The one allowed file
      "src/**/*.test.ts", // tests may import for mocks
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@vercel/blob",
              message:
                "Use FileStorage interface via getFileStorage() from '$lib/server/files/storage.js'",
            },
          ],
        },
      ],
    },
  },
];
