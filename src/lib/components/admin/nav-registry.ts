/**
 * nav-registry.ts — single source of truth for DESKTOP admin navigation
 * (Aurora spec §5 "Desktop sidebar", IA revised by spec §1).
 *
 * Consumed by AdminShell / Sidebar only. The mobile five-cell bar
 * (Übersicht · Transaktionen · ⊕ · Prüfung · Mehr) is SPEC-FIXED and
 * hardcoded in MobileTabBar.svelte; the Mehr-sheet tile grid likewise in
 * MehrSheet.svelte.
 *
 * Adding a desktop route: add one entry here, nothing else to edit.
 *
 * IA notes (spec §1):
 * - 'Prüfung' is THE label for /app/inbox on both devices — never two
 *   names for one destination (spec §5).
 * - Transaktionen is a first-class destination with the three type lists as
 *   indented children. The unified feed used to be reachable on desktop only
 *   by typing the URL, while its three arms sat as flat siblings — the sidebar
 *   said nothing about how they relate. The children are ALWAYS visible: a
 *   disclosure would hide three of the most-used destinations behind a click.
 * - Rechnungen is promoted out of "Mehr": billing is routine work, not a
 *   settings-adjacent afterthought.
 * - Dateien (/app/files) joins "Mehr". The route existed but the only link to
 *   it was one prose sentence in the Jahresabschluss — an orphan.
 * - The legacy /app/sheet-resync importer stays URL-reachable but hidden.
 */

export interface NavChild {
  /** Display label. */
  label: string;
  /** Route href. */
  href: string;
}

export interface NavItem {
  /** Display label (desktop sidebar). */
  label: string;
  /** Route href. */
  href: string;
  /** Icon key — components map it to an inline SVG path. */
  icon: string;
  /**
   * Sidebar group: "main" (always visible) | "more" (collapsible group,
   * expanded state persisted by the Sidebar).
   */
  group: "main" | "more";
  /**
   * Indented sub-destinations, rendered open at all times. They are NOT URL
   * descendants of the parent, so the parent's pill must not follow them —
   * see {@link navItemIsActive}.
   */
  children?: NavChild[];
}

export const navItems: NavItem[] = [
  // ── Main group (spec §1 order) ────────────────────────────────────────
  { label: "Übersicht", href: "/app", icon: "LayoutDashboard", group: "main" },
  { label: "Prüfung", href: "/app/inbox", icon: "Inbox", group: "main" },
  {
    label: "Transaktionen",
    href: "/app/transaktionen",
    icon: "ArrowLeftRight",
    group: "main",
    children: [
      { label: "Einnahmen", href: "/app/einnahmen" },
      { label: "Ausgaben", href: "/app/ausgaben" },
      { label: "Spenden", href: "/app/spenden" },
    ],
  },
  {
    label: "Mitglieder",
    href: "/app/mitglieder",
    icon: "Users",
    group: "main",
  },
  {
    label: "Projekte",
    href: "/app/projekte",
    icon: "FolderOpen",
    group: "main",
  },
  {
    label: "Rechnungen",
    href: "/app/rechnungen",
    icon: "FileText",
    group: "main",
  },
  {
    label: "Jahresabschluss",
    href: "/app/jahresabschluss",
    icon: "BookOpen",
    group: "main",
  },
  // ── "Mehr" group ──────────────────────────────────────────────────────
  { label: "Kunden", href: "/app/kunden", icon: "Building2", group: "more" },
  { label: "Dateien", href: "/app/files", icon: "Files", group: "more" },
  {
    label: "Einstellungen",
    href: "/app/einstellungen",
    icon: "Settings",
    group: "more",
  },
  { label: "DSGVO", href: "/app/dsgvo", icon: "Shield", group: "more" },
];

/** Items for the main sidebar section. */
export const mainNavItems = navItems.filter((item) => item.group === "main");

/** Items for the collapsible "Mehr" sidebar section. */
export const moreNavItems = navItems.filter((item) => item.group === "more");

/** True when `path` is `href` or one of its route descendants. */
export function hrefIsActive(href: string, path: string): boolean {
  if (href === "/app") return path === "/app";
  return path === href || path.startsWith(href + "/");
}

/**
 * Active state of a top-level entry.
 *
 * A parent lights up for its OWN route only. Its children are separate
 * destinations, so letting the parent follow them would put two pills in the
 * sidebar at once and leave the reader guessing which one they are on
 * (spec §1: "Kind aktiv ⇒ Eltern OHNE zweite Pille").
 */
export function navItemIsActive(item: NavItem, path: string): boolean {
  return hrefIsActive(item.href, path);
}

/**
 * Active state of a top-level entry when its children are NOT on screen — the
 * 64px tablet rail, where the tree is flattened.
 *
 * There the parent icon is the group's only representative, so it must light up
 * for its children too; otherwise standing on /app/einnahmen leaves the whole
 * rail dark and the app looks lost. This is the same stand-in rule the mobile
 * Transaktionen cell uses.
 */
export function navItemRepresents(item: NavItem, path: string): boolean {
  return (
    hrefIsActive(item.href, path) ||
    (item.children ?? []).some((c) => hrefIsActive(c.href, path))
  );
}

/**
 * Mobile "Transaktionen" cell active-predicate (spec §5 active-state
 * rules): spans the unified feed + the three flat transaction routes
 * (+ their details) — the single mobile cell stands in for all of them.
 */
export function mobileTransaktionenActive(path: string): boolean {
  return [
    "/app/transaktionen",
    "/app/ausgaben",
    "/app/einnahmen",
    "/app/spenden",
  ].some((h) => path === h || path.startsWith(h + "/"));
}
