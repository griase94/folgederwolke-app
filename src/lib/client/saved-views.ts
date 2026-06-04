/**
 * saved-views.ts — per-tab saved filter views (localStorage-backed).
 *
 * Each saved view stores a name and a serialized filter query string
 * (URLSearchParams format, from serializeFilterState). Built-in presets are
 * defined as code with `id` prefix `builtin:` — they are always present and
 * cannot be deleted. Custom views use a `custom:` id prefix and are stored
 * in localStorage under a per-tab namespaced key.
 *
 * All localStorage access is wrapped in try/catch per pwa-entry.ts convention
 * (Safari private mode / locked-down webviews throw on localStorage).
 *
 * No `getFullYear()` usage — ADR-0001 compliant.
 */

import type { TabKey } from "$lib/domain/transaction-filters.js";

export interface SavedView {
  id: string;
  name: string;
  /** Serialized filter string (URLSearchParams format). */
  query: string;
  readonly?: boolean;
}

// ── Built-in presets ──────────────────────────────────────────────────────────

export const BUILTIN_PRESETS: Record<TabKey, SavedView[]> = {
  ausgaben: [
    {
      id: "builtin:ausgaben-offen-zu-erstatten",
      name: "Offen zu erstatten",
      query: "status=offen%2Cgeprueft",
      readonly: true,
    },
  ],
  einnahmen: [],
  spenden: [
    {
      id: "builtin:spenden-ohne-bescheinigung",
      name: "Ohne Bescheinigung",
      query: "bescheinigung=ausstehend",
      readonly: true,
    },
  ],
};

// ── Storage helpers ───────────────────────────────────────────────────────────

function storageKey(tab: TabKey): string {
  return `fdw:tx-views:${tab}`;
}

function loadCustomViews(tab: TabKey): SavedView[] {
  try {
    const raw = localStorage.getItem(storageKey(tab));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        typeof v === "object" &&
        v !== null &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        typeof v.query === "string",
    );
  } catch {
    return [];
  }
}

function saveCustomViews(tab: TabKey, views: SavedView[]): void {
  try {
    localStorage.setItem(storageKey(tab), JSON.stringify(views));
  } catch {
    // Storage unavailable (private mode / locked-down webview) — ignore.
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns built-in presets followed by all user-saved custom views for `tab`.
 */
export function listViews(tab: TabKey): SavedView[] {
  return [...BUILTIN_PRESETS[tab], ...loadCustomViews(tab)];
}

/**
 * Saves a new custom view for `tab`. Generates a unique `custom:` id.
 */
export function saveView(
  tab: TabKey,
  view: { name: string; query: string },
): SavedView {
  const custom = loadCustomViews(tab);
  const id = `custom:${tab}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const newView: SavedView = { id, name: view.name, query: view.query };
  custom.push(newView);
  saveCustomViews(tab, custom);
  return newView;
}

/**
 * Renames a custom view by id. No-op if id is not found or is a builtin.
 */
export function renameView(tab: TabKey, id: string, newName: string): void {
  if (id.startsWith("builtin:")) return;
  const custom = loadCustomViews(tab);
  const view = custom.find((v) => v.id === id);
  if (!view) return;
  view.name = newName;
  saveCustomViews(tab, custom);
}

/**
 * Overwrites the query of an existing custom view. No-op for builtins.
 */
export function overwriteView(tab: TabKey, id: string, query: string): void {
  if (id.startsWith("builtin:")) return;
  const custom = loadCustomViews(tab);
  const view = custom.find((v) => v.id === id);
  if (!view) return;
  view.query = query;
  saveCustomViews(tab, custom);
}

/**
 * Deletes a custom view by id. Built-in presets are silently ignored.
 */
export function deleteView(tab: TabKey, id: string): void {
  if (id.startsWith("builtin:")) return;
  const custom = loadCustomViews(tab).filter((v) => v.id !== id);
  saveCustomViews(tab, custom);
}
