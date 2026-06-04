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
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: unknown = await request.json();
    console.log("[vitals]", JSON.stringify(body));
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
