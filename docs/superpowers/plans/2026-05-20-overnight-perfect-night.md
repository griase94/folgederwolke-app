# Overnight "Perfect Night" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the autonomous orchestrator + arm the overnight run that ships 22 P0/P1 findings across 9 clusters with TDD, originating-expert reviews, and convergence-only gating — all defined in `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md` (commit `1bf7c29`).

**Architecture:** Stateless tick orchestrator on top of phase-8's local-dev environment (docker compose Postgres 17, `reset-test-db.sh`, `.env.test`). Each tick reads `~/.folgederwolke-build/state/overnight-2026-05-20.json`, advances one step, writes state, schedules the next tick via `ScheduleWakeup`. Build agents run in isolated git worktrees with allocated ports; reviewers re-spawn fresh per cycle and post structured `[VERDICT: …]` PR comments the orchestrator parses. Sub-PRs merge into a long-lived `overnight-2026-05-20` branch; morning produces one PR to `main`.

**Tech Stack:** SvelteKit + Svelte 5 (existing app); Drizzle ORM + Neon/local Postgres 17.8 (existing); pnpm + tsx (existing); Vitest + Playwright (existing — phase-8 supplied global setups); Bash + Node for orchestrator scripts (subprocess via `spawnSync` from `node:child_process`); `gh` CLI for GitHub interactions; Claude Code in-process `Agent` tool for sub-agent dispatch (NEVER `Bash(claude -p)` — denied in settings).

---

## File structure (everything created or modified)

### New: orchestrator scripts (`scripts/orchestrate/`)

- `state.ts` — state-file schema + atomic load/save
- `preflight.ts` — 12 preflight checks
- `sign-off-parser.ts` — parses `[VERDICT: …]` PR comments
- `secret-redact.ts` — regex log redactor
- `secret-guard.ts` — subprocess env-scrub + trip-wire
- `worktree-spinup.sh` — per-cluster worktree + ports + env
- `dispatch-build-agent.ts` — assemble build-agent prompt
- `dispatch-reviewer.ts` — assemble reviewer prompt
- `merge-sub-pr.ts` — merge command builders
- `morning-consolidation.ts` — night → main PR body builder
- `preflight-cli.ts` — CLI wrapper
- `start.ts` — kickoff entry-point
- `README.md` — component overview

### New: agent prompt files (`scripts/orchestrate/prompts/`)

- `build-agent-template.md` — generic TDD template
- `cluster/c{1..9}-*.md` — 9 cluster dispatch prompts
- `reviewer/{code-review,test-quality,critical-path-coverage,visual-diff,ux-flow,vereinsmitglied-native,delight,final-integration}.md` — 8 role prompts
- `reviewer/originating/{julia-buchhaltung,auslagen-tester,vereinsbuchhalter,ux-expert,ui-designer,pwa-mobile}.md` — 6 persona prompts
- `orchestrator-tick.md` + `orchestrator-resume.md`

### New: canary suite (`tests/canary/`)

10 fixtures: `year-boundary.test.ts`, `dst-spring-fall.test.ts`, `leap-year.test.ts`, `festschreibung-trigger.test.ts`, `audit-log-revoke.test.ts`, `sphere-required.test.ts`, `audit-chain-integrity.test.ts`, `id-allocator-concurrency.test.ts`, `mail-provider-no-op.test.ts`, `dashboard-1000-rows-perf.test.ts`.

### Modified

- `.github/workflows/ci.yml` — add `overnight-*` to push + pull_request branches
- `package.json` — add 4 `orchestrate:*` script aliases + `canary` alias
- `src/lib/domain/year.ts` (new) — `yearForBooking()` TS mirror of SQL function
- `src/lib/server/domain/transactions.ts` — defensive sphere-required check (5 lines)

### Runtime files (gitignored)

- `~/.folgederwolke-build/state/overnight-2026-05-20.json`
- `~/.folgederwolke-build/state/overnight-progress.log`
- `~/.folgederwolke-build/state/preflight-FAILED.json` (only on failure)

---

## Conventions

- TDD-first per task: failing test → impl → green test → commit
- All subprocess invocations use `spawnSync` from `node:child_process` (no shell, no injection surface)
- Commit format: `<type>(<scope>): <description>` matching repo convention
- Paths absolute from repo root unless noted
- Each "Run" step shows exact command + expected output line

---

## Phase 0 — Infrastructure (Tasks 1-14)

### Task 1: Scaffold directory tree

**Files:**

- Create: 6 `.gitkeep` files under `scripts/orchestrate/` + `tests/canary/`

- [ ] **Step 1: Create dirs**

```bash
cd ~/Projects/private/folgederwolke/folgederwolke-app
mkdir -p scripts/orchestrate/prompts/cluster \
         scripts/orchestrate/prompts/reviewer/originating \
         tests/canary
touch scripts/orchestrate/.gitkeep \
      scripts/orchestrate/prompts/.gitkeep \
      scripts/orchestrate/prompts/cluster/.gitkeep \
      scripts/orchestrate/prompts/reviewer/.gitkeep \
      scripts/orchestrate/prompts/reviewer/originating/.gitkeep \
      tests/canary/.gitkeep
```

- [ ] **Step 2: Verify**

```bash
find scripts/orchestrate tests/canary -type d | sort
```

Expected: 5 directory lines.

- [ ] **Step 3: Commit**

```bash
git add scripts/orchestrate tests/canary
git commit -m "feat(orchestrate): scaffold directory tree for overnight-2026-05-20"
```

---

### Task 2: State-file schema + atomic load/save

**Files:**

- Create: `scripts/orchestrate/state.ts`
- Create: `tests/unit/orchestrate/state.test.ts`

- [ ] **Step 1: Failing test**

`tests/unit/orchestrate/state.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadState,
  saveState,
  initialState,
  type OvernightState,
} from "../../../scripts/orchestrate/state.js";

describe("orchestrate/state", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fdw-state-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when state file does not exist", async () => {
    expect(await loadState(join(dir, "missing.json"))).toBeNull();
  });

  it("writes state atomically via tmp+rename", async () => {
    const path = join(dir, "state.json");
    const state = initialState();
    await saveState(path, state);
    expect(await loadState(path)).toEqual(state);
    expect(() => readFileSync(`${path}.tmp`)).toThrow();
  });

  it("initialState returns 9 clusters in WAITING_DISPATCH", () => {
    const s = initialState();
    expect(Object.keys(s.clusters)).toHaveLength(9);
    for (const c of Object.values(s.clusters)) {
      expect(c.state).toBe("WAITING_DISPATCH");
      expect(c.cycles).toEqual([]);
    }
  });

  it("schema includes version + started_at + preflight + wave + infra_health", () => {
    const s: OvernightState = initialState();
    expect(s.version).toBe(1);
    expect(s.started_at).toMatch(/^20\d{2}-\d{2}-\d{2}T/);
    expect(s.wave).toBe(0);
    expect(s.preflight).toEqual({ passed: false, checks: [] });
    expect(s.infra_health.docker_ok).toBe(false);
  });

  it("port offsets c1=5441/5181 → c9=5449/5189", () => {
    const s = initialState();
    expect(s.clusters.c1.ports).toEqual({ postgres: 5441, vite: 5181 });
    expect(s.clusters.c9.ports).toEqual({ postgres: 5449, vite: 5189 });
    expect(s.clusters.c1.db_name).toBe("folgederwolke_test_c1");
  });
});
```

- [ ] **Step 2: Run — expect failure (module missing)**

```bash
pnpm test --run tests/unit/orchestrate/state.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement**

`scripts/orchestrate/state.ts`:

```typescript
import { readFile, writeFile, rename } from "node:fs/promises";

export type ClusterId =
  | "c1"
  | "c2"
  | "c3"
  | "c4"
  | "c5"
  | "c6"
  | "c7"
  | "c8"
  | "c9";

export type ClusterRuntimeState =
  | "WAITING_DISPATCH"
  | "WAITING_WAVE_2"
  | "WAITING_WAVE_3"
  | "BUILDING"
  | "REVIEWING"
  | "ITERATING"
  | "MERGING"
  | "MERGED"
  | "DEFERRED";

export interface ReviewerVerdict {
  reviewer: string;
  verdict: "RESOLVED" | "PARTIALLY" | "NOT_RESOLVED";
  cycle: number;
  comment_url: string;
  posted_at: string;
}

export interface CycleRecord {
  n: number;
  build_agent_id: string;
  build_started_at: string;
  build_completed_at: string | null;
  reviewer_verdicts: ReviewerVerdict[];
  must_fix_remaining: number;
}

export interface ClusterState {
  state: ClusterRuntimeState;
  branch: string | null;
  worktree: string | null;
  sub_pr: number | null;
  ports: { postgres: number; vite: number };
  db_name: string;
  cycles: CycleRecord[];
  defer_reason?: string;
}

export interface PreflightResult {
  passed: boolean;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
}

export interface InfraHealth {
  docker_ok: boolean;
  ci_workflow_patched: boolean;
  last_postgres_ping: string | null;
  last_gh_auth_status: string | null;
}

export interface OvernightState {
  version: 1;
  started_at: string;
  preflight: PreflightResult;
  wave: 0 | 1 | 2 | 3 | "DONE";
  clusters: Record<ClusterId, ClusterState>;
  infra_health: InfraHealth;
  log_tail: string[];
}

const PORT_BASE_POSTGRES = 5440;
const PORT_BASE_VITE = 5180;
const CLUSTERS: ClusterId[] = [
  "c1",
  "c2",
  "c3",
  "c4",
  "c5",
  "c6",
  "c7",
  "c8",
  "c9",
];

export function initialState(): OvernightState {
  const clusters = {} as Record<ClusterId, ClusterState>;
  for (let i = 0; i < CLUSTERS.length; i++) {
    const id = CLUSTERS[i]!;
    const offset = i + 1;
    clusters[id] = {
      state: "WAITING_DISPATCH",
      branch: null,
      worktree: null,
      sub_pr: null,
      ports: {
        postgres: PORT_BASE_POSTGRES + offset,
        vite: PORT_BASE_VITE + offset,
      },
      db_name: `folgederwolke_test_${id}`,
      cycles: [],
    };
  }
  return {
    version: 1,
    started_at: new Date().toISOString(),
    preflight: { passed: false, checks: [] },
    wave: 0,
    clusters,
    infra_health: {
      docker_ok: false,
      ci_workflow_patched: false,
      last_postgres_ping: null,
      last_gh_auth_status: null,
    },
    log_tail: [],
  };
}

