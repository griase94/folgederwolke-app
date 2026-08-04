/**
 * Member avatar identity — deterministic colour + initials from a name.
 *
 * L4 (DESIGN-DEBT-REGISTER): the hash → palette → initials algorithm was copied
 * word-for-word across MemberRow, MemberCardMobile AND MemberInfoCard (the
 * register named the first two; the detail hero was a third copy). A person's
 * colour identity lived in three places that could silently drift. This module
 * is the single source; `MemberAvatar.svelte` renders it.
 *
 * The palette is a raw identity-hue set, NOT a status context — so raw Tailwind
 * palettes are permitted here (DESIGN-GUIDELINES §0.5 scopes the raw-palette ban
 * to status/confirm surfaces). The avatar circle is always aria-hidden.
 *
 * The algorithm (imul-31 hash of `vorname + nachname`, mod palette length) is
 * preserved byte-for-byte from the originals so no existing member's colour
 * changes on adoption.
 */

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-900",
  "bg-pink-100 text-pink-900",
  "bg-fuchsia-100 text-fuchsia-900",
  "bg-purple-100 text-purple-900",
  "bg-violet-100 text-violet-900",
  "bg-indigo-100 text-indigo-900",
  "bg-sky-100 text-sky-900",
  "bg-teal-100 text-teal-900",
  "bg-emerald-100 text-emerald-900",
  "bg-amber-100 text-amber-900",
] as const;

function nameHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic `bg-* text-*` identity colour for a member's full name. */
export function avatarColorClass(vorname: string, nachname: string): string {
  const name = vorname + nachname;
  return (
    AVATAR_COLORS[nameHash(name) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]
  );
}

/** Two-letter uppercase initials (first of Vor- + Nachname). */
export function avatarInitials(vorname: string, nachname: string): string {
  return ((vorname.charAt(0) ?? "") + (nachname.charAt(0) ?? "")).toUpperCase();
}
