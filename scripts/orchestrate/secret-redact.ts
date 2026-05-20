type Rule = { pattern: RegExp; replace: string | ((m: string) => string) };

// Order matters: more specific patterns first.
const RULES: Rule[] = [
  // Full Neon URL (with embedded credentials) — redact the whole thing.
  // Matches scheme://anything@host.aws.neon.tech/path-or-port.
  {
    pattern:
      /[a-z]+:\/\/[^/\s]+@[a-zA-Z0-9_.-]+\.aws\.neon\.tech[a-zA-Z0-9_/:?=&.-]*/g,
    replace: "[REDACTED-NEON-URL]",
  },
  // Any postgres:// or postgresql:// URL with embedded user:password — strip
  // creds but keep the host visible so logs still tell us which DB.
  {
    pattern:
      /(postgres(?:ql)?:\/\/)[^@\s/:]+:[^@\s/]+@([a-zA-Z0-9_.-]+(?::\d+)?)/g,
    replace: "$1[REDACTED-DB-CREDS]@$2",
  },
  // Bearer tokens — allow dots (JWT segments), dashes, underscores, base64-ish.
  { pattern: /Bearer\s+[A-Za-z0-9_.\-]{6,}/g, replace: "Bearer [REDACTED]" },
  { pattern: /\bDE\d{20}\b/g, replace: "[REDACTED-IBAN]" },
  { pattern: /\bage1[a-z0-9]{10,}/g, replace: "[REDACTED-AGE]" },
  // ya29 OAuth tokens — allow dots in the payload/signature.
  {
    pattern: /\bya29\.[A-Za-z0-9_.\-]{10,}/g,
    replace: "[REDACTED-OAUTH]",
  },
  { pattern: /\bglpat-[A-Za-z0-9_-]{8,}/g, replace: "[REDACTED-PAT]" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{10,}/g, replace: "[REDACTED-PAT]" },
  // Fallback bare-Neon host (no scheme) — keep for back-compat with the
  // existing test that asserts [REDACTED-NEON] presence.
  {
    pattern: /[a-zA-Z0-9_-]+\.(eu-|us-|ap-)?[a-z0-9-]+\.aws\.neon\.tech/g,
    replace: "[REDACTED-NEON]",
  },
];

export function redact(line: string): string {
  let out = line;
  for (const r of RULES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out = out.replace(r.pattern, r.replace as any);
  }
  return out;
}
