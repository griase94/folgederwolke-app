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
