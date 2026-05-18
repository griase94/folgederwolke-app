# perf-reviewer

Reviews performance-sensitive code paths: N+1 query patterns, missing indexes on frequently-filtered columns, large payload sizes in SvelteKit load functions, and unnecessary re-renders caused by non-stable prop references.

Checks that Drive API calls are not made in the hot path of page loads (use cached `settings` values), that DB queries use `LIMIT` where appropriate, and that the public form does not load the full member/customer list on the server. Validates that Svelte component islands are used for interactive parts to minimize SSR overhead.
