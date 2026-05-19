/**
 * @phase-7.5
 *
 * Unit tests for ipToPrefix() — the helper that downscales raw IPs to a
 * coarse network prefix before they enter audit_log. DSGVO review CRIT-06
 * + security review HIGH-2 (2026-05-19) flagged four call sites in
 * auth/index.ts that were storing the full IP into actor_ip_prefix.
 */

import { describe, expect, it } from "vitest";
import { ipToPrefix } from "$lib/domain/ip.js";

describe("ipToPrefix", () => {
  it.each([
    ["203.0.113.42", "203.0.113.0/24"],
    ["10.0.0.1", "10.0.0.0/24"],
    ["127.0.0.1", "127.0.0.0/24"],
    ["8.8.8.8", "8.8.8.0/24"],
  ])("IPv4 %s → %s", (input, expected) => {
    expect(ipToPrefix(input)).toBe(expected);
  });

  it.each([
    ["2001:db8:1234:5678::1", "2001:db8:1234::/48"],
    ["2a01:4f8:abcd:1234:5678:9abc:def0:1234", "2a01:4f8:abcd::/48"],
  ])("IPv6 %s → %s", (input, expected) => {
    expect(ipToPrefix(input)).toBe(expected);
  });

  it.each([
    [null, "unknown"],
    [undefined, "unknown"],
    ["", "unknown"],
    ["   ", "unknown"],
    ["not.an.ip", "unknown"],
    ["1.2.3", "unknown"], // 3 octets only
    [":::", "unknown"],
  ])("invalid input %p → 'unknown'", (input, expected) => {
    expect(ipToPrefix(input as string | null)).toBe(expected);
  });

  it("trims whitespace before classifying", () => {
    expect(ipToPrefix("  203.0.113.42  ")).toBe("203.0.113.0/24");
  });

  it("does NOT leak the host octet (regression: full IP would end in .42)", () => {
    expect(ipToPrefix("203.0.113.42")).not.toContain(".42");
    expect(ipToPrefix("203.0.113.42")).not.toContain(".42/");
  });

  it("does NOT leak host octets for IPv6 either", () => {
    expect(ipToPrefix("2001:db8:1234:5678::1")).not.toContain("5678");
    expect(ipToPrefix("2001:db8:1234:5678::1")).not.toContain("::1");
  });
});
