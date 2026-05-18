# cron-reviewer

Reviews all cron jobs and scheduled tasks: that they are idempotent (safe to run multiple times in the same window), that they log start/end with duration, and that failures are recorded in `audit_log` rather than silently dropped.

Checks that cron endpoints are protected against unauthorized invocation (e.g. via a shared secret header or Vercel Cron authentication), that long-running jobs have a timeout and graceful shutdown, and that the job does not hold a DB transaction open for the full duration.
