/**
 * Email canonicalization (per ADR-0009 + §7.5).
 *
 * For magic-link allowlist matching and dedup ONLY — never use as a display
 * value. The canonical form lowercases the local-part and strips Gmail's
 * dot-tricks + "+suffix" addressing. For non-Gmail addresses, only the
 * domain is lowercased (RFC 5321 §2.3.11 — local part is case-sensitive,
 * but virtually all providers treat it case-insensitively).
 *
 * Auth-integration (next agent) imports `canonicalizeEmail` to match the
 * `ADMIN_EMAILS` allowlist.
 */

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function canonicalizeEmail(email: string): string {
  const trimmed = email.trim();
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx <= 0 || atIdx === trimmed.length - 1) {
    return trimmed.toLowerCase();
  }
  let local = trimmed.slice(0, atIdx).toLowerCase();
  let domain = trimmed.slice(atIdx + 1).toLowerCase();

  // Strip "+suffix" tag (works for Gmail, FastMail, ProtonMail, Outlook ...)
  const plusIdx = local.indexOf("+");
  if (plusIdx >= 0) {
    local = local.slice(0, plusIdx);
  }

  // Gmail-specific: dots in local part are insignificant.
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    // Normalize googlemail.com -> gmail.com so duplicates collapse.
    domain = "gmail.com";
  }

  return `${local}@${domain}`;
}
