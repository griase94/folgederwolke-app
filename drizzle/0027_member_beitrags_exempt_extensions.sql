-- Migration 0027: additive extensions to member_beitrags for Phase 1.
--
-- Adds per-year Befreiung (is_exempt + exempt_reason), payment linkage
-- (paid_via_income_id), forward-compat Beitragsklasse, and source provenance.
--
-- CHECK constraint: if is_exempt=true then exempt_reason must be non-empty
-- (§55 AO Selbstlosigkeit — legally required justification for waived fees).
--
-- All columns use DEFAULT values so existing rows keep valid state.

ALTER TABLE member_beitrags
  ADD COLUMN is_exempt        boolean     NOT NULL DEFAULT false,
  ADD COLUMN exempt_reason    text,
  ADD COLUMN paid_via_income_id uuid      REFERENCES income(id) ON DELETE SET NULL,
  ADD COLUMN beitrag_klasse   text,
  ADD COLUMN source           source_kind NOT NULL DEFAULT 'app';

-- DB-level enforcement of the §55 AO requirement:
-- if is_exempt=true, exempt_reason must be non-null and non-blank.
ALTER TABLE member_beitrags
  ADD CONSTRAINT member_beitrags_exempt_reason_when_exempt_ck CHECK (
    is_exempt = false
    OR (exempt_reason IS NOT NULL AND length(trim(exempt_reason)) > 0)
  );

COMMENT ON COLUMN member_beitrags.is_exempt IS
  'Per-year Befreiung. Effective exemption = members.beitrag_exempt OR member_beitrags.is_exempt.';
COMMENT ON COLUMN member_beitrags.exempt_reason IS
  'Pflichtfeld bei is_exempt=true. CHECK constraint enforces non-empty. Legal: §55 AO Selbstlosigkeit + §63 AO Nachvollziehbarkeit.';
COMMENT ON COLUMN member_beitrags.paid_via_income_id IS
  'Forward-compat: links the Beitrag payment to a specific income row for reconciliation.';
COMMENT ON COLUMN member_beitrags.beitrag_klasse IS
  'Forward-compat only — no UI in Phase 1/2. Reserved for future Beitragsklassen feature.';
COMMENT ON COLUMN member_beitrags.source IS
  'ADR-0010 provenance: app | form | sheet_import | fixture.';
