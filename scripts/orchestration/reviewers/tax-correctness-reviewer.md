# tax-correctness-reviewer

Reviews all tax-relevant code: sphere assignment (ADR-0002), Freistellungsbescheid references in donation receipts, correct Zweckbindung handling, and that Aufwandsspende donation receipts include all BMF-Pflichtfelder (§ 10b EStG, §§ 50–52 EStDV).

Checks that `year_for_booking` is used consistently for fiscal-year assignment (ADR-0001), that Festschreibung (ADR-0006) prevents post-close mutations, and that Storno creates a correcting entry rather than deleting the original. Validates that no donation receipt is issued for non-steuerlich-absetzbare items.
