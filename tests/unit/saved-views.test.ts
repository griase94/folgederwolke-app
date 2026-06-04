// tests/unit/saved-views.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  listViews,
  saveView,
  renameView,
  deleteView,
  BUILTIN_PRESETS,
} from "$lib/client/saved-views.js";

beforeEach(() => localStorage.clear());
describe("saved views", () => {
  it("includes built-in presets for the tab", () => {
    const v = listViews("ausgaben");
    expect(v.some((x) => x.id === BUILTIN_PRESETS.ausgaben[0].id)).toBe(true);
  });
  it("save → rename → delete a custom view round-trips", () => {
    saveView("ausgaben", { name: "Meine", query: "status=offen" });
    let mine = listViews("ausgaben").find((x) => x.name === "Meine");
    expect(mine).toBeTruthy();
    renameView("ausgaben", mine!.id, "Umbenannt");
    expect(listViews("ausgaben").find((x) => x.id === mine!.id)!.name).toBe(
      "Umbenannt",
    );
    deleteView("ausgaben", mine!.id);
    expect(
      listViews("ausgaben").find((x) => x.id === mine!.id),
    ).toBeUndefined();
  });
  it("cannot delete a built-in preset", () => {
    const preset = BUILTIN_PRESETS.ausgaben[0];
    deleteView("ausgaben", preset.id);
    expect(listViews("ausgaben").some((x) => x.id === preset.id)).toBe(true);
  });
});
