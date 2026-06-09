import type { RequestHandler } from "./$types.js";

/**
 * POST /api/vitals
 *
 * Receives a JSON body with browser performance timings and logs them as a
 * structured line so Vercel log drains (and local stdout) capture them.
 * No auth required — metrics contain only timing numbers and the URL path.
 * Returns 204 No Content on success.
 *
 * Expected body shape:
 *   { fcp, ttfb, domContentLoaded, hydrated, route, source }
 *
 * All values are milliseconds (integers) or null when the browser did not
 * provide the measurement (e.g. FCP is null on sub-frame navigations).
 */
interface VitalsBody {
  fcp?: unknown;
  ttfb?: unknown;
  domContentLoaded?: unknown;
  hydrated?: unknown;
  route?: unknown;
  source?: unknown;
}

/** Coerce to a finite rounded number, else null. */
function ms(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as VitalsBody;
    // Allowlist only — never echo the raw body. This caps the log line size
    // and guarantees no unexpected/identifying fields are persisted. `route`
    // is expected to be a route PATTERN (e.g. /app/mitglieder/[id]); it is
    // length-capped defensively in case a caller sends something else.
    const safe = {
      fcp: ms(body.fcp),
      ttfb: ms(body.ttfb),
      domContentLoaded: ms(body.domContentLoaded),
      hydrated: ms(body.hydrated),
      route: typeof body.route === "string" ? body.route.slice(0, 128) : null,
      source: typeof body.source === "string" ? body.source.slice(0, 32) : null,
    };
    console.log("[vitals]", JSON.stringify(safe));
  } catch {
    // Malformed body — still return 204 so the client-side fetch doesn't
    // surface a console error.
  }
  return new Response(null, { status: 204 });
};

/** Return 405 for any other method. */
export const fallback: RequestHandler = () => {
  return new Response(null, { status: 405 });
};
