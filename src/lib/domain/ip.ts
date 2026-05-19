/**
 * IP-address truncation for audit logging.
 *
 * DSGVO Art. 5 (data minimisation): storing a full IP is more than we need to
 * answer "did this account log in from a different network?" — a /24 prefix
 * (or /48 for IPv6) is sufficient and removes the personal-data exposure.
 *
 * The 2026-05-19 DSGVO review (CRIT-06) and security review (HIGH-2) caught
 * `meta.ip` being persisted verbatim across the auth flow.
 */

/**
 * Returns a coarse network prefix for the given IP. Returns "unknown" when
 * the input can't be classified — never throws, never leaks more than asked.
 *
 *  - IPv4 `203.0.113.42` → `203.0.113.0/24`
 *  - IPv6 `2001:db8:1234:5678:...` → `2001:db8:1234::/48`
 */
export function ipToPrefix(rawIp: string | null | undefined): string {
  if (!rawIp) return "unknown";
  const ip = rawIp.trim();
  if (!ip) return "unknown";

  // IPv6: keep the first three groups (48 bits) then zero the rest.
  if (ip.includes(":")) {
    const groups = ip.split(":");
    // "::" expansion / IPv4-mapped IPv6 — fall back to the raw first 3 groups
    const head = groups.slice(0, 3).filter((g) => g.length > 0);
    if (head.length === 0) return "unknown";
    return `${head.join(":")}::/48`;
  }

  // IPv4: keep three octets.
  const parts = ip.split(".");
  if (parts.length !== 4) return "unknown";
  const [a, b, c] = parts;
  if (!a || !b || !c) return "unknown";
  return `${a}.${b}.${c}.0/24`;
}
