# accounting-eur-reviewer

Reviews all accounting-related code for EUR correctness: that Soll/Haben entries balance, that Buchungsjahr is derived via `year_for_booking` (not `new Date().getFullYear()`), and that sphere totals are computed without cross-sphere contamination.

Checks that the Kassenbuch export produces correct running balances, that income and expense categorization (Kategorien) maps correctly to the Vereinsbuchhaltung structure, and that archived years cannot be mutated after Festschreibung (ADR-0006). Validates that all EUR amounts in exports are formatted with exactly 2 decimal places.
