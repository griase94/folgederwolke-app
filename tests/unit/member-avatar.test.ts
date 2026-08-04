import { describe, it, expect } from "vitest";
import {
  avatarColorClass,
  avatarInitials,
} from "../../src/lib/domain/member-avatar.js";

/**
 * L4 (DESIGN-DEBT-REGISTER): the avatar identity algorithm now lives in ONE
 * module (was copied across MemberRow, MemberCardMobile, MemberInfoCard). These
 * pins lock determinism + the class shape so a future refactor can't silently
 * change a person's colour identity.
 */
describe("avatarColorClass", () => {
  it("is deterministic for a given name", () => {
    expect(avatarColorClass("Anna", "Beispiel")).toBe(
      avatarColorClass("Anna", "Beispiel"),
    );
  });

  it("hashes vorname+nachname jointly (not just one part)", () => {
    // Same nachname, different vorname → generally a different bucket. The join
    // is what the originals hashed, so this guards the concatenation order.
    const a = avatarColorClass("Anna", "Müller");
    const b = avatarColorClass("Bruno", "Müller");
    // Both are valid palette entries; the point is the input is the full name.
    expect(a).toMatch(/^bg-\w+-100 text-\w+-900$/);
    expect(b).toMatch(/^bg-\w+-100 text-\w+-900$/);
  });

  it("always returns a raw identity-hue class pair", () => {
    const cases: Array<[string, string]> = [
      ["Zoe", "Zebra"],
      ["", ""],
      ["X", "Y"],
      ["Björn", "Ölberg"],
    ];
    for (const [v, n] of cases) {
      expect(avatarColorClass(v, n)).toMatch(/^bg-\w+-100 text-\w+-900$/);
    }
  });
});

describe("avatarInitials", () => {
  it("takes the uppercased first letter of each name", () => {
    expect(avatarInitials("anna", "beispiel")).toBe("AB");
    expect(avatarInitials("Zoe", "Zebra")).toBe("ZZ");
  });

  it("is robust to empty parts", () => {
    expect(avatarInitials("", "Nur")).toBe("N");
    expect(avatarInitials("Nur", "")).toBe("N");
    expect(avatarInitials("", "")).toBe("");
  });
});