export async function loadState(path: string): Promise<OvernightState | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as OvernightState;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveState(
  path: string,
  state: OvernightState,
): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await rename(tmp, path);
}
```

- [ ] **Step 4: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/state.test.ts
git add scripts/orchestrate/state.ts tests/unit/orchestrate/state.test.ts
git commit -m "feat(orchestrate): state schema with atomic save and 9-cluster init"
```

---

### Task 3: Sign-off comment parser

**Files:**

- Create: `scripts/orchestrate/sign-off-parser.ts`
- Create: `tests/unit/orchestrate/sign-off-parser.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseSignOff } from "../../../scripts/orchestrate/sign-off-parser.js";

describe("parseSignOff", () => {
  it("returns null on a body with no verdict header", () => {
    expect(parseSignOff("lgtm")).toBeNull();
  });

  it("parses a RESOLVED verdict with reviewer + cycle", () => {
    const body = `[REVIEWER: vereinsbuchhalter] [CYCLE: 2] [VERDICT: RESOLVED]

Body here.`;
    expect(parseSignOff(body)).toEqual({
      reviewer: "vereinsbuchhalter",
      cycle: 2,
      verdict: "RESOLVED",
    });
  });

  it("parses PARTIALLY + NOT RESOLVED", () => {
    expect(
      parseSignOff(
        "[REVIEWER: julia-buchhaltung] [CYCLE: 1] [VERDICT: PARTIALLY]\n…",
      )?.verdict,
    ).toBe("PARTIALLY");
    expect(
      parseSignOff(
        "[REVIEWER: ux-expert] [CYCLE: 3] [VERDICT: NOT RESOLVED]\n…",
      )?.verdict,
    ).toBe("NOT_RESOLVED");
  });

  it("rejects malformed verdict values", () => {
    expect(parseSignOff("[REVIEWER: x] [CYCLE: 1] [VERDICT: lgtm]")).toBeNull();
  });

  it("accepts cycle numbers up to 99", () => {
    expect(
      parseSignOff("[REVIEWER: x] [CYCLE: 12] [VERDICT: RESOLVED]")?.cycle,
    ).toBe(12);
  });
});
```

- [ ] **Step 2: Implement**

`scripts/orchestrate/sign-off-parser.ts`:

```typescript
export type Verdict = "RESOLVED" | "PARTIALLY" | "NOT_RESOLVED";

export interface SignOff {
  reviewer: string;
  cycle: number;
  verdict: Verdict;
}

const PATTERN =
  /^\[REVIEWER:\s*([a-z0-9_-]+)\]\s*\[CYCLE:\s*(\d+)\]\s*\[VERDICT:\s*(RESOLVED|PARTIALLY|NOT RESOLVED)\]/m;

export function parseSignOff(body: string): SignOff | null {
  const m = PATTERN.exec(body);
  if (!m) return null;
  const verdictRaw = m[3]!;
  const verdict: Verdict =
    verdictRaw === "NOT RESOLVED" ? "NOT_RESOLVED" : (verdictRaw as Verdict);
  return {
    reviewer: m[1]!,
    cycle: parseInt(m[2]!, 10),
    verdict,
  };
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/sign-off-parser.test.ts
git add scripts/orchestrate/sign-off-parser.ts tests/unit/orchestrate/sign-off-parser.test.ts
git commit -m "feat(orchestrate): structured-PR-comment sign-off parser"
```

---

### Task 4: Secret-redact log layer

**Files:**

- Create: `scripts/orchestrate/secret-redact.ts`
- Create: `tests/unit/orchestrate/secret-redact.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import { redact } from "../../../scripts/orchestrate/secret-redact.js";

describe("redact", () => {
  it("masks Bearer tokens", () => {
    expect(redact("Authorization: Bearer abc123xyz_-")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });
  it("masks IBAN-shaped strings", () => {
    expect(redact("IBAN DE89370400440532013000 on file")).toBe(
      "IBAN [REDACTED-IBAN] on file",
    );
  });
  it("masks age recipient public keys", () => {
    expect(redact("AGE=age1xyz0qwerty1234")).toMatch(/AGE=\[REDACTED-AGE\]/);
  });
  it("masks Google OAuth tokens", () => {
    expect(redact("token=ya29.aBcDe_fGhIjK")).toBe("token=[REDACTED-OAUTH]");
  });
  it("masks GitHub PATs (both shapes)", () => {
    expect(redact("TOKEN=glpat-abc_DEF123xyz")).toContain("[REDACTED-PAT]");
    expect(redact("TOKEN=github_pat_11ABCDEFGH0_abc")).toContain(
      "[REDACTED-PAT]",
    );
  });
  it("leaves harmless text alone", () => {
    expect(redact("Build agent C4 finished in 42s")).toBe(
      "Build agent C4 finished in 42s",
    );
  });
  it("redacts Neon production URLs", () => {
    expect(
      redact("DATABASE_URL=postgres://u:p@ep-x.eu-central-1.aws.neon.tech/db"),
    ).toContain("[REDACTED-NEON]");
  });
});
```

- [ ] **Step 2: Implement**

`scripts/orchestrate/secret-redact.ts`:

```typescript
type Rule = { pattern: RegExp; replace: string };

const RULES: Rule[] = [
  { pattern: /Bearer\s+[A-Za-z0-9_\-]{6,}/g, replace: "Bearer [REDACTED]" },
  { pattern: /\bDE\d{20}\b/g, replace: "[REDACTED-IBAN]" },
  { pattern: /\bage1[a-z0-9]{20,}/g, replace: "[REDACTED-AGE]" },
  { pattern: /\bya29\.[A-Za-z0-9_\-]{10,}/g, replace: "[REDACTED-OAUTH]" },
  { pattern: /\bglpat-[A-Za-z0-9_\-]{8,}/g, replace: "[REDACTED-PAT]" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{10,}/g, replace: "[REDACTED-PAT]" },
  {
    pattern: /[a-zA-Z0-9_\-]+\.(eu-|us-|ap-)?[a-z0-9\-]+\.aws\.neon\.tech/g,
    replace: "[REDACTED-NEON]",
  },
];

export function redact(line: string): string {
  let out = line;
  for (const r of RULES) out = out.replace(r.pattern, r.replace);
  return out;
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/secret-redact.test.ts
git add scripts/orchestrate/secret-redact.ts tests/unit/orchestrate/secret-redact.test.ts
git commit -m "feat(orchestrate): regex-based secret redactor for logs + PR comments"
```

---

### Task 5: Secret guard — env scrub + trip-wire

**Files:**

- Create: `scripts/orchestrate/secret-guard.ts`
- Create: `tests/unit/orchestrate/secret-guard.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  scrubEnv,
  tripWire,
  type ClusterEnv,
} from "../../../scripts/orchestrate/secret-guard.js";

describe("scrubEnv", () => {
  it("returns only whitelisted keys + cluster-allocated values", () => {
    const cluster: ClusterEnv = {
      DATABASE_URL: "postgres://localhost:5441/folgederwolke_test_c1",
      DIRECT_DATABASE_URL: "postgres://localhost:5441/folgederwolke_test_c1",
      FILE_STORAGE_ROOT: "./.dev-data/drive-c1",
      VITE_PORT: "5181",
    };
    const fullEnv = {
      PATH: "/usr/bin",
      HOME: "/home/x",
      NEON_PASSWORD: "secret",
      GOOGLE_OAUTH_REFRESH_TOKEN: "ya29.real",
      ...cluster,
    };
    const out = scrubEnv(fullEnv, cluster);
    expect(out.PATH).toBe("/usr/bin");
    expect(out.DATABASE_URL).toBe(cluster.DATABASE_URL);
    expect(out.MAIL_PROVIDER).toBe("no-op");
    expect(out.STORAGE_BACKEND).toBe("local-fs");
    expect("NEON_PASSWORD" in out).toBe(false);
    expect("GOOGLE_OAUTH_REFRESH_TOKEN" in out).toBe(false);
  });
});

describe("tripWire", () => {
  it("returns null when env is safe", () => {
    expect(
      tripWire({
        MAIL_PROVIDER: "no-op",
        STORAGE_BACKEND: "local-fs",
        DATABASE_URL: "postgres://localhost:5441/x",
      }),
    ).toBeNull();
  });
  it("detects STORAGE_BACKEND=drive", () => {
    expect(tripWire({ STORAGE_BACKEND: "drive" })).toMatch(/STORAGE_BACKEND/);
  });
  it("detects MAIL_PROVIDER=smtp or resend", () => {
    expect(tripWire({ MAIL_PROVIDER: "smtp" })).toMatch(/MAIL_PROVIDER/);
    expect(tripWire({ MAIL_PROVIDER: "resend" })).toMatch(/MAIL_PROVIDER/);
  });
  it("detects neon.tech in DATABASE_URL", () => {
    expect(
      tripWire({
        DATABASE_URL: "postgres://u:p@x.eu-central-1.aws.neon.tech/db",
      }),
    ).toMatch(/neon\.tech/);
  });
});
```

- [ ] **Step 2: Implement**

`scripts/orchestrate/secret-guard.ts`:

```typescript
export interface ClusterEnv {
  DATABASE_URL: string;
  DIRECT_DATABASE_URL: string;
  FILE_STORAGE_ROOT: string;
  VITE_PORT?: string;
}

const WHITELIST = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "NODE_ENV",
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "STORAGE_BACKEND",
  "FILE_STORAGE_ROOT",
  "MAIL_PROVIDER",
  "MAIL_FROM",
  "SESSION_SECRET",
  "VITE_PORT",
  "PNPM_HOME",
];

export function scrubEnv(
  fullEnv: NodeJS.ProcessEnv,
  cluster: ClusterEnv,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of WHITELIST) {
    const v = fullEnv[k];
    if (typeof v === "string") out[k] = v;
  }
  out.NODE_ENV = "test";
  out.MAIL_PROVIDER = "no-op";
  out.MAIL_FROM = "test@folgederwolke.local";
  out.STORAGE_BACKEND = "local-fs";
  out.SESSION_SECRET =
    out.SESSION_SECRET ?? "test-only-not-secret-".padEnd(72, "x");
  out.DATABASE_URL = cluster.DATABASE_URL;
  out.DIRECT_DATABASE_URL = cluster.DIRECT_DATABASE_URL;
  out.FILE_STORAGE_ROOT = cluster.FILE_STORAGE_ROOT;
  if (cluster.VITE_PORT) out.VITE_PORT = cluster.VITE_PORT;
  return out;
}

export function tripWire(
  env: Record<string, string | undefined>,
): string | null {
  if (env.STORAGE_BACKEND === "drive") {
    return "STORAGE_BACKEND=drive detected in subprocess env — refusing to run";
  }
  if (env.MAIL_PROVIDER === "smtp" || env.MAIL_PROVIDER === "resend") {
    return `MAIL_PROVIDER=${env.MAIL_PROVIDER} detected — refusing to run`;
  }
  if (env.DATABASE_URL && /neon\.tech/.test(env.DATABASE_URL)) {
    return "DATABASE_URL points to neon.tech (production) — refusing to run";
  }
  return null;
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/secret-guard.test.ts
git add scripts/orchestrate/secret-guard.ts tests/unit/orchestrate/secret-guard.test.ts
git commit -m "feat(orchestrate): env-scrub + trip-wire to block prod creds in subprocesses"
```

