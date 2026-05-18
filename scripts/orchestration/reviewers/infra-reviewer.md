# infra-reviewer

Reviews infrastructure configuration: deployment manifests, environment variable completeness (all env keys present in `.env.example`, CI yml, and `env.ts`), Neon/Postgres connection pooling settings, adapter-node startup flags, and runtime resource limits.

Checks that migration scripts are idempotent, that `drizzle.config.ts` points to the correct schema glob, and that the `migrate.ts` runner uses `DIRECT_DATABASE_URL` (not the pooled URL). Validates that no secrets are committed and that `.env.example` is kept in sync with `env.ts` schema fields.
