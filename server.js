/**
 * Custom Node server entry that wraps adapter-node's compiled handler.
 *
 * Why this file exists
 * --------------------
 * SvelteKit's built-in CSRF check (`kit.csrf.checkOrigin: true`, default)
 * runs BEFORE `hooks.server.ts` — see the `internal_respond` function in
 * @sveltejs/kit/src/runtime/server/respond.js (lines 75-103, kit 2.60.x).
 * Any POST with a form content-type whose `Origin` header doesn't match
 * `url.origin` (or is missing entirely) is rejected with a 403 before any
 * application code runs.
 *
 * Android PWA `share_target` intents — and a number of non-Chromium PWA
 * shells — routinely send the share POST with either NO `Origin` header
 * or one that doesn't match the PWA's scope origin (e.g. `null`, an
 * `intent://` shell, a different WebView host). To SvelteKit they look
 * indistinguishable from a CSRF attack, so the (correct) handler at
 * `/auslage-einreichen?source=share` is unreachable in production.
 *
 * Globally disabling `checkOrigin` (or setting `trustedOrigins: ['*']`,
 * which the framework compiles down to the same flag) would weaken CSRF
 * protection across the entire app — unacceptable.
 *
 * Instead we run our own thin Node entry that:
 *   1. Intercepts only `POST /auslage-einreichen?source=share` with a form
 *      content-type.
 *   2. Rewrites the inbound request's `Origin` header to match the server's
 *      own origin BEFORE the request reaches SvelteKit's handler. The
 *      `share_target` route is intentionally an idempotent redirect-only
 *      action (see src/routes/auslage-einreichen/+page.server.ts:151-177)
 *      so this rewrite cannot be used to write data: the worst an attacker
 *      could do is cause the victim's PWA to render a pre-filled GET. The
 *      DB-mutating "default" action of the same form still goes through the
 *      normal CSRF path because it lacks `?source=share`.
 *   3. Passes everything else through to adapter-node's stock handler
 *      unchanged, preserving CSRF for the rest of the app.
 *
 * Adapter coverage
 * ----------------
 * This entry is invoked by `node server.js` (Playwright `webServer` and any
 * self-hosted Node deployment). On Vercel (adapter-vercel) the prod stack
 * runs the framework-emitted serverless wrapper and this file is not used;
 * Chrome on Android (the dominant share_target client) sets `Origin` to the
 * PWA scope, which already matches and passes the CSRF check.
 *
 * If/when we move off Vercel or pick up a meaningful share of non-Chrome
 * PWA installs we'll port this same normalisation to a Vercel edge
 * middleware (`middleware.ts`) — but until then, doing it for adapter-node
 * is what unblocks the e2e suite and self-hosted users without giving up
 * CSRF protection anywhere else.
 */

import http from "node:http";
import process from "node:process";
import { handler } from "./build/handler.js";

const PORT = parseInt(process.env["PORT"] || "3000", 10);
const HOST = process.env["HOST"] || "0.0.0.0";

/**
 * Returns true iff the request is a PWA share_target POST intent that
 * SvelteKit's CSRF heuristic would otherwise wrongly block. Kept narrow
 * (path + query + method + content-type) so a malicious client can't use
 * the bypass to write data via the form's default action.
 *
 * @param {http.IncomingMessage} req
 * @returns {boolean}
 */
function isShareTargetPost(req) {
  if (req.method !== "POST") return false;
  if (!req.url) return false;
  const [path, query = ""] = req.url.split("?");
  if (path !== "/auslage-einreichen") return false;
  // URLSearchParams handles the (rare but legal) case where ?source=share
  // appears mid-query alongside other params.
  const params = new URLSearchParams(query);
  if (params.get("source") !== "share") return false;
  const ct = (req.headers["content-type"] || "").toString().toLowerCase();
  // The share_target manifest enctype is multipart/form-data; defend in depth
  // against urlencoded variants too.
  return (
    ct.startsWith("multipart/form-data") ||
    ct.startsWith("application/x-www-form-urlencoded")
  );
}

/**
 * Builds the same-origin URL that adapter-node would compute for this
 * request, so the rewritten Origin header matches `url.origin` exactly.
 * We honour the `ORIGIN` env var first (set in prod / Playwright config),
 * then `X-Forwarded-*` from a reverse proxy, then fall back to the Host
 * header.
 *
 * @param {http.IncomingMessage} req
 * @returns {string}
 */
function inferServerOrigin(req) {
  const fromEnv = process.env["ORIGIN"];
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      // fall through
    }
  }
  const protoHeader = req.headers["x-forwarded-proto"];
  const socket = /** @type {{encrypted?: boolean}} */ (req.socket);
  const proto =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) ||
    (socket.encrypted ? "https" : "http");
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || "";
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto}://${host}`;
}

const server = http.createServer((req, res) => {
  if (isShareTargetPost(req)) {
    // Normalise Origin so SvelteKit's CSRF check (which runs before hooks)
    // doesn't reject the share intent. See top-of-file comment for the
    // safety argument (the source=share branch is redirect-only).
    const origin = inferServerOrigin(req);
    req.headers["origin"] = origin;
  }
  // Delegate to adapter-node's compiled handler for everything else.
  handler(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`server.js listening on http://${HOST}:${PORT}`);
});

// Graceful shutdown for SIGTERM (Docker / systemd) and SIGINT (Ctrl-C).
for (const signal of /** @type {const} */ (["SIGTERM", "SIGINT"])) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    // Hard-cap the drain period so we never block redeploys.
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