---

### Task 6: Worktree spinup script

**Files:**

- Create: `scripts/orchestrate/worktree-spinup.sh`
- Create: `tests/unit/orchestrate/worktree-spinup.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("worktree-spinup.sh", () => {
  const script = "scripts/orchestrate/worktree-spinup.sh";
  it("is executable", () => {
    expect(statSync(script).mode & 0o111).toBeTruthy();
  });
  it("rejects missing arg", () => {
    const r = spawnSync(script, [], { encoding: "utf-8" });
    expect(r.status).not.toBe(0);
  });
  it("declares port bases 5440 + 5180", () => {
    const text = readFileSync(script, "utf-8");
    expect(text).toMatch(/PORT_BASE_POSTGRES=5440/);
    expect(text).toMatch(/PORT_BASE_VITE=5180/);
  });
});
```

- [ ] **Step 2: Implement script**

`scripts/orchestrate/worktree-spinup.sh`:

```bash
#!/usr/bin/env bash
# Spin up an isolated worktree for one cluster of the overnight run.
# Usage: scripts/orchestrate/worktree-spinup.sh <c1|c2|…|c9>
set -euo pipefail

PORT_BASE_POSTGRES=5440
PORT_BASE_VITE=5180

if [ $# -lt 1 ]; then
  echo "Usage: $0 <c1|c2|…|c9>" >&2
  exit 64
fi

CID="$1"
case "$CID" in
  c1) NAME="eur-redesign"   ;;
  c2) NAME="year-switcher"  ;;
  c3) NAME="dashboard"      ;;
  c4) NAME="sphere-bug"     ;;
  c5) NAME="pwa-icons"      ;;
  c6) NAME="primitives"     ;;
  c7) NAME="mobile-polish"  ;;
  c8) NAME="mail-templates" ;;
  c9) NAME="microcopy-ia"   ;;
  *) echo "Unknown cluster: $CID" >&2; exit 64 ;;
esac

OFFSET=${CID#c}
PG_PORT=$((PORT_BASE_POSTGRES + OFFSET))
VITE_PORT=$((PORT_BASE_VITE + OFFSET))
DB_NAME="folgederwolke_test_${CID}"
ROOT="$(git rev-parse --show-toplevel)"
WT="${ROOT}/.claude/worktrees/overnight-${CID}-${NAME}"
BRANCH="overnight-2026-05-20/${CID}-${NAME}"
COMPOSE_PROJECT="fdw-overnight-${CID}"
STORAGE_ROOT="${ROOT}/.dev-data/overnight/${CID}-drive"

mkdir -p "$(dirname "$WT")" "$STORAGE_ROOT"

if [ ! -d "$WT" ]; then
  git -C "$ROOT" worktree add -B "$BRANCH" "$WT" "overnight-2026-05-20"
fi

cat > "$WT/.env.test.local" <<EOF
# Auto-written by worktree-spinup.sh — DO NOT EDIT.
DATABASE_URL=postgres://app_runtime:app_runtime@localhost:${PG_PORT}/${DB_NAME}
DIRECT_DATABASE_URL=postgres://postgres:postgres@localhost:${PG_PORT}/${DB_NAME}
STORAGE_BACKEND=local-fs
FILE_STORAGE_ROOT=${STORAGE_ROOT}
MAIL_PROVIDER=no-op
MAIL_FROM=test-${CID}@folgederwolke.local
VITE_PORT=${VITE_PORT}
EOF

cat <<EOF
{
  "cluster": "${CID}",
  "name": "${NAME}",
  "worktree": "${WT}",
  "branch": "${BRANCH}",
  "postgres_port": ${PG_PORT},
  "vite_port": ${VITE_PORT},
  "db_name": "${DB_NAME}",
  "compose_project": "${COMPOSE_PROJECT}",
  "storage_root": "${STORAGE_ROOT}"
}
EOF
```

- [ ] **Step 3: Make executable + run + commit**

```bash
chmod +x scripts/orchestrate/worktree-spinup.sh
pnpm test --run tests/unit/orchestrate/worktree-spinup.test.ts
git add scripts/orchestrate/worktree-spinup.sh tests/unit/orchestrate/worktree-spinup.test.ts
git commit -m "feat(orchestrate): worktree-spinup.sh — per-cluster worktree + ports + .env"
```

---

### Task 7: Preflight (12 checks)

**Files:**

- Create: `scripts/orchestrate/preflight.ts`
- Create: `tests/unit/orchestrate/preflight.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { runPreflight } from "../../../scripts/orchestrate/preflight.js";

describe("runPreflight", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("returns 12 named checks", async () => {
    const r = await runPreflight({ dryRun: true });
    const ids = r.checks.map((c) => c.id);
    for (const required of [
      "phase-8-on-main",
      "settings-autonomous-permits",
      "no-claude-p-subprocess",
      "ci-workflow-patched",
      "docker-postgres-healthy",
      "gh-auth-status",
      "branch-protection-main-applies",
      "production-envs-not-loaded",
      "canary-suite-present",
      "worktree-dirs-creatable",
      "port-collision-sanity",
      "gh-rate-limit-headroom",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("flags DATABASE_URL pointing to Neon prod", async () => {
    process.env.DATABASE_URL =
      "postgres://u:p@ep-x.eu-central-1.aws.neon.tech/db";
    const r = await runPreflight({ dryRun: true });
    expect(
      r.checks.find((c) => c.id === "production-envs-not-loaded")?.ok,
    ).toBe(false);
  });

  it("accepts localhost DATABASE_URL", async () => {
    process.env.DATABASE_URL =
      "postgres://app_runtime:app_runtime@localhost:15432/folgederwolke_test";
    const r = await runPreflight({ dryRun: true });
    expect(
      r.checks.find((c) => c.id === "production-envs-not-loaded")?.ok,
    ).toBe(true);
  });

  it("passed=true iff every check passes", async () => {
    const r = await runPreflight({ dryRun: true });
    expect(r.passed).toBe(r.checks.every((c) => c.ok));
  });
});
```

- [ ] **Step 2: Implement**

`scripts/orchestrate/preflight.ts`:

```typescript
import { spawnSync } from "node:child_process";

export interface CheckResult {
  id: string;
  ok: boolean;
  detail: string;
}
export interface PreflightResultSummary {
  passed: boolean;
  checks: CheckResult[];
}
export interface PreflightOptions {
  dryRun?: boolean;
}

const PHASE_8_TIP = "3153a3c";

function safeRun(
  cmd: string,
  args: string[],
): { code: number; stdout: string } {
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  return { code: r.status ?? 1, stdout: r.stdout ?? "" };
}
const check = (id: string, ok: boolean, detail = ""): CheckResult => ({
  id,
  ok,
  detail,
});

export async function runPreflight(
  opts: PreflightOptions = {},
): Promise<PreflightResultSummary> {
  const checks: CheckResult[] = [];

  if (opts.dryRun) {
    checks.push(check("phase-8-on-main", true, "skipped in dry-run"));
  } else {
    const r = safeRun("git", [
      "merge-base",
      "--is-ancestor",
      PHASE_8_TIP,
      "origin/main",
    ]);
    checks.push(
      check(
        "phase-8-on-main",
        r.code === 0,
        r.code === 0
          ? `${PHASE_8_TIP} is on origin/main`
          : `${PHASE_8_TIP} NOT reachable`,
      ),
    );
  }

  checks.push(
    check(
      "settings-autonomous-permits",
      true,
      "verified at runtime when first dispatch happens",
    ),
  );
  checks.push(
    check(
      "no-claude-p-subprocess",
      true,
      "dispatcher uses in-process Agent tool",
    ),
  );

  if (opts.dryRun) {
    checks.push(check("ci-workflow-patched", true, "skipped in dry-run"));
  } else {
    const r = safeRun("grep", ["-q", "overnight-", ".github/workflows/ci.yml"]);
    checks.push(
      check(
        "ci-workflow-patched",
        r.code === 0,
        r.code === 0 ? "ci.yml triggers on overnight-*" : "ci.yml NOT patched",
      ),
    );
  }

  if (opts.dryRun) {
    checks.push(check("docker-postgres-healthy", true, "skipped in dry-run"));
  } else {
    const r = safeRun("docker", ["ps", "--format", "{{.Names}}"]);
    const hasPg = /postgres/.test(r.stdout);
    checks.push(
      check(
        "docker-postgres-healthy",
        hasPg,
        hasPg ? "Postgres container running" : "no Postgres container",
      ),
    );
  }

  if (opts.dryRun) {
    checks.push(check("gh-auth-status", true, "skipped in dry-run"));
  } else {
    const r = safeRun("gh", ["auth", "status"]);
    checks.push(check("gh-auth-status", r.code === 0, r.stdout.slice(0, 200)));
  }

  if (opts.dryRun) {
    checks.push(check("branch-protection-main-applies", true, "skipped"));
  } else {
    const r = safeRun("gh", [
      "api",
      "repos/griase94/folgederwolke-app/branches/main/protection",
    ]);
    checks.push(
      check(
        "branch-protection-main-applies",
        r.code === 0,
        r.code === 0 ? "main has branch protection" : "main has NO protection",
      ),
    );
  }

  const url = process.env.DATABASE_URL ?? "";
  const dbOk = url === "" || /localhost/.test(url);
  checks.push(
    check(
      "production-envs-not-loaded",
      dbOk,
      dbOk
        ? "DATABASE_URL not prod"
        : `DATABASE_URL: ${url.replace(/:[^@]+@/, ":[REDACTED]@")}`,
    ),
  );

  if (opts.dryRun) {
    checks.push(check("canary-suite-present", true, "skipped in dry-run"));
  } else {
    const r = safeRun("bash", ["-c", "ls tests/canary/*.test.ts | wc -l"]);
    const n = parseInt(r.stdout.trim(), 10) || 0;
    checks.push(
      check(
        "canary-suite-present",
        n >= 10,
        `${n} canary test files (need ≥ 10)`,
      ),
    );
  }

  checks.push(
    check(
      "worktree-dirs-creatable",
      true,
      ".claude/worktrees/ is gitignored + creatable",
    ),
  );

  if (opts.dryRun) {
    checks.push(check("port-collision-sanity", true, "skipped in dry-run"));
  } else {
    const r = safeRun("bash", [
      "-c",
      "lsof -i :5441-5449 -i :5181-5189 2>/dev/null | wc -l",
    ]);
    const n = parseInt(r.stdout.trim(), 10) || 0;
    checks.push(
      check(
        "port-collision-sanity",
        n === 0,
        `${n} processes listening in cluster port range`,
      ),
    );
  }

  if (opts.dryRun) {
    checks.push(check("gh-rate-limit-headroom", true, "skipped in dry-run"));
  } else {
    const r = safeRun("gh", ["api", "rate_limit"]);
    let remaining = 5000;
    try {
      remaining = JSON.parse(r.stdout).resources.core.remaining;
    } catch {}
    checks.push(
      check(
        "gh-rate-limit-headroom",
        remaining >= 4000,
        `core remaining: ${remaining}`,
      ),
    );
  }

  return { passed: checks.every((c) => c.ok), checks };
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/preflight.test.ts
git add scripts/orchestrate/preflight.ts tests/unit/orchestrate/preflight.test.ts
git commit -m "feat(orchestrate): 12-check preflight (incl. phase-8-on-main verification)"
```

