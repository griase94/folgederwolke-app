type Rule = { pattern: RegExp; replace: string };

const RULES: Rule[] = [
  { pattern: /Bearer\s+[A-Za-z0-9_-]{6,}/g, replace: "Bearer [REDACTED]" },
  { pattern: /\bDE\d{20}\b/g, replace: "[REDACTED-IBAN]" },
  { pattern: /\bage1[a-z0-9]{10,}/g, replace: "[REDACTED-AGE]" },
  { pattern: /\bya29\.[A-Za-z0-9_-]{10,}/g, replace: "[REDACTED-OAUTH]" },
  { pattern: /\bglpat-[A-Za-z0-9_-]{8,}/g, replace: "[REDACTED-PAT]" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{10,}/g, replace: "[REDACTED-PAT]" },
  {
    pattern: /[a-zA-Z0-9_-]+\.(eu-|us-|ap-)?[a-z0-9-]+\.aws\.neon\.tech/g,
    replace: "[REDACTED-NEON]",
  },
];

export function redact(line: string): string {
  let out = line;
  for (const r of RULES) out = out.replace(r.pattern, r.replace);
  return out;
}
