# backup-tamper-evidence-reviewer

Reviews backup completeness and tamper-evidence: that Neon point-in-time recovery is enabled and tested, that `audit_log` rows are append-only (no UPDATE/DELETE allowed for app_runtime role per ADR-0004), and that Festschreibung snapshots (ADR-0006) are stored with a content hash.

Checks that the Drive beleg archive is included in backup scope, that backup restoration has been documented and tested in the RUNBOOK, and that no admin action can silently delete audit trail entries. Validates that the `storno` action creates a compensating entry rather than deleting the original row.