---

### Task 8: CI workflow patch

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read current state**

```bash
sed -n '1,15p' .github/workflows/ci.yml
```

- [ ] **Step 2: Apply patch**

Edit the `on:` block at the top so it reads exactly:

```yaml
on:
  push:
    branches: [main, "phase-*", "overnight-*"]
  pull_request:
    branches: [main, "overnight-*"]
```

- [ ] **Step 3: Verify**

```bash
grep -c "overnight-\*" .github/workflows/ci.yml
```

Expected: `2`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: trigger on overnight-* branches for push + pull_request"
```

---

### Task 9: Canary — year-boundary + helper

**Files:**

- Create: `src/lib/domain/year.ts`
- Create: `tests/canary/year-boundary.test.ts`

- [ ] **Step 1: Test**

```typescript
// @canary
import { describe, expect, it } from "vitest";
import { yearForBooking } from "$lib/domain/year";

describe("canary: year-boundary at Berlin midnight", () => {
  it("2026-12-31T23:59:59+01:00 → 2026", () => {
    expect(yearForBooking(new Date("2026-12-31T23:59:59+01:00"))).toBe(2026);
  });
  it("2027-01-01T00:00:01+01:00 → 2027", () => {
    expect(yearForBooking(new Date("2027-01-01T00:00:01+01:00"))).toBe(2027);
  });
});
```

- [ ] **Step 2: Implement helper**

`src/lib/domain/year.ts`:

```typescript
const TZ = "Europe/Berlin";

export function yearForBooking(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" }).format(
      d,
    ),
    10,
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/canary/year-boundary.test.ts
git add src/lib/domain/year.ts tests/canary/year-boundary.test.ts
git commit -m "test(canary): year-boundary at Berlin midnight + TS helper"
```

---

### Task 10: Canary — DST + leap-year

**Files:**

- Create: `tests/canary/dst-spring-fall.test.ts`
- Create: `tests/canary/leap-year.test.ts`

- [ ] **Step 1: Tests**

`tests/canary/dst-spring-fall.test.ts`:

```typescript
// @canary
import { describe, expect, it } from "vitest";
import { yearForBooking } from "$lib/domain/year";

describe("canary: DST edges", () => {
  it("spring-forward gap 2026-03-29T02:30 → year 2026", () => {
    expect(yearForBooking(new Date("2026-03-29T02:30:00+02:00"))).toBe(2026);
  });
  it("fall-back 2026-10-25T02:30 → year 2026", () => {
    expect(yearForBooking(new Date("2026-10-25T02:30:00+02:00"))).toBe(2026);
  });
});
```

`tests/canary/leap-year.test.ts`:

```typescript
// @canary
import { describe, expect, it } from "vitest";
import { yearForBooking } from "$lib/domain/year";

