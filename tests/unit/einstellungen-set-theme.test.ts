// @vitest-environment node
/**
 * Aurora slice 1 — ?/setTheme action (spec §3 persistence).
 * The action must validate against the theme registry (reject anything not
 * registered — the cookie value later lands in an HTML attribute) and set
 * the fdw_theme cookie site-wide.
 */
import { describe, expect, it } from "vitest";
import { actions } from "../../src/routes/app/einstellungen/+page.server.js";
import { THEME_COOKIE } from "../../src/lib/themes/index.js";

type SetCall = { name: string; value: string; opts: Record<string, unknown> };

function makeEvent(theme: string) {
  const sets: SetCall[] = [];
  const event = {
    request: new Request("http://localhost/app/einstellungen?/setTheme", {
      method: "POST",
      body: new URLSearchParams({ theme }),
    }),
    cookies: {
      set: (name: string, value: string, opts: Record<string, unknown>) => {
        sets.push({ name, value, opts });
      },
    },
  } as unknown as Parameters<(typeof actions)["setTheme"]>[0];
  return { event, sets };
}

describe("einstellungen ?/setTheme action", () => {
  it("sets the fdw_theme cookie for a registered theme id", async () => {
    const { event, sets } = makeEvent("aurora");
    const result = await actions.setTheme(event);
    expect(result).toEqual({ action: "setTheme", success: true });
    expect(sets).toHaveLength(1);
    expect(sets[0]!.name).toBe(THEME_COOKIE);
    expect(sets[0]!.value).toBe("aurora");
    expect(sets[0]!.opts["path"]).toBe("/");
  });

  it("rejects an unregistered theme id with 422 and sets no cookie", async () => {
    const { event, sets } = makeEvent('"><script>alert(1)</script>');
    const result = await actions.setTheme(event);
    expect(result).toMatchObject({ status: 422 });
    expect(sets).toHaveLength(0);
  });

  it("rejects a missing theme field with 422", async () => {
    const sets: SetCall[] = [];
    const event = {
      request: new Request("http://localhost/app/einstellungen?/setTheme", {
        method: "POST",
        body: new URLSearchParams({}),
      }),
      cookies: {
        set: (name: string, value: string, opts: Record<string, unknown>) => {
          sets.push({ name, value, opts });
        },
      },
    } as unknown as Parameters<(typeof actions)["setTheme"]>[0];
    const result = await actions.setTheme(event);
    expect(result).toMatchObject({ status: 422 });
    expect(sets).toHaveLength(0);
  });
});
