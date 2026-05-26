-- Migration 0022: extend mail_template enum with 'auslage_approved'.
-- C7-INBOX full: ApprovalMail sent when admin approves an Auslage submission.
-- ADR-0005 (mail idempotency via sent_mails).
ALTER TYPE mail_template ADD VALUE IF NOT EXISTS 'auslage_approved';
