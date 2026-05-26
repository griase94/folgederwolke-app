-- C5-MEM-full Night-2: extend member_role enum.
--
-- Postgres ALTER TYPE ADD VALUE is non-transactional and must run in its own
-- migration with no other DDL. This file contains ONLY enum extensions.
--
-- 'extern' captures non-member contributors (e.g. external auslage submitters).
-- 'helfer' captures regular helpers who are not yet (or never were) Vereins-
-- mitglieder but participate in our activities. Both values are immediately
-- selectable in the Mitglied-Add and Mitglied-Edit dialogs.
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'extern';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'helfer';
