/**
 * nav-registry.ts — single source of truth for admin navigation (§4.1.1 #3).
 *
 * Consumed by:
 *  - AdminShell / Sidebar (desktop)
 *  - MobileTabBar (mobile bottom tabs)
 *
 * Adding a new admin route: add one entry here, nothing else to edit.
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
  // ── Main group ────────────────────────────────────────────────────────────
  {
    label: "Heute",
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
    group: "main",
  },
  {
    label: "Rechnungen",
    href: "/app/rechnungen",
    icon: "FileText",
    group: "main",
  },
  {
    label: "Projekte",
    href: "/app/projekte",
    icon: "FolderOpen",
    group: "main",
  },
  {
    label: "Kunden",
    href: "/app/kunden",
    icon: "Building2",
    group: "main",
  },
  {
    label: "Jahresabschluss",
    href: "/app/jahresabschluss",
    icon: "BookOpen",
    group: "main",
  },
  {
    label: "Einstellungen",
    href: "/app/einstellungen",
    icon: "Settings",
    group: "main",
  },
  // ── More group ────────────────────────────────────────────────────────────
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
