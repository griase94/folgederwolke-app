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
    adapter: isVercel ? adapterVercel() : adapterNode(),
  },
};

export default config;
