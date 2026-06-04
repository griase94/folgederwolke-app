import adapterNode from "@sveltejs/adapter-node";
import adapterVercel from "@sveltejs/adapter-vercel";

// Vercel build sets VERCEL=1; local/CI builds use adapter-node so `pnpm preview`
// + Playwright E2E work via `node build/index.js`.
const isVercel = process.env["VERCEL"] === "1";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: ({ filename }) =>
      filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
  },
  kit: {
    adapter: isVercel ? adapterVercel({ regions: ["fra1"] }) : adapterNode(),
    // CSP via SvelteKit: auto-mode adds nonces/hashes for SvelteKit's own inline
    // hydration scripts. We define the rest of the directives here so the framework
    // emits one coherent header (rather than the manual one previously set in
    // hooks.server.ts, which blocked hydration). Other security headers (HSTS,
    // X-Frame-Options, Permissions-Policy, etc.) remain in hooks.server.ts.
    csp: {
      mode: "auto",
      directives: {
        "default-src": ["self"],
        "img-src": [
          "self",
          "blob:",
          "data:",
          "https://*.googleusercontent.com",
        ],
        "style-src": ["self", "unsafe-inline"],
        "script-src": ["self"],
        "connect-src": ["self"],
        "frame-ancestors": ["none"],
        "base-uri": ["self"],
        "object-src": ["none"],
        "form-action": ["self"],
      },
    },
  },
};

export default config;
