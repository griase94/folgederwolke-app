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
