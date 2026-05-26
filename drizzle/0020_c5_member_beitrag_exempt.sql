-- C5-MEM-full Night-2: add per-member Beitragspflicht-Aussetzung.
--
-- `beitrag_exempt = true` means the member is exempt from paying their
-- Mitgliedsbeitrag for this year (e.g. Ehrenmitglied, Härtefall). Exempt
-- members are excluded from the "offen" sum in the Mitglieder-Matrix and
-- from the bulk-reminder candidate list. The flag is year-independent in
-- v1 — a future migration can extend this with a per-year override table
-- if Vorstand asks for it.
--
-- `beitrag_exempt_reason` is the free-text justification surfaced as a
-- tooltip on the "befreit" badge and in the Mitglieder-Detail-Ansicht.
ALTER TABLE members
  ADD COLUMN beitrag_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN beitrag_exempt_reason text NULL;

COMMENT ON COLUMN members.beitrag_exempt IS
  'Mitglied ist von der Beitragspflicht befreit (z.B. Ehrenmitglied, Härtefall).';
COMMENT ON COLUMN members.beitrag_exempt_reason IS
  'Freitext-Begründung, sichtbar nur in der Mitgliederdetail-Ansicht.';
