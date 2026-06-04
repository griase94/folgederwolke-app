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

/** Collect all paths that have a +page.svelte or +page.server.ts */
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
    } else if (entry === "+page.svelte" || entry === "+page.server.ts") {
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

  if (routeSegments.length !== urlSegments.length) return false;

  return routeSegments.every((seg, i) => {
    // Dynamic segment: [param] matches anything
    if (seg.startsWith("[") && seg.endsWith("]")) return true;
    return seg === urlSegments[i];
  });
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
});
