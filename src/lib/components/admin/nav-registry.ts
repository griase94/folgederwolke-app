/**
 * nav-registry.ts — single source of truth for DESKTOP admin navigation
 * (Aurora spec §5 "Desktop sidebar").
 *
 * Consumed by AdminShell / Sidebar only. The mobile five-cell bar
 * (Übersicht · Transaktionen · ⊕ · Prüfung · Mehr) is SPEC-FIXED and
 * hardcoded in MobileTabBar.svelte; the Mehr-sheet tile grid likewise in
 * MehrSheet.svelte — the marble-era mobileTab/mobileLabel/MoreSheet wiring
 * is gone (Aurora slice 2, 2026-06).
 *
 * Adding a desktop route: add one entry here, nothing else to edit.
 *
 * - 'Prüfung' is THE label for /app/inbox on both devices — never two
 *   names for one destination (spec §5). Replaces 'Belegprüfung'.
 * - The three-page transaction split stays first-class on desktop:
 *   Ausgaben / Einnahmen / Spenden (spec §8).
 * - The legacy /app/sheet-resync importer stays URL-reachable but hidden.
 */

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
}

export const navItems: NavItem[] = [
  // ── Main group (spec §5 order) ────────────────────────────────────────
  { label: "Übersicht", href: "/app", icon: "LayoutDashboard", group: "main" },
  { label: "Prüfung", href: "/app/inbox", icon: "Inbox", group: "main" },
  {
    label: "Projekte",
    href: "/app/projekte",
    icon: "FolderOpen",
    group: "main",
  },
  {
    label: "Ausgaben",
    href: "/app/ausgaben",
    icon: "MinusCircle",
    group: "main",
  },
  {
    label: "Einnahmen",
    href: "/app/einnahmen",
    icon: "PlusCircle",
    group: "main",
  },
  { label: "Spenden", href: "/app/spenden", icon: "Gift", group: "main" },
  {
    label: "Mitglieder",
    href: "/app/mitglieder",
    icon: "Users",
    group: "main",
  },
  {
    label: "Jahresabschluss",
    href: "/app/jahresabschluss",
    icon: "BookOpen",
    group: "main",
  },
  // ── "Mehr" group ──────────────────────────────────────────────────────
  {
    label: "Rechnungen",
    href: "/app/rechnungen",
    icon: "FileText",
    group: "more",
  },
  { label: "Kunden", href: "/app/kunden", icon: "Building2", group: "more" },
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

/**
 * Mobile "Transaktionen" cell active-predicate (spec §5 active-state
 * rules): the single mobile cell stands in for all three flat transaction
 * routes (+ their details), so it must light up on any of them. Slice 5
 * adds /app/transaktionen to the cell href; this predicate then ALSO gains
 * that route (one line, slice-5 scope).
 */
export function mobileTransaktionenActive(path: string): boolean {
  return ["/app/ausgaben", "/app/einnahmen", "/app/spenden"].some(
    (h) => path === h || path.startsWith(h + "/"),
  );
}
