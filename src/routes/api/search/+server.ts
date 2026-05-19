/**
 * GET /api/search?q=...&types=...
 *
 * Phase 3 stub — returns empty grouped results.
 * Real federated search (pg_trgm + ranked grouping) ships in Phase 6.
 *
 * Response shape (stable contract for frontend):
 * {
 *   results: {
 *     members:      SearchResult[];
 *     customers:    SearchResult[];
 *     expenses:     SearchResult[];
 *     invoices:     SearchResult[];
 *     projects:     SearchResult[];
 *   };
 *   query: string;
 *   took_ms: number;
 * }
 */

import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";

export interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  type: "member" | "customer" | "expense" | "invoice" | "project";
}

export interface SearchResponse {
  results: {
    members: SearchResult[];
    customers: SearchResult[];
    expenses: SearchResult[];
    invoices: SearchResult[];
    projects: SearchResult[];
  };
  query: string;
  took_ms: number;
}

export const GET: RequestHandler = ({ url, locals }) => {
  // Stub or not, this endpoint must require an authenticated admin session —
  // otherwise it leaks the response shape (and later the real data) to any
  // unauthenticated caller. Flagged by the 2026-05-19 security review (HIGH-4).
  if (!locals.session) {
    throw error(401, "Authentication required");
  }

  const q = url.searchParams.get("q") ?? "";

  const response: SearchResponse = {
    results: {
      members: [],
      customers: [],
      expenses: [],
      invoices: [],
      projects: [],
    },
    query: q,
    took_ms: 0,
  };

  return json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
};
