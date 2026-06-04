import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard test: every URL listed in manifest.webmanifest (start_url, shortcuts,
 * share_target.action) must resolve to an existing SvelteKit route under
 * src/routes/.
 *
 * Resolution rules:
 *  - Strip the query string before matching.
 *  - Route groups like (public) are transparent to the URL.
 *  - Dynamic segments like [year] or [id] match any path segment.
 *
 * This test FAILS if a shortcut points to a missing route, giving immediate
 * feedback before PWA shortcuts 404 in production.
 */

const repoRoot = resolve(__dirname, "..", "..");
const staticDir = resolve(repoRoot, "static");
const routesDir = resolve(repoRoot, "src", "routes");

interface Manifest {
  start_url?: string;
  shortcuts?: Array<{ name: string; url: string }>;
  share_target?: { action: string };
}

/**
 * Collect all paths that have a +page.svelte — i.e. a renderable page route.
 *
 * Deliberately requires +page.svelte: a directory with only +page.server.ts
 * (a server-only endpoint such as /sign-out) is NOT a navigable route, so a
 * manifest URL pointing at one must fail this guard.
 */
function collectRoutes(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return routes;
  }
  for (const entry of entries) {
    const abs = resolve(dir, entry);
    if (statSync(abs).isDirectory()) {
      // Strip route groups like (public) from the URL segment
      const segment = entry.startsWith("(") && entry.endsWith(")") ? "" : entry;
      const subPrefix = segment ? `${prefix}/${segment}` : prefix;
      routes.push(...collectRoutes(abs, subPrefix));
    } else if (entry === "+page.svelte") {
      const routePath = prefix === "" ? "/" : prefix;
      if (!routes.includes(routePath)) {
        routes.push(routePath);
      }
    }
  }
  return routes;
}

/**
 * Check whether a manifest URL path resolves to an existing route.
 *
 * Dynamic segments ([param]) match any single path segment in the URL.
 */
function routeExists(urlPath: string, routes: string[]): boolean {
  for (const route of routes) {
    if (routeMatchesPath(route, urlPath)) return true;
  }
  return false;
}

function routeMatchesPath(routePattern: string, urlPath: string): boolean {
  const routeSegments = routePattern.split("/").filter(Boolean);
  const urlSegments = urlPath.split("/").filter(Boolean);
  return matchSegments(routeSegments, urlSegments);
}

/**
 * Match a route's segments against a URL's segments, honouring SvelteKit's
 * dynamic-segment flavours:
 *  - [param]    — exactly one segment (any value)
 *  - [[param]]  — optional: zero or one segment
 *  - [...rest]  — rest: zero or more remaining segments
 */
function matchSegments(route: string[], url: string[]): boolean {
  if (route.length === 0) return url.length === 0;

  const [seg, ...restRoute] = route;

  // Rest param [...x] — consumes zero or more remaining URL segments. Since a
  // rest param is always the final segment in a SvelteKit route, this matches
  // whatever is left.
  if (seg!.startsWith("[...") && seg!.endsWith("]")) {
    return true;
  }

  // Optional param [[x]] — try matching zero segments, then one segment.
  if (seg!.startsWith("[[") && seg!.endsWith("]]")) {
    if (matchSegments(restRoute, url)) return true; // consumed nothing
    if (url.length > 0 && matchSegments(restRoute, url.slice(1))) return true;
    return false;
  }

  // Past this point we need a URL segment to consume.
  if (url.length === 0) return false;

  // Required dynamic param [x] — matches any single segment.
  if (seg!.startsWith("[") && seg!.endsWith("]")) {
    return matchSegments(restRoute, url.slice(1));
  }

  // Static segment — must match literally.
  if (seg !== url[0]) return false;
  return matchSegments(restRoute, url.slice(1));
}

function stripQuery(url: string): string {
  return url.split("?")[0]!;
}

describe("manifest.webmanifest — all URLs resolve to real routes", () => {
  const raw = readFileSync(resolve(staticDir, "manifest.webmanifest"), "utf8");
  const manifest = JSON.parse(raw) as Manifest;

  const routes = collectRoutes(routesDir);
  expect(routes.length).toBeGreaterThan(0);

  // Root / is always valid (the landing page)
  const allRoutes = routes.includes("/") ? routes : [...routes, "/"];

  it("start_url path resolves to an existing route", () => {
    if (!manifest.start_url) return;
    const path = stripQuery(manifest.start_url);
    // start_url of "/" is valid
    const exists = path === "/" || routeExists(path, allRoutes);
    expect(
      exists,
      `start_url "${manifest.start_url}" (path: "${path}") does not resolve to any route under src/routes/`,
    ).toBe(true);
  });

  it("share_target.action path resolves to an existing route", () => {
    if (!manifest.share_target?.action) return;
    const path = stripQuery(manifest.share_target.action);
    const exists = path === "/" || routeExists(path, allRoutes);
    expect(
      exists,
      `share_target.action "${manifest.share_target.action}" (path: "${path}") does not resolve to any route under src/routes/`,
    ).toBe(true);
  });

  describe("shortcuts — each url resolves to an existing route", () => {
    const shortcuts = manifest.shortcuts ?? [];
    for (const shortcut of shortcuts) {
      it(`shortcut "${shortcut.name}" → ${shortcut.url}`, () => {
        const path = stripQuery(shortcut.url);
        const exists = path === "/" || routeExists(path, allRoutes);
        expect(
          exists,
          `shortcut "${shortcut.name}" url "${shortcut.url}" (path: "${path}") does not resolve to any route under src/routes/. ` +
            `Available routes: ${allRoutes.join(", ")}`,
        ).toBe(true);
      });
    }
  });

  it("a server-only endpoint (no +page.svelte) is NOT treated as a route", () => {
    // /sign-out is a form-action-only endpoint with just +page.server.ts.
    // It must not appear in the collected routes, so a manifest URL pointing
    // at it would correctly fail this guard.
    expect(allRoutes).not.toContain("/sign-out");
    expect(routeExists("/sign-out", allRoutes)).toBe(false);
  });
});

describe("routeMatchesPath — dynamic segment flavours", () => {
  it("matches required [param] against one segment", () => {
    expect(routeExists("/app/kunden/42", ["/app/kunden/[id]"])).toBe(true);
    expect(routeExists("/app/kunden", ["/app/kunden/[id]"])).toBe(false);
    expect(routeExists("/app/kunden/42/x", ["/app/kunden/[id]"])).toBe(false);
  });

  it("matches optional [[param]] against zero or one segment", () => {
    const routes = ["/app/[[year]]"];
    expect(routeExists("/app", routes)).toBe(true);
    expect(routeExists("/app/2026", routes)).toBe(true);
    expect(routeExists("/app/2026/extra", routes)).toBe(false);
  });

  it("matches rest [...param] against zero or more segments", () => {
    const routes = ["/files/[...path]"];
    expect(routeExists("/files", routes)).toBe(true);
    expect(routeExists("/files/a", routes)).toBe(true);
    expect(routeExists("/files/a/b/c", routes)).toBe(true);
  });
});
