# ADR-0001: Year Derivation = Buchhaltungsjahr

**Status:** Accepted — stub. Phase 1 schema-author expands with full context and migration implications.

The accounting year (`Buchhaltungsjahr`) used throughout the system is derived from the transaction's `Buchungsdatum` (booking date), not the calendar year of submission or payment. This means a receipt submitted in January 2026 for an expense incurred in December 2025 belongs to Buchhaltungsjahr 2025. All year-scoped queries, Bescheinigungs-Nr sequences (`B-{YYYY}-{NNN}`), EÜR exports, and Festschreibung boundaries use this derived year. The authoritative derivation logic is sourced from the legacy Apps Script `imports.ts`; Phase 1's schema-author must replicate it exactly in the new codebase and add a unit test asserting the December-edge-case behaviour.
