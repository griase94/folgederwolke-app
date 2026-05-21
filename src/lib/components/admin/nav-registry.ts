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
 * The sidebar's "main" group lists 6 first-class destinations:
 *   Übersicht, Belegprüfung, Projekte, Transaktionen, Mitglieder,
 *   Jahresabschluss.
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
  /** Display label shown in sidebar / tab bar */
  label: string;
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
  {
    label: "Transaktionen",
    href: "/app/transactions",
    icon: "CreditCard",
    mobileTab: 3,
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
