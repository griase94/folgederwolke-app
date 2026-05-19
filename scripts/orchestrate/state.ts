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
