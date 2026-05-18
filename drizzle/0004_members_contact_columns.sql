-- Migration 0004: add contact columns to members table
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS telefon text,
  ADD COLUMN IF NOT EXISTS adresse text,
  ADD COLUMN IF NOT EXISTS date_of_birth date;
