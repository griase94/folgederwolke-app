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
    // regions:["fra1"] co-locates compute with the Neon EU/Frankfurt region
    // (and the fra1 Vercel Blob store) to cut DB round-trip latency.
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
        // app.html ships an inline <style> block + the #fdw-launch launch overlay
        // (inline <svg>), which rely on 'unsafe-inline'. SvelteKit's auto CSP does NOT
        // nonce the app.html template, so do not drop 'unsafe-inline' / add a nonce here
        // without first moving those styles into a SvelteKit-governed component.
        "style-src": ["self", "unsafe-inline"],
        "script-src": ["self"],
        "connect-src": ["self"],
        // The invoice live-PDF preview renders into an <iframe> whose src is a
        // `blob:` URL (URL.createObjectURL — InvoicePdfPreview.svelte). frame-src
        // governs iframe sources; without it, the iframe falls back to
        // default-src ('self') and the blob: preview is blocked. child-src is the
        // pre-CSP3 fallback for older browsers.
        "frame-src": ["self", "blob:"],
        "child-src": ["self", "blob:"],
        "frame-ancestors": ["none"],
        "base-uri": ["self"],
        "object-src": ["none"],
        "form-action": ["self"],
      },
    },
  },
};

export default config;
