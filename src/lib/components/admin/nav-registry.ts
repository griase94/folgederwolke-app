/**
 * nav-registry.ts — single source of truth for admin navigation (§4.1.1 #3).
 *
 * Consumed by:
 *  - AdminShell / Sidebar (desktop)
 *  - MobileTabBar (mobile bottom tabs)
 *
 * Adding a new admin route: add one entry here, nothing else to edit.
 *
 * ── IA shift (Zone-A, 2026-05-21) ───────────────────────────────────────────
 * The sidebar's "main" group lists first-class destinations:
 *   Übersicht, Belegprüfung, Projekte, Ausgaben, Einnahmen, Spenden,
 *   Mitglieder, Jahresabschluss.
 *
 * (Phase 3) "Transaktionen" split into three flat desktop entries —
 * Ausgaben / Einnahmen / Spenden. The mobile bottom tab bar still shows a
 * single "Transaktionen" cell: the Ausgaben entry carries mobileLabel
 * "Transaktionen" and its active-state spans all three routes.
 *
 * - "Belegprüfung" replaces the legacy "Audit Inbox" label (the underlying
 *   route is still /app/inbox).
 * - "Projekte" is promoted from "more" → main (Kassenwartin reaches it
 *   multiple times per session).
 * - "Jahresabschluss" is promoted from "more" → main (Julia + Vorstand
 *   reviews both flagged daily-need).
 * - "Rechnungen" and "Kunden" demote to "more" — they are reached only
 *   from project / customer detail pages once IA shift is in effect.
 *
 * Mobile bottom tab bar shows mobileTab !== undefined entries — currently
 * Übersicht / Projekte / Transaktionen / Belegprüfung — plus a "Mehr"
 * trigger that opens MoreSheet for the remaining destinations.
 *
 * The legacy `/app/sheet-resync` importer is intentionally NOT in this
 * registry: it remains reachable by URL for one-time admin tasks but is
 * hidden from sidebar + mobile tab bar. Andy confirmed migration done on
 * 2026-05-21.
 */

export interface NavItem {
  /** Display label shown in the desktop sidebar / tab bar */
  label: string;
  /**
   * Optional override for the mobile bottom tab bar cell label.
   * When set, the mobile tab renders this instead of `label`.
   * Used so the Ausgaben sidebar entry collapses to a single
   * "Transaktionen" cell on mobile while the desktop sidebar keeps
   * the three distinct labels (Ausgaben / Einnahmen / Spenden).
   */
  mobileLabel?: string;
  /** Route href */
  href: string;
  /** Lucide icon name (string key) — components import by name */
  icon: string;
  /**
   * If set, this item appears in the mobile bottom tab bar.
   * Lower number = further left.
   */
  mobileTab?: number;
  /**
   * Visual group in the sidebar.
   * "main"  — primary nav (always visible)
   * "more"  — collapsible "Mehr" section at bottom
   */
  group: "main" | "more";
}

export const navItems: NavItem[] = [
  // ── Main group (6 entries — IA shift Zone-A 2026-05-21) ──────────────────
  {
    label: "Übersicht",
    href: "/app",
    icon: "CheckSquare",
    mobileTab: 1,
    group: "main",
  },
  {
    // Renamed Audit Inbox → Belegprüfung (auslagen-tester report finding)
    label: "Belegprüfung",
    href: "/app/inbox",
    icon: "Inbox",
    mobileTab: 4,
    group: "main",
  },
  {
    // Promoted to main (Projekte first-class IA shift)
    label: "Projekte",
    href: "/app/projekte",
    icon: "FolderOpen",
    mobileTab: 2,
    group: "main",
  },
  // ── Transactions: three flat desktop tabs (Phase 3) ─────────────────────
  // Ausgaben carries the single mobile "Transaktionen" entry (mobileTab: 3);
  // its active state on the mobile bar spans all three routes via
  // mobileTransaktionenActive(). Einnahmen + Spenden have no mobileTab.
  {
    // Desktop sidebar shows "Ausgaben"; the single mobile tab cell collapses
    // the three transaction routes under "Transaktionen" via mobileLabel.
    label: "Ausgaben",
    mobileLabel: "Transaktionen",
    href: "/app/ausgaben",
    icon: "MinusCircle",
    mobileTab: 3,
    group: "main",
  },
  {
    label: "Einnahmen",
    href: "/app/einnahmen",
    icon: "PlusCircle",
    group: "main",
  },
  {
    label: "Spenden",
    href: "/app/spenden",
    icon: "Gift",
    group: "main",
  },
  {
    label: "Mitglieder",
    href: "/app/mitglieder",
    icon: "Users",
    group: "main",
  },
  {
    // Promoted to main (julia + vorstand both flagged need)
    label: "Jahresabschluss",
    href: "/app/jahresabschluss",
    icon: "BookOpen",
    group: "main",
  },
  // ── More group ───────────────────────────────────────────────────────────
  {
    label: "Rechnungen",
    href: "/app/rechnungen",
    icon: "FileText",
    group: "more",
  },
  {
    label: "Kunden",
    href: "/app/kunden",
    icon: "Building2",
    group: "more",
  },
  {
    label: "Einstellungen",
    href: "/app/einstellungen",
    icon: "Settings",
    group: "more",
  },
  {
    label: "DSGVO",
    href: "/app/dsgvo",
    icon: "Shield",
    group: "more",
  },
  // "Dev / Mails" removed: route /app/dev/mails was never implemented and
  // surfaced as a 404 in production. Re-add (gated on dev env) if/when the
  // dev mailbox preview lands.
];

/** Items that appear in the mobile tab bar, sorted by mobileTab index. */
export const mobileTabItems = navItems
  .filter(
    (item): item is NavItem & { mobileTab: number } =>
      item.mobileTab !== undefined,
  )
  .sort((a, b) => a.mobileTab - b.mobileTab);

/** Items for the main sidebar section. */
export const mainNavItems = navItems.filter((item) => item.group === "main");

/** Items for the collapsible "Mehr" sidebar section. */
export const moreNavItems = navItems.filter((item) => item.group === "more");

/**
 * Mobile "Transaktionen" tab active-predicate.
 *
 * The single mobile entry (`/app/ausgaben`) stands in for all three flat
 * transaction routes, so the bottom-bar cell must light up on any of them
 * (and their detail routes) — not just `startsWith(item.href)`.
 */
export function mobileTransaktionenActive(path: string): boolean {
  return ["/app/ausgaben", "/app/einnahmen", "/app/spenden"].some(
    (h) => path === h || path.startsWith(h + "/"),
  );
}
