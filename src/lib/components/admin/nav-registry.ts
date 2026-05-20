/**
 * nav-registry.ts — single source of truth for admin navigation (§4.1.1 #3).
 *
 * Consumed by:
 *  - AdminShell / Sidebar (desktop)
 *  - MobileTabBar (mobile bottom tabs)
 *
 * Adding a new admin route: add one entry here, nothing else to edit.
 *
 * ── Sidebar diet (C9, UX-001) ───────────────────────────────────────────────
 * The sidebar's "main" group is intentionally trimmed to **5 entries** — the
 * ones a Kassenwartin reaches multiple times per session: Übersicht, Audit
 * Inbox, Transaktionen, Mitglieder, Rechnungen. Everything else (Projekte,
 * Kunden, Jahresabschluss, Einstellungen, DSGVO, Dev/Mails) lives in the
 * collapsible "Mehr" section. The legacy `/app/sheet-resync` importer is
 * intentionally NOT in the registry — it remains reachable by URL for
 * one-time admin tasks but isn't a navigation target.
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
  // ── Main group (5 entries — see "Sidebar diet" note above) ────────────────
  {
    label: "Übersicht",
    href: "/app",
    icon: "CheckSquare",
    mobileTab: 1,
    group: "main",
  },
  {
    label: "Audit Inbox",
    href: "/app/inbox",
    icon: "Inbox",
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
    mobileTab: 4,
    group: "main",
  },
  {
    label: "Rechnungen",
    href: "/app/rechnungen",
    icon: "FileText",
    group: "main",
  },
  // ── More group ────────────────────────────────────────────────────────────
  {
    label: "Projekte",
    href: "/app/projekte",
    icon: "FolderOpen",
    group: "more",
  },
  {
    label: "Kunden",
    href: "/app/kunden",
    icon: "Building2",
    group: "more",
  },
  {
    label: "Jahresabschluss",
    href: "/app/jahresabschluss",
    icon: "BookOpen",
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
  {
    label: "Dev / Mails",
    href: "/app/dev/mails",
    icon: "Mail",
    group: "more",
  },
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