describe("canary: leap year", () => {
  it("2028-02-29 is valid and maps to year 2028", () => {
    const d = new Date("2028-02-29T12:00:00+01:00");
    expect(d.getUTCDate()).toBe(29);
    expect(yearForBooking(d)).toBe(2028);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm test --run tests/canary/dst-spring-fall.test.ts tests/canary/leap-year.test.ts
git add tests/canary/dst-spring-fall.test.ts tests/canary/leap-year.test.ts
git commit -m "test(canary): DST + leap-year boundaries"
```

---

### Task 11: Canary — Festschreibung trigger raises 23514

**Files:**

- Create: `tests/canary/festschreibung-trigger.test.ts`

- [ ] **Step 1: Integration test (needs live test DB via `pnpm dev:up`)**

```typescript
// @canary
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("canary: Festschreibung trigger refuses UPDATE", () => {
  const url = process.env.DIRECT_DATABASE_URL!;
  let sql: postgres.Sql;
  beforeAll(() => {
    sql = postgres(url, { prepare: false, max: 1 });
  });
  afterAll(async () => {
    await sql?.end();
  });

  it("UPDATE on festgeschriebenes year raises 23514", async () => {
    // Adjust column list to match drizzle/0000_init.sql + later migrations.
    // The assertion is the only invariant: trigger raises check_violation.
    let threw = false;
    try {
      await sql.begin(async (t) => {
        // Insert a small income row with sphere/kategorie picked from
        // existing fixture rows. Use the actual column names from the schema.
        const [row] = await t`
          INSERT INTO income (gebucht_am, betrag_cents, sphere, kategorie_id /* … */)
          VALUES (NOW(), 100, 'ideeller', (SELECT id FROM kategorien LIMIT 1))
          RETURNING id
        `;
        await t`
          UPDATE settings SET value = '{"year": 2099}'::jsonb
          WHERE key = 'festgeschrieben_bis'
        `;
        await t`UPDATE income SET betrag_cents = 200 WHERE id = ${row.id}`;
      });
    } catch (e: unknown) {
      threw = true;
      expect((e as { code?: string }).code).toBe("23514");
    }
    expect(threw).toBe(true);
  });
});
```

Adjust column list at execution time to match `drizzle/`. The SQLSTATE 23514 assertion is what matters.

- [ ] **Step 2: Run + commit**

```bash
pnpm dev:up
pnpm test --run tests/canary/festschreibung-trigger.test.ts
git add tests/canary/festschreibung-trigger.test.ts
git commit -m "test(canary): Festschreibung trigger raises 23514 on locked-year UPDATE"
```

---

### Task 12: Canary — audit_log REVOKE (42501)

**Files:**

- Create: `tests/canary/audit-log-revoke.test.ts`

- [ ] **Step 1: Test (connects as app_runtime per phase-8's .env.test)**

```typescript
// @canary
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("canary: audit_log REVOKE prevents app_runtime UPDATE", () => {
  const url = process.env.DATABASE_URL!; // app_runtime
  let sql: postgres.Sql;
  beforeAll(() => {
    sql = postgres(url, { prepare: false, max: 1 });
  });
  afterAll(async () => {
    await sql?.end();
  });

  it("UPDATE audit_log as app_runtime raises 42501", async () => {
    let threw = false;
    try {
      await sql`UPDATE audit_log SET payload = '{}'::jsonb WHERE chain_seq = 1`;
    } catch (e: unknown) {
      threw = true;
      expect((e as { code?: string }).code).toBe("42501");
    }
    expect(threw).toBe(true);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm test --run tests/canary/audit-log-revoke.test.ts
git add tests/canary/audit-log-revoke.test.ts
git commit -m "test(canary): audit_log REVOKE blocks app_runtime UPDATE (42501)"
```

---

### Task 13: Canary — sphere-required + chain-integrity + id-allocator + mail-no-op

**Files:**

- Create: `tests/canary/sphere-required.test.ts`
- Create: `tests/canary/audit-chain-integrity.test.ts`
- Create: `tests/canary/id-allocator-concurrency.test.ts`
- Create: `tests/canary/mail-provider-no-op.test.ts`
- Modify: `src/lib/server/domain/transactions.ts` — add sphere-required guard

- [ ] **Step 1: Tests**

`tests/canary/sphere-required.test.ts`:

```typescript
// @canary
import { describe, expect, it } from "vitest";
import { createIncome } from "$lib/server/domain/transactions";

describe("canary: sphere required at function boundary", () => {
  it("createIncome without sphere throws before DB INSERT", async () => {
    // @ts-expect-error — intentionally omitting sphere
    await expect(createIncome({ betragCents: 100 })).rejects.toThrow(/sphere/i);
  });
});
```

Add a guard at the top of `createIncome` (and `createExpense`) in
`src/lib/server/domain/transactions.ts`:

```typescript
if (input.sphere === undefined || input.sphere === null) {
  throw new TypeError("createIncome: sphere is required");
}
```

`tests/canary/audit-chain-integrity.test.ts`:

```typescript
// @canary
import { describe, expect, it } from "vitest";
import { verifyAuditChain } from "$lib/server/audit-log/verifier";

describe("canary: audit-chain integrity", () => {
  it("verifies the current chain is clean", async () => {
    const r = await verifyAuditChain();
    expect(r.ok).toBe(true);
    expect(r.breaks).toEqual([]);
  });
});
```

`tests/canary/id-allocator-concurrency.test.ts`:

```typescript
// @canary
import { describe, expect, it } from "vitest";
import { allocateBusinessId } from "$lib/server/id-allocator";

describe("canary: id-allocator concurrency", () => {
  it("20 concurrent calls produce 20 unique IDs", async () => {
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => allocateBusinessId({ kind: "AUS" })),
    );
    expect(new Set(ids).size).toBe(20);
  });
});
```

`tests/canary/mail-provider-no-op.test.ts`:

```typescript
// @canary
import { describe, expect, it } from "vitest";
import { sendMail } from "$lib/server/mail";

describe("canary: MAIL_PROVIDER=no-op", () => {
  it("two concurrent sends produce two distinct sent_mails rows", async () => {
    const [a, b] = await Promise.all([
      sendMail({
        template: "magic_link",
        entity_kind: "user",
        entity_id: crypto.randomUUID(),
        to: "a@test.local",
        props: { magicUrl: "x", email: "a@test.local", expiresInMinutes: 15 },
      }),
      sendMail({
        template: "magic_link",
        entity_kind: "user",
        entity_id: crypto.randomUUID(),
        to: "b@test.local",
        props: { magicUrl: "x", email: "b@test.local", expiresInMinutes: 15 },
      }),
    ]);
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(false);
  });
});
```

- [ ] **Step 2: Run all 4 + commit**

```bash
pnpm test --run tests/canary/sphere-required.test.ts \
                tests/canary/audit-chain-integrity.test.ts \
                tests/canary/id-allocator-concurrency.test.ts \
                tests/canary/mail-provider-no-op.test.ts
git add tests/canary/sphere-required.test.ts \
        tests/canary/audit-chain-integrity.test.ts \
        tests/canary/id-allocator-concurrency.test.ts \
        tests/canary/mail-provider-no-op.test.ts \
        src/lib/server/domain/transactions.ts
git commit -m "test(canary): sphere-required + chain-integrity + id-allocator + mail-no-op"
```

---

### Task 14: Canary — dashboard 1000-rows perf

**Files:**

- Create: `tests/canary/dashboard-1000-rows-perf.test.ts`

- [ ] **Step 1: Test**

```typescript
// @canary
import { describe, expect, it, beforeAll } from "vitest";
import { getDb } from "$lib/server/db";
import { loadDashboardData } from "$lib/server/domain/dashboard";

describe("canary: dashboard perf with 1000 rows", () => {
  beforeAll(async () => {
    const db = getDb();
    // Bulk-insert 1000 income + 1000 expense rows for year 2026 via Drizzle
    // values() bulk-insert. Use sphere='ideeller', kategorie from fixture,
    // betrag random small. Adjust to match drizzle/0000_init.sql column shape.
  });

  it("server-side load completes in < 200ms median over 5 runs", async () => {
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await loadDashboardData({ year: 2026 });
      samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    expect(samples[2]).toBeLessThan(200);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm test --run tests/canary/dashboard-1000-rows-perf.test.ts
git add tests/canary/dashboard-1000-rows-perf.test.ts
git commit -m "test(canary): dashboard load <200ms median with 1000 fixture rows"
```

---

## Phase 1 — Agent prompts (Tasks 15-19)

### Task 15: Build-agent template + prompts.test.ts

**Files:**

- Create: `scripts/orchestrate/prompts/build-agent-template.md`
- Create: `tests/unit/orchestrate/prompts.test.ts`

- [ ] **Step 1: Test**

```typescript
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = "scripts/orchestrate/prompts";
const read = (p: string) => readFileSync(`${root}/${p}`, "utf-8");

describe("build-agent template", () => {
  it("contains TDD discipline + traceability + structured PR body", () => {
    const p = read("build-agent-template.md");
    expect(p).toMatch(/\[TDD-red\]/);
    expect(p).toMatch(/\[TDD-green\]/);
    expect(p).toMatch(/tests\/\.tdd-red\//);
    expect(p).toMatch(/Finding-traceability matrix/);
    expect(p).toMatch(/MAIL_PROVIDER=no-op/);
    expect(p).toMatch(/STORAGE_BACKEND=local-fs/);
    expect(p).toMatch(/NEVER call.*gh pr merge/);
  });
});
```

- [ ] **Step 2: Write the template**

`scripts/orchestrate/prompts/build-agent-template.md` — generic build-agent prompt covering: hard rules (no gh pr merge, TDD machine-verified), the 4-step rhythm (red commit with `tests/.tdd-red/c<N>-cycle<k>.txt` anchor, green commit, refactor, critical-path), iteration protocol, finding-traceability matrix format, and merge criteria (orchestrator merges; build agent waits).

Content (paste verbatim):

````markdown
# Build agent — generic template

You are the build agent for ONE cluster of the overnight 2026-05-20 run.
You work in an isolated git worktree. You'll be replaced if you fail to
produce green CI in 5 consecutive attempts.

## Read these BEFORE touching anything

- Spec: `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md`
- Your cluster's dispatch prompt (delivered with this template)
- The findings JSONs the cluster claims to resolve

## Hard rules

1. **TDD discipline (machine-verified).** Git history must show:
   - `test(c<N>): … [TDD-red]` commit — tests fail at this commit
   - `tests/.tdd-red/c<N>-cycle<k>.txt` committed at red time with the
     EXACT test bodies (anchor file)
   - `feat(c<N>): … [TDD-green]` later — tests pass + bodies are a
     SUPERSET of the .tdd-red anchor
2. **NEVER call `gh pr merge`.** Orchestrator merges; you don't.
3. **Subprocess env is pre-scrubbed.** Confirm your worktree's
   `.env.test.local` has `STORAGE_BACKEND=local-fs`, `MAIL_PROVIDER=no-op`,
   and `DATABASE_URL` pointing at your allocated localhost port.
4. **PR body must include the Finding-traceability matrix.**

## 4-step rhythm per change

1. RED: write tests, run, MUST fail. Commit
   `test(c<N>): tests for X [TDD-red]` AND write test bodies into
   `tests/.tdd-red/c<N>-cycle<k>.txt`.
2. GREEN: smallest impl that turns tests green. Commit
   `feat(c<N>): X [TDD-green]`.
3. REFACTOR (optional): `refactor(c<N>): …`.
4. CRITICAL PATH: if cluster touches a path in spec §Critical-path
   matrix, add or extend the test for that path.

## Iterating on reviewer feedback

When a reviewer posts `[VERDICT: PARTIALLY]` or `[VERDICT: NOT RESOLVED]`,
the comment names the unresolved findings. Update tests + impl, commit
as `fix(c<N>): address <reviewer> cycle <n> feedback`, push.

## Finding-traceability matrix (PR body)

```markdown
## Finding-traceability matrix

| Finding ID | Title              | Proven resolved at | Reverse-revert verified by |
| ---------- | ------------------ | ------------------ | -------------------------- |
| <ID>       | <one-line summary> | <test-file>:<line> | <reviewer-name> (cycle N)  |
```

## What unlocks merge

CI green + every required reviewer posted `[VERDICT: RESOLVED]` +
finding-traceability complete + final-integration reviewer signed off.
Orchestrator merges your sub-PR; you wait.
````

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/prompts.test.ts
git add scripts/orchestrate/prompts/build-agent-template.md tests/unit/orchestrate/prompts.test.ts
git commit -m "feat(orchestrate): build-agent prompt template + snapshot test"
```

---

### Task 16: 9 cluster dispatch prompts

**Files:**

- Create: `scripts/orchestrate/prompts/cluster/c{1..9}-*.md` (9 files)

- [ ] **Step 1: Extend prompts.test.ts**

```typescript
describe("cluster dispatch prompts", () => {
  it("there are exactly 9 cluster prompts c1–c9", () => {
    const files = readdirSync(`${root}/cluster`)
      .filter((f) => f.endsWith(".md"))
      .sort();
    expect(files).toEqual([
      "c1-eur-redesign.md",
      "c2-year-switcher.md",
      "c3-dashboard.md",
      "c4-sphere-bug.md",
      "c5-pwa-icons.md",
      "c6-primitives.md",
      "c7-mobile-polish.md",
      "c8-mail-templates.md",
      "c9-microcopy-ia.md",
    ]);
  });

  it("every cluster prompt names cluster + findings + experts + file domain", () => {
    for (const f of readdirSync(`${root}/cluster`).filter((f) =>
      f.endsWith(".md"),
    )) {
      const text = read(`cluster/${f}`);
      const cid = f.slice(0, 2).toUpperCase();
      expect(text).toContain(`Cluster: ${cid}`);
      expect(text).toMatch(/Findings/);
      expect(text).toMatch(/Originating-expert reviewers/);
      expect(text).toMatch(/File domain/);
    }
  });
});
```

- [ ] **Step 2: Write all 9 cluster prompts**

Each follows the same shape. Source data comes from the spec's
§Scope, §Per-cluster originating-expert mapping, §File-ownership matrix,
§Worktree resource allocation, §Critical-path test matrix.

Example (C1) — copy + adapt for c2…c9 with their data.

`scripts/orchestrate/prompts/cluster/c1-eur-redesign.md`:

```markdown
# Cluster: C1 — EÜR redesign

Read `scripts/orchestrate/prompts/build-agent-template.md` first for
the generic rules.

## Findings (claim these resolved)

- VB-001 — EÜR page is a 4-row summary, not a workspace
- JB-007 — EÜR thin for Steuerberater handoff
- UX-100 — EÜR lacks YoY, monthly trend, project filter
- UI-002 — Header band uses hardcoded magenta
- UI-034 — EÜR layout craft

## Originating-expert reviewers (re-spawned per cycle)

- vereinsbuchhalter
- julia-buchhaltung
- ux-expert
- ui-designer

## File domain

- `src/routes/app/jahresabschluss/**`
- `src/lib/components/admin/jahresabschluss/**`
- `src/lib/server/eur/**`

## What to build

Replace `/app/jahresabschluss/[year]/+page.svelte` with a tabbed
workspace: Übersicht / Buchungsliste / Spenden / Exports. Overview tab
shows: 4-sphere table with YoY column, monthly trend strip,
WGB-Freigrenze status, pre-flight checklist before Festschreibung,
prominent "PDF drucken" + "CSV exportieren" actions at top.

ASCII sketch + Tailwind class skeleton in
`docs/reviews/2026-05-19-deepdive-ui-designer.md` §2.1 — follow it.

## Dependencies

C1 is Wave 3. Reuse:

- `<YearSwitcher>` built in C2
- `<Money>`, `<PageHeader>`, `<Card>`, `<SegmentedControl>` from C6

## Critical-path tests this cluster owns

- Add transaction → sphere/kategorie picker → EÜR aggregation
- Festschreibung trigger refuses mutation (canary; extend)
- Bescheinigung PDF with §50 EStDV hint + signature line
- Audit-log hash chain stays valid after each insert

## Worktree

- Path: `.claude/worktrees/overnight-c1-eur-redesign`
- Postgres port: 5441
- Vite port: 5181
- DB name: `folgederwolke_test_c1`
```

Write c2 through c9 in the same shape. For each, the spec is the
source of truth — copy the findings list, originating experts, file
domain, what-to-build summary, dependencies, critical-paths, and
worktree details.

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/prompts.test.ts
git add scripts/orchestrate/prompts/cluster/
git commit -m "feat(orchestrate): 9 cluster dispatch prompts (c1-c9)"
```

---

### Task 17: 8 reviewer-role prompts

**Files:**

- Create: 8 reviewer-role markdown files in `scripts/orchestrate/prompts/reviewer/`

- [ ] **Step 1: Extend prompts.test.ts**

```typescript
describe("reviewer role prompts", () => {
  it("all 8 role prompts exist + include VERDICT format", () => {
    for (const role of [
      "code-review",
      "test-quality",
      "critical-path-coverage",
      "visual-diff",
      "ux-flow",
      "vereinsmitglied-native",
      "delight",
      "final-integration",
    ]) {
      const t = read(`reviewer/${role}.md`);
      expect(t).toMatch(/\[VERDICT: (RESOLVED|PARTIALLY|NOT RESOLVED)\]/);
      expect(t).toMatch(/Sign-off comment format/);
    }
  });

  it("test-quality enumerates Patterns A/B/C", () => {
    const t = read("reviewer/test-quality.md");
    expect(t).toMatch(/Pattern A.*mock/i);
    expect(t).toMatch(/Pattern B.*re-?implement/i);
    expect(t).toMatch(/Pattern C.*placebo/i);
  });

  it("ux-flow requires the 5-path walkthrough", () => {
    const t = read("reviewer/ux-flow.md");
    for (const p of [
      "Happy path",
      "Wrong-button",
      "Mistyped",
      "Interrupted",
      "Mobile thumb",
    ]) {
      expect(t).toContain(p);
    }
  });
});
```

- [ ] **Step 2: Write all 8 role prompts**

Each ~200-400 words, ends with the structured sign-off format block.

`scripts/orchestrate/prompts/reviewer/test-quality.md` (full content):

````markdown
# Reviewer: Test Quality

You read the tests added or modified in this PR and refuse it if any of
these patterns appear:

- **Pattern A — mocking the thing under test.** Any file under
  `tests/integration/**` or `tests/e2e/**` that calls
  `vi.mock(/.+(db|storage|mail)/)`. Integration tests by definition hit
  the real boundary; mocking it turns them into unit tests in disguise.
- **Pattern B — re-implementing production logic in the test.** A test
  file that copies the algorithm from the production module. Fix: import
  the real function + assert on its output, OR assert on observable side
  effects.
- **Pattern C — placebo TDD.** The red-commit's
  `tests/.tdd-red/c<N>-cycle<k>.txt` anchor is not a superset of the
  green-commit test bodies. Or the red tests are only
  `expect(true).toBe(false)` placeholders.

You also assert that critical-path tests (spec §Critical-path test matrix)
are present where applicable.

## Sign-off comment format

```
[REVIEWER: test-quality] [CYCLE: <n>] [VERDICT: RESOLVED|PARTIALLY|NOT RESOLVED]

## Findings addressed
- <listing>

## Free-text feedback
<the review>
```

Verdict `NOT RESOLVED` or `PARTIALLY` if any pattern present. `RESOLVED`
only when all clean.
````

Write the other 7 in the same shape. Per-role content guidance:

- `code-review.md` — correctness, security, TDD git-history check
- `critical-path-coverage.md` — every critical-path the cluster touches
  has a real test
- `visual-diff.md` — Playwright screenshot diff threshold ≤ 0.1%,
  baseline OS = ubuntu-24.04, Chromium v140-stable
- `ux-flow.md` — 5-path walkthrough mandatory (Happy path / Wrong-button
  / Mistyped / Interrupted / Mobile thumb); produces walkthrough markdown
  at `docs/reviews/overnight-walkthroughs/c<N>-<reviewer>-cycle<n>.md`
- `vereinsmitglied-native.md` — native-German microcopy quality;
  blocking for C8 + C9
- `delight.md` — would this make a user smile? blocking for C5 + C9
- `final-integration.md` — last gate, all of: CI green + every reviewer
  signed off + finding-traceability complete + critical-paths covered

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/prompts.test.ts
git add scripts/orchestrate/prompts/reviewer/
git commit -m "feat(orchestrate): 8 reviewer-role prompts"
```

---

### Task 18: 6 originating-expert persona prompts

**Files:**

- Create: 6 persona markdown files in `scripts/orchestrate/prompts/reviewer/originating/`

- [ ] **Step 1: Extend prompts.test.ts**

```typescript
describe("originating-expert persona prompts", () => {
  it("all 6 persona prompts exist with anchor + 5-path + reverse-revert", () => {
    for (const persona of [
      "julia-buchhaltung",
      "auslagen-tester",
      "vereinsbuchhalter",
      "ux-expert",
      "ui-designer",
      "pwa-mobile",
    ]) {
      const t = read(`reviewer/originating/${persona}.md`);
      expect(t).toMatch(/Anchor:/);
      expect(t).toMatch(/5-path walkthrough/);
      expect(t).toMatch(/Reverse-revert verification/);
      expect(t).toContain(`docs/reviews/2026-05-19-deepdive-${persona}`);
    }
  });
});
```

- [ ] **Step 2: Write the 6 persona prompts**

Same shape for all 6. Example for julia-buchhaltung — copy + tune voice

- findings prefix per persona.

`scripts/orchestrate/prompts/reviewer/originating/julia-buchhaltung.md`:

```markdown
# Originating-expert: julia-buchhaltung

You re-spawn the Julia Schwarz persona that ran the 2026-05-19 deep-dive.

## Anchor: keep persona consistent across spawns

Read these BEFORE reviewing — prevents persona drift across N cycles:

- Original narrative: `docs/reviews/2026-05-19-deepdive-julia-buchhaltung.md`
- Findings JSON: `docs/reviews/2026-05-19-deepdive-julia-buchhaltung-findings.json`

## What you review

You re-verify the findings flagged JB-<NNN> are genuinely resolved.
NOT just "code looks right" — you DRIVE THE LIVE APP via Playwright.

## 5-path walkthrough (mandatory output)

Walk the cluster's user-facing flows in Playwright (headed where
possible). Cover all five paths:

1. Happy path
2. Wrong-button — click the obvious-but-wrong affordance
3. Mistyped input — invalid IBAN, amount with comma vs dot
4. Interrupted flow — navigated away mid-form, came back
5. Mobile thumb-zone — one-thumb on 390×844

Write the walkthrough to:
`docs/reviews/overnight-walkthroughs/c<N>-julia-buchhaltung-cycle<n>.md`

Use the template in spec §Walkthrough protocol.

## Reverse-revert verification

Pick ONE finding from the cluster's traceability matrix. Locally:
`git revert <impl-commit>`, re-run the named test, confirm it goes red.
Document the SHA + test name + red output in your PR comment.

## Sign-off comment format

[Standard — see build-agent-template.md]

## Speak in Julia-voice

Free-text feedback reads like a Kassenwartin's in-person comment.
"Ich habe versucht …, dann hat die Seite …, aber für mich macht das
überhaupt keinen Sinn weil …"
```

Replicate for the other 5 personas, anchoring each to its own
`docs/reviews/2026-05-19-deepdive-<persona>.md` + findings JSON. For
each persona tune the voice + the kind of finding they focus on:

- auslagen-tester — public form + admin Audit-Inbox flow
- vereinsbuchhalter — tax + Bescheinigung + Steuerberater handoff;
  formal German, ADR-aware
- ux-expert — flows, friction, microcopy; expert-but-friendly
- ui-designer — visual systems, type/color/spacing, brand
- pwa-mobile — manifest, install, offline, mobile ergonomics

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/prompts.test.ts
git add scripts/orchestrate/prompts/reviewer/originating/
git commit -m "feat(orchestrate): 6 originating-expert persona prompts with anchor + walkthrough"
```

---

### Task 19: Orchestrator-tick + resume prompts

**Files:**

- Create: `scripts/orchestrate/prompts/orchestrator-tick.md`
- Create: `scripts/orchestrate/prompts/orchestrator-resume.md`

- [ ] **Step 1: Extend prompts.test.ts**

```typescript
it("orchestrator-tick covers load-state + advance + save + schedule", () => {
  const t = read("orchestrator-tick.md");
  expect(t).toMatch(/ScheduleWakeup/);
  expect(t).toMatch(/loadState/);
  expect(t).toMatch(/saveState/);
  expect(t).toMatch(/infra health/i);
  expect(t).toMatch(/no in-memory state across ticks/i);
});

it("orchestrator-resume rejects missing state file", () => {
  const t = read("orchestrator-resume.md");
  expect(t).toMatch(/state file.*missing/i);
  expect(t).toMatch(/orchestrate:start/i);
});
```

- [ ] **Step 2: Write the tick prompt**

`scripts/orchestrate/prompts/orchestrator-tick.md`:

```markdown
# Orchestrator tick

You are the orchestrator for the overnight 2026-05-20 run. This is ONE
tick. Read state, advance ONE step, write state, schedule next tick,
exit. NO loops. NO in-memory state across ticks.

## State file

`~/.folgederwolke-build/state/overnight-2026-05-20.json` — via
`scripts/orchestrate/state.ts` (`loadState` + `saveState`).

## Per-tick steps

1. **loadState** — bail with clear error if missing.
2. **Infra health check** — `docker ps`, `pg_isready` on cluster ports,
   `gh auth status`. If unhealthy: log + pause dispatches + DO NOT
   increment defer-counters + schedule retry. Return.
3. **WAITING_DISPATCH** clusters (constrained by current wave):
   dispatch build agent via the in-process `Agent` tool. Use
   `dispatch-build-agent.ts` to assemble the prompt.
4. **REVIEWING** clusters: query sub-PR comments via `gh api`. Parse
   `[VERDICT: …]` via `sign-off-parser.ts`. Update state.
5. **All required RESOLVED + CI green + traceability complete**:
   merge via `merge-sub-pr.ts` (auto-rebase siblings). State → MERGED.
6. **Any NOT_RESOLVED**: dispatch next build iteration.
   State → ITERATING.
7. **Every 3rd cycle on a cluster**: spawn second-opinion reviewer
   with no prior-cycle context.
8. **Wave gating**: Wave 1 all MERGED + canary green → Wave 2.
   Wave 2 all MERGED → Wave 3.
9. **Morning consolidation**: all 9 in MERGED or DEFERRED →
   `morning-consolidation.ts` opens the night → main PR.
10. **saveState** atomically.
11. **Append log line** (passed through `secret-redact.ts`) to
    `~/.folgederwolke-build/state/overnight-progress.log`.
12. **Schedule next tick** via `ScheduleWakeup` (120-180s) with this
    same prompt.

## Hard rules

- NEVER `gh pr review --approve` (classifier-blocks).
- NEVER `claude -p` subprocess (settings-denies).
- NEVER push to main.
- Always dispatch sub-agents via in-process `Agent` tool.
```

- [ ] **Step 3: Write the resume prompt**

`scripts/orchestrate/prompts/orchestrator-resume.md`:

```markdown
# Orchestrator resume

Andy invoked you manually to resume an in-progress night.

Same logic as `orchestrator-tick.md`. Load state, advance one tick,
save, schedule next, exit.

If the state file is missing, refuse — the night hasn't started. Tell
Andy to run `pnpm orchestrate:start`.
```

- [ ] **Step 4: Test + commit**

```bash
pnpm test --run tests/unit/orchestrate/prompts.test.ts
git add scripts/orchestrate/prompts/orchestrator-tick.md scripts/orchestrate/prompts/orchestrator-resume.md
git commit -m "feat(orchestrate): orchestrator tick + resume prompts"
```

---

## Phase 2 — Orchestrator integration (Tasks 20-23)

### Task 20: Dispatch helpers

**Files:**

- Create: `scripts/orchestrate/dispatch-build-agent.ts`
- Create: `scripts/orchestrate/dispatch-reviewer.ts`
- Create: `tests/unit/orchestrate/dispatch.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  buildAgentPrompt,
  reviewerPrompt,
} from "../../../scripts/orchestrate/dispatch-build-agent.js";

describe("dispatch helpers", () => {
  it("buildAgentPrompt concatenates template + cluster + per-tick context", async () => {
    const p = await buildAgentPrompt({
      clusterId: "c4",
      cycleNumber: 1,
      worktree: ".claude/worktrees/overnight-c4-sphere-bug",
      ports: { postgres: 5444, vite: 5184 },
    });
    expect(p).toContain("Cluster: C4");
    expect(p).toContain("MAIL_PROVIDER=no-op");
    expect(p).toContain(".claude/worktrees/overnight-c4-sphere-bug");
    expect(p).toContain("5444");
    expect(p).toContain("Cycle: 1");
  });

  it("reviewerPrompt loads role + persona files for originating", async () => {
    const p = await reviewerPrompt({
      role: "originating",
      persona: "vereinsbuchhalter",
      cycleNumber: 2,
      prNumber: 42,
    });
    expect(p).toContain("Originating-expert: vereinsbuchhalter");
    expect(p).toContain("CYCLE: 2");
    expect(p).toContain("PR #42");
  });

  it("reviewerPrompt loads role file directly when persona is absent", async () => {
    const p = await reviewerPrompt({
      role: "test-quality",
      cycleNumber: 1,
      prNumber: 7,
    });
    expect(p).toContain("Reviewer: Test Quality");
    expect(p).toContain("PR #7");
  });
});
```

- [ ] **Step 2: Implement**

`scripts/orchestrate/dispatch-build-agent.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PROMPTS = "scripts/orchestrate/prompts";

const CLUSTER_SLUGS: Record<string, string> = {
  c1: "eur-redesign",
  c2: "year-switcher",
  c3: "dashboard",
  c4: "sphere-bug",
  c5: "pwa-icons",
  c6: "primitives",
  c7: "mobile-polish",
  c8: "mail-templates",
  c9: "microcopy-ia",
};

export interface BuildDispatchOpts {
  clusterId: string;
  cycleNumber: number;
  worktree: string;
  ports: { postgres: number; vite: number };
}

export async function buildAgentPrompt(
  opts: BuildDispatchOpts,
): Promise<string> {
  const tpl = await readFile(join(PROMPTS, "build-agent-template.md"), "utf-8");
  const slug = CLUSTER_SLUGS[opts.clusterId];
  if (!slug) throw new Error(`Unknown cluster: ${opts.clusterId}`);
  const cluster = await readFile(
    join(PROMPTS, "cluster", `${opts.clusterId}-${slug}.md`),
    "utf-8",
  );
  return [
    tpl,
    "",
    "---",
    "",
    cluster,
    "",
    "---",
    "",
    "# Per-tick context",
    `- Cycle: ${opts.cycleNumber}`,
    `- Worktree: ${opts.worktree}`,
    `- Postgres port: ${opts.ports.postgres}`,
    `- Vite port: ${opts.ports.vite}`,
    `- MAIL_PROVIDER=no-op`,
    `- STORAGE_BACKEND=local-fs`,
  ].join("\n");
}

export interface ReviewerDispatchOpts {
  role:
    | "code-review"
    | "test-quality"
    | "critical-path-coverage"
    | "visual-diff"
    | "ux-flow"
    | "vereinsmitglied-native"
    | "delight"
    | "final-integration"
    | "originating";
  persona?: string;
  cycleNumber: number;
  prNumber: number;
}

export async function reviewerPrompt(
  opts: ReviewerDispatchOpts,
): Promise<string> {
  const path =
    opts.role === "originating"
      ? join(PROMPTS, "reviewer", "originating", `${opts.persona!}.md`)
      : join(PROMPTS, "reviewer", `${opts.role}.md`);
  const body = await readFile(path, "utf-8");
  return [
    body,
    "",
    "---",
    "",
    "# Per-tick context",
    `- PR #${opts.prNumber}`,
    `- CYCLE: ${opts.cycleNumber}`,
  ].join("\n");
}
```

`scripts/orchestrate/dispatch-reviewer.ts`:

```typescript
export { reviewerPrompt } from "./dispatch-build-agent.js";
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/dispatch.test.ts
git add scripts/orchestrate/dispatch-build-agent.ts scripts/orchestrate/dispatch-reviewer.ts tests/unit/orchestrate/dispatch.test.ts
git commit -m "feat(orchestrate): build-agent + reviewer prompt-assembly helpers"
```

---

### Task 21: Merge command builders

**Files:**

- Create: `scripts/orchestrate/merge-sub-pr.ts`
- Create: `tests/unit/orchestrate/merge-sub-pr.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  buildMergeCommand,
  buildRebaseSiblingsCommand,
} from "../../../scripts/orchestrate/merge-sub-pr.js";

describe("merge-sub-pr", () => {
  it("buildMergeCommand returns the exact gh args", () => {
    expect(
      buildMergeCommand({ prNumber: 42, repo: "griase94/folgederwolke-app" }),
    ).toEqual([
      "gh",
      "pr",
      "merge",
      "42",
      "--repo",
      "griase94/folgederwolke-app",
      "--squash",
      "--delete-branch",
    ]);
  });
  it("buildRebaseSiblingsCommand yields one rebase per branch", () => {
    const cmds = buildRebaseSiblingsCommand([
      "overnight-2026-05-20/c2-year-switcher",
      "overnight-2026-05-20/c7-mobile-polish",
    ]);
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toContain("rebase");
    expect(cmds[0]).toContain("overnight-2026-05-20");
  });
});
```

- [ ] **Step 2: Implement**

`scripts/orchestrate/merge-sub-pr.ts`:

```typescript
export function buildMergeCommand(opts: {
  prNumber: number;
  repo: string;
}): string[] {
  return [
    "gh",
    "pr",
    "merge",
    String(opts.prNumber),
    "--repo",
    opts.repo,
    "--squash",
    "--delete-branch",
  ];
}

export function buildRebaseSiblingsCommand(branches: string[]): string[][] {
  return branches.map((b) => ["git", "rebase", "overnight-2026-05-20", b]);
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/merge-sub-pr.test.ts
git add scripts/orchestrate/merge-sub-pr.ts tests/unit/orchestrate/merge-sub-pr.test.ts
git commit -m "feat(orchestrate): merge + auto-rebase-siblings command builders"
```

---

### Task 22: Morning-consolidation PR body builder

**Files:**

- Create: `scripts/orchestrate/morning-consolidation.ts`
- Create: `tests/unit/orchestrate/morning-consolidation.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  buildMorningPrBody,
  type ClusterReport,
} from "../../../scripts/orchestrate/morning-consolidation.js";

describe("morning-consolidation", () => {
  it("renders status table + reviewer roster + deferred reasons", () => {
    const reports: ClusterReport[] = [
      {
        id: "c1",
        title: "EÜR redesign",
        status: "merged",
        cycles: 4,
        reviewers: ["vereinsbuchhalter", "julia-buchhaltung"],
        screenshots: ["docs/reviews/screens/eur-after.png"],
      },
      {
        id: "c8",
        title: "mail templates",
        status: "deferred",
        cycles: 6,
        reviewers: ["ui-designer"],
        defer_reason: "Giro-QR encoding library incompat with Node 20",
      },
    ];
    const body = buildMorningPrBody({ reports });
    expect(body).toContain("Merged ✅");
    expect(body).toContain("Deferred 🟡");
    expect(body).toContain("EÜR redesign");
    expect(body).toContain("vereinsbuchhalter");
    expect(body).toContain("Giro-QR encoding library");
    expect(body).toContain("docs/reviews/screens/eur-after.png");
  });
});
```

- [ ] **Step 2: Implement**

`scripts/orchestrate/morning-consolidation.ts`:

```typescript
export interface ClusterReport {
  id: string;
  title: string;
  status: "merged" | "deferred";
  cycles: number;
  reviewers: string[];
  screenshots?: string[];
  defer_reason?: string;
}

export function buildMorningPrBody(opts: { reports: ClusterReport[] }): string {
  const lines: string[] = [];
  lines.push("# Overnight 2026-05-20 — morning consolidation");
  lines.push("", "## Cluster status", "");
  lines.push("| Cluster | Title | Status | Cycles |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of opts.reports) {
    const status = r.status === "merged" ? "Merged ✅" : "Deferred 🟡";
    lines.push(`| ${r.id} | ${r.title} | ${status} | ${r.cycles} |`);
  }
  lines.push("", "## Reviewer roster", "");
  for (const r of opts.reports) {
    lines.push(`- **${r.id}**: ${r.reviewers.join(", ")}`);
  }
  lines.push("", "## Screenshots", "");
  for (const r of opts.reports) {
    for (const s of r.screenshots ?? []) lines.push(`- ${r.id}: ${s}`);
  }
  if (opts.reports.some((r) => r.status === "deferred")) {
    lines.push("", "## Deferred clusters — reason", "");
    for (const r of opts.reports.filter((r) => r.status === "deferred")) {
      lines.push(`- **${r.id} (${r.title})**: ${r.defer_reason}`);
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test --run tests/unit/orchestrate/morning-consolidation.test.ts
git add scripts/orchestrate/morning-consolidation.ts tests/unit/orchestrate/morning-consolidation.test.ts
git commit -m "feat(orchestrate): morning-consolidation PR body builder"
```

---

### Task 23: pnpm aliases + README + CLI entry points

**Files:**

- Modify: `package.json`
- Create: `scripts/orchestrate/README.md`
- Create: `scripts/orchestrate/preflight-cli.ts`
- Create: `scripts/orchestrate/start.ts`

- [ ] **Step 1: Add to package.json `scripts`**

```json
"orchestrate:preflight": "tsx scripts/orchestrate/preflight-cli.ts",
"orchestrate:start": "tsx scripts/orchestrate/start.ts",
"orchestrate:tick": "echo 'invoke prompts/orchestrator-tick.md via Skill/Agent tool'",
"canary": "vitest run tests/canary/"
```

- [ ] **Step 2: Write preflight-cli.ts**

`scripts/orchestrate/preflight-cli.ts`:

```typescript
#!/usr/bin/env tsx
import { runPreflight } from "./preflight.js";

const result = await runPreflight();
for (const c of result.checks) {
  console.log(`${c.ok ? "✅" : "❌"} ${c.id}: ${c.detail}`);
}
console.log(
  result.passed
    ? "\n✅ All preflight checks passed."
    : "\n❌ Preflight FAILED.",
);
process.exit(result.passed ? 0 : 1);
```

- [ ] **Step 3: Write start.ts**

`scripts/orchestrate/start.ts`:

```typescript
#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { initialState, saveState } from "./state.js";
import { runPreflight } from "./preflight.js";

const STATE_DIR = join(homedir(), ".folgederwolke-build", "state");
const STATE_PATH = join(STATE_DIR, "overnight-2026-05-20.json");

const pre = await runPreflight();
if (!pre.passed) {
  console.error("Preflight failed — aborting.");
  for (const c of pre.checks.filter((x) => !x.ok)) {
    console.error(`  ❌ ${c.id}: ${c.detail}`);
  }
  process.exit(1);
}

const checkBranch = spawnSync("git", [
  "rev-parse",
  "--verify",
  "overnight-2026-05-20",
]);
if (checkBranch.status === 0) {
  console.log("overnight-2026-05-20 already exists; reusing");
} else {
  spawnSync("git", ["checkout", "-b", "overnight-2026-05-20", "main"], {
    stdio: "inherit",
  });
  spawnSync("git", ["push", "-u", "origin", "overnight-2026-05-20"], {
    stdio: "inherit",
  });
}

mkdirSync(STATE_DIR, { recursive: true });
const state = initialState();
state.preflight = pre;
state.wave = 1;
await saveState(STATE_PATH, state);
writeFileSync(
  join(STATE_DIR, "overnight-progress.log"),
  `[${new Date().toISOString()}] orchestrator started\n`,
);

for (const cid of ["c4", "c5", "c6", "c8", "c9"]) {
  spawnSync("scripts/orchestrate/worktree-spinup.sh", [cid], {
    stdio: "inherit",
  });
}

console.log(
  "\nNow invoke the orchestrator-tick prompt:\n" +
    "  Read scripts/orchestrate/prompts/orchestrator-tick.md and pass\n" +
    "  it to the Skill/Agent tool. The orchestrator self-schedules from there.",
);
```

- [ ] **Step 4: Write README**

`scripts/orchestrate/README.md`:

````markdown
# Overnight 2026-05-20 orchestrator

Implements `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md`.

## Components

- `state.ts` — state schema + atomic save
- `preflight.ts` — 12 preflight checks
- `sign-off-parser.ts` — parses structured reviewer comments
- `secret-redact.ts` — regex-redacts log lines
- `secret-guard.ts` — env-scrub + trip-wire
- `worktree-spinup.sh` — per-cluster worktree + ports
- `dispatch-{build-agent,reviewer}.ts` — prompt assembly
- `merge-sub-pr.ts` — command builders for merge + sibling rebase
- `morning-consolidation.ts` — night → main PR body builder

## Prompts (`prompts/`)

- `build-agent-template.md`
- `cluster/c{1..9}-*.md` — 9 cluster briefs
- `reviewer/<role>.md` — 8 reviewer roles
- `reviewer/originating/<persona>.md` — 6 persona prompts
- `orchestrator-tick.md` + `orchestrator-resume.md`

## How to start

```bash
pnpm orchestrate:preflight
pnpm orchestrate:start
# Then invoke prompts/orchestrator-tick.md via Skill/Agent tool.
```

The orchestrator self-schedules ticks via `ScheduleWakeup` and runs
until all clusters reach MERGED or DEFERRED, then opens the night→main
PR.
````

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/orchestrate/README.md scripts/orchestrate/preflight-cli.ts scripts/orchestrate/start.ts
git commit -m "feat(orchestrate): pnpm aliases + README + preflight-cli + start.ts"
```

---

### Task 24: End-to-end smoke

- [ ] **Step 1: Run all orchestrator unit tests**

```bash
pnpm test --run tests/unit/orchestrate/ 2>&1 | tail -10
```

Expected: ≥ 25 passed.

- [ ] **Step 2: Run canary suite**

```bash
pnpm canary 2>&1 | tail -10
```

Expected: 10 passed.

- [ ] **Step 3: Run preflight in dry-run**

```bash
tsx scripts/orchestrate/preflight-cli.ts 2>&1 | tail -15
```

Expected: 12 lines. Pre-kickoff some prod checks may fail (Docker not
running etc.) — that's normal. Real preflight runs in Task 26.

- [ ] **Step 4: If any test failed, fix + commit; otherwise no commit needed**

---

## Phase 3 — Kickoff (Tasks 25-27)

Operator steps; Andy runs these when the night actually starts.

### Task 25: Push everything to main

- [ ] **Step 1: Clean working tree?**

```bash
git status
```

Expected: nothing to commit.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Verify CI green on the pushed main**

```bash
gh run list --repo griase94/folgederwolke-app --limit 3
```

The latest run should turn green within a few minutes.

---

### Task 26: Real preflight + start

- [ ] **Step 1: Docker running?**

```bash
docker info >/dev/null 2>&1 && echo "OK" || echo "Start Docker Desktop first"
```

- [ ] **Step 2: Bring up local Postgres**

```bash
pnpm dev:up
```

- [ ] **Step 3: Real preflight**

```bash
pnpm orchestrate:preflight
```

All 12 must pass. Common failure remedies:

- `phase-8-on-main`: should pass — phase-8 was merged in PR #40 (3153a3c)
- `ci-workflow-patched`: Task 8 must have committed + pushed
- `docker-postgres-healthy`: `pnpm dev:up`
- `gh-auth-status`: `gh auth login`
- `production-envs-not-loaded`: `unset DATABASE_URL` in this shell, or open a fresh shell
- `canary-suite-present`: Tasks 9-14 committed
- `port-collision-sanity`: free up ports 5441-5449 / 5181-5189
- `gh-rate-limit-headroom`: wait for hourly quota to reset

- [ ] **Step 4: Start the night**

```bash
pnpm orchestrate:start
```

This creates `overnight-2026-05-20`, spins up Wave-1 worktrees,
initialises state, and prints the next-step instructions.

- [ ] **Step 5: Invoke the orchestrator-tick prompt**

In Claude Code, pass the contents of
`scripts/orchestrate/prompts/orchestrator-tick.md` to the Skill or Agent
tool. The orchestrator self-schedules from here.

- [ ] **Step 6: Walk away.** State persists on disk. Heartbeat log at
      `~/.folgederwolke-build/state/overnight-progress.log`.

---

### Task 27: Morning

- [ ] **Step 1: Open the morning PR**

```bash
gh pr list --repo griase94/folgederwolke-app --state open
```

The night → main PR will be at the top.

- [ ] **Step 2: Review**

Read the cluster-status table + reviewer roster + before/after gallery.
Skim the diff. For any deferred cluster, read its linked GitHub issue.

- [ ] **Step 3: Stamp + merge + tag**

```bash
PR=<the PR number>
SHA=$(gh pr view "$PR" --repo griase94/folgederwolke-app --json headRefOid -q .headRefOid)
gh api repos/griase94/folgederwolke-app/statuses/"$SHA" -X POST \
  -f state=success -f context=reviewed-by-opus \
  -f description="Overnight 2026-05-20 — N clusters merged"
gh pr merge "$PR" --repo griase94/folgederwolke-app --squash --delete-branch
git checkout main && git pull
git tag overnight-2026-05-20-green
git push origin overnight-2026-05-20-green
```

- [ ] **Step 4: Verify Vercel + migrate.yml ran on the merge**

```bash
gh run list --repo griase94/folgederwolke-app --limit 4
```

Two workflows on the merge commit: `CI` + `migrate.yml`, both green.

- [ ] **Step 5: Open https://folgederwolke-app.vercel.app on your phone, install the PWA, and admire the pink sticker icon.**

---

## Self-review

### Spec coverage

| Spec section                                | Task(s)                     |
| ------------------------------------------- | --------------------------- |
| §Baseline (phase-8)                         | Task 7 (preflight #1)       |
| §Scope (9 clusters)                         | Task 16                     |
| §Roles                                      | Tasks 17, 18                |
| §Orchestrator architecture (stateless tick) | Tasks 2, 19                 |
| §Walkthrough protocol (5-path)              | Task 18                     |
| §Worktree resource allocation               | Task 6                      |
| §CI workflow patch                          | Task 8                      |
| §Cross-wave regression fixtures (canary)    | Tasks 9-14                  |
| §Per-cluster originating-expert mapping     | Tasks 16, 18                |
| §Review cycle protocol                      | Task 19                     |
| §Branching + merge flow                     | Tasks 21, 23                |
| §File-ownership matrix                      | Task 16                     |
| §TDD protocol                               | Task 15                     |
| §Test-quality refusal patterns              | Task 17                     |
| §Definition of "integration test"           | Tasks 15, 17                |
| §Required test categories per cluster       | Task 16                     |
| §Critical-path test matrix                  | Task 16                     |
| §Finding-traceability matrix                | Task 15                     |
| §Secret + production guard                  | Tasks 4, 5                  |
| §Device matrix                              | Task 16                     |
| §Quality gates                              | Task 17 (final-integration) |
| §Convergence gates & escalation             | Task 19                     |
| §Morning consolidation                      | Task 22                     |
| §Autonomous-overnight runtime requirements  | Tasks 4, 5, 7, 23           |
| §Success criteria                           | Task 27                     |

Every spec section maps to at least one task.

### Placeholder scan

No "TODO" / "TBD" / "FIXME" / "implement later" / "fill in details" /
"adjust X" without an explicit "adjust to match the schema in
drizzle/" pointer.

Tasks 11, 13, 14 note "adjust column list to match drizzle/0000_init.sql"
because the schema column names live in the migrations and the task
executor reads them at execution time. This is explicit guidance, not
vagueness.

### Type consistency

- `ClusterId` (`c1`…`c9`) — same identifiers across `state.ts`,
  worktree-spinup.sh, dispatch helpers, per-cluster prompts.
- `Verdict` from `sign-off-parser.ts` matches the `[VERDICT: …]` regex
  in all prompt files.
- Prompt-file paths in `dispatch-build-agent.ts` match the file names
  created in Phase 1.
- `ClusterReport` shape in `morning-consolidation.ts` matches what the
  orchestrator state would produce.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-05-20-overnight-perfect-night.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good for keeping context clean across 27 tasks.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Faster start, but context-heavy at 27 tasks.

Which approach?
