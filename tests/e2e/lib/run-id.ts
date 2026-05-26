export function getRunId(): string {
  return process.env.E2E_RUN_ID || "local";
}

export function nsEmail(slot: string): string {
  return `e2e+${getRunId()}+${slot}@folgederwolke.de`;
}

export function nsLabel(label: string): string {
  return `e2e-${getRunId()}-${label}`;
}
