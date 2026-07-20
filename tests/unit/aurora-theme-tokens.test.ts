// @vitest-environment node
/**
 * Aurora slice 1 — token-contract guard (spec §3, master plan §2.1).
 *
 * Asserts that:
 *  1. src/lib/themes/aurora.css defines the COMPLETE frozen token contract
 *     under [data-theme="aurora"], with the exact frozen values for the
 *     tokens whose values are law.
 *  2. app.css imports the theme file, registers every Aurora extension in
 *     @theme inline, exposes the gradient/wash utilities, and carries no
 *     legacy pink and no static @theme block.
 *  3. app.html carries the static data-theme fallback and the Aurora
 *     theme-color meta.
 *  4. The shadcn Button default variant uses primary-strong (white-on-#FF1E8C
 *     is forbidden, spec §2 contrast contract).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(resolve(repoRoot, ...p), "utf8");

const auroraCss = read("src", "lib", "themes", "aurora.css");
const appCss = read("src", "app.css");
const appHtml = read("src", "app.html");
const buttonSvelte = read(
  "src",
  "lib",
  "components",
  "ui",
  "button",
  "button.svelte",
);
// InboxCard.svelte was deleted in the Aurora inbox redesign (package A) —
// the InboxList now uses TransactionRow (hex-free by token enforcement there).

// Master §2.1 — names AND values are law.
const FROZEN_VALUES: Record<string, string> = {
  "--primary": "#ff1e8c",
  "--primary-strong": "#d6116f",
  "--primary-text": "#c71e6e",
  "--ring": "#c71e6e",
  "--ink-900": "#1a1126",
  "--ink-700": "#3a3050",
  "--ink-500": "#6d6481",
  "--ink-300": "#9c92ae",
  "--color-severity-critical": "#dc2626",
  "--color-severity-critical-text": "#b91c1c",
  "--color-severity-warn": "#f59e0b",
  "--color-severity-warn-text": "#b45309",
  "--color-severity-info": "#64748b",
  "--color-type-ausgabe": "#a64d79",
  "--color-type-ausgabe-tint": "#f7e9f1",
  "--color-type-einnahme": "#1f9e76",
  "--color-type-einnahme-tint": "#e6f6ee",
  "--color-type-spende": "#7c3aed",
  "--color-type-spende-tint": "#efeafb",
  "--color-dataviz-paid": "#a78bcb",
};

// The F1 token reconcile re-points the app-facing `--color-*` tokens onto the
// kit base tokens (e.g. `--color-severity-critical: var(--sev-critical)` with
// `--sev-critical: #dc2626`). Both board reviewers proved the RESOLVED values
// are byte-identical, so the freeze guarantee is intact — the guard just has
// to resolve one var() level against the base tokens declared in the SAME
// light block (exactly what the reviewer scripts do) instead of matching the
// literal text. This keeps it watching the real colour values while tolerating
// the alias architecture.

/** Content of the LIGHT `[data-theme="aurora"] { … }` block (not `.dark`). */
function lightBlock(css: string): string {
  const marker = '[data-theme="aurora"] {';
  const start = css.indexOf(marker);
  if (start < 0) throw new Error("light [data-theme] block not found");
  const open = css.indexOf("{", start);
  let depth = 0;
  let i = open;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) break;
  }
  return css.slice(open + 1, i);
}

/** Map every `--token: value` declaration in a block to its raw value. */
function declMap(block: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /(--[\w-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) map[m[1]!] = m[2]!.trim();
  return map;
}

const LIGHT_TOKENS = declMap(lightBlock(auroraCss));

/**
 * Resolve a token's value, following a single `var(--base)` alias level to the
 * base token declared in the same light block. Composite values pass through.
 */
function resolveToken(name: string): string | undefined {
  const raw = LIGHT_TOKENS[name];
  if (raw === undefined) return undefined;
  const alias = raw.match(/^var\((--[\w-]+)\)$/);
  return alias ? LIGHT_TOKENS[alias[1]!] : raw;
}

// Names only (values are Aurora-chosen or composite).
const REQUIRED_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--border",
  "--input",
  "--radius",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--gradient-brand",
  "--gradient-brand-soft",
  "--gradient-text",
  "--bg-wash",
  "--glow-brand",
  "--surface-glass",
  "--blur-glass",
  "--hairline",
  "--color-dataviz-track",
  "--shadow-card",
];

describe("aurora.css token contract (master §2.1 — names are law)", () => {
  it('defines tokens under [data-theme="aurora"]', () => {
    expect(auroraCss).toContain('[data-theme="aurora"]');
  });

  it.each(Object.entries(FROZEN_VALUES))(
    "%s resolves to the frozen value %s (following one alias level)",
    (name, value) => {
      // The token must be declared in the light block …
      expect(LIGHT_TOKENS[name], `${name} is not declared`).toBeDefined();
      // … and its resolved colour (after one var() alias hop) is frozen.
      expect(resolveToken(name)).toBe(value);
    },
  );

  it.each(REQUIRED_TOKENS)("defines %s", (name) => {
    expect(auroraCss).toContain(`${name}:`);
  });

  it("defines the frozen gradient + shadow composites", () => {
    expect(auroraCss).toContain(
      "--gradient-brand: linear-gradient(92deg, #ff1e8c, #a855f7 55%, #3b82f6);",
    );
    expect(auroraCss).toContain(
      "--bg-wash: linear-gradient(135deg, #fff1f6 0%, #f4eeff 52%, #ecf3ff 100%);",
    );
    expect(auroraCss).toContain(
      "--glow-brand: 0 3px 10px rgb(255 30 140 / 0.3);",
    );
    expect(auroraCss).toContain(
      "--shadow-card: 0 1px 2px rgb(168 85 247 / 0.05), 0 10px 28px -10px rgb(168 85 247 / 0.14);",
    );
  });
});

describe("app.css wiring", () => {
  it("imports the aurora theme file", () => {
    expect(appCss).toContain('@import "./lib/themes/aurora.css";');
  });

  it("has no static @theme block and no legacy pink", () => {
    expect(appCss).not.toMatch(/@theme\s*\{/);
    expect(appCss.toLowerCase()).not.toContain("#be185d");
    expect(appCss).not.toContain("--color-primary-50");
  });

  it("registers every Aurora extension in @theme inline", () => {
    for (const mapping of [
      "--color-primary-strong: var(--primary-strong);",
      "--color-primary-text: var(--primary-text);",
      "--color-ink-900: var(--ink-900);",
      "--color-ink-700: var(--ink-700);",
      "--color-ink-500: var(--ink-500);",
      "--color-ink-300: var(--ink-300);",
      "--color-hairline: var(--hairline);",
      "--color-severity-critical: var(--color-severity-critical);",
      "--color-severity-critical-text: var(--color-severity-critical-text);",
      "--color-severity-warn: var(--color-severity-warn);",
      "--color-severity-warn-text: var(--color-severity-warn-text);",
      "--color-severity-info: var(--color-severity-info);",
      "--color-type-ausgabe: var(--color-type-ausgabe);",
      "--color-type-ausgabe-tint: var(--color-type-ausgabe-tint);",
      "--color-type-einnahme: var(--color-type-einnahme);",
      "--color-type-einnahme-tint: var(--color-type-einnahme-tint);",
      "--color-type-spende: var(--color-type-spende);",
      "--color-type-spende-tint: var(--color-type-spende-tint);",
      "--color-dataviz-paid: var(--color-dataviz-paid);",
      "--color-dataviz-track: var(--color-dataviz-track);",
      "--shadow-card: var(--shadow-card);",
      "--shadow-glow-brand: var(--glow-brand);",
    ]) {
      expect(appCss).toContain(mapping);
    }
  });

  it("exposes the gradient/wash/glass utilities", () => {
    expect(appCss).toContain("@utility bg-wash");
    expect(appCss).toContain("@utility bg-gradient-brand");
    expect(appCss).toContain("@utility bg-gradient-brand-soft");
    expect(appCss).toContain("@utility text-gradient-brand");
    expect(appCss).toContain("@utility surface-glass");
  });

  it("no longer carries the old :root token block or .dark zinc block", () => {
    expect(appCss).not.toMatch(/\.dark\s*\{/);
    expect(appCss).not.toContain("oklch(0.145 0 0)");
  });
});

describe("app.html static fallback", () => {
  it('html tag carries data-theme="aurora"', () => {
    expect(appHtml).toContain('<html lang="de" data-theme="aurora">');
  });

  it("theme-color meta points at the Aurora wash anchor", () => {
    expect(appHtml).toContain('<meta name="theme-color" content="#fff1f6" />');
  });
});

describe("AA compliance of filled controls (spec §2)", () => {
  it("Button default variant fills with primary-strong, never raw primary", () => {
    expect(buttonSvelte).toContain("bg-primary-strong");
    expect(buttonSvelte).not.toContain(
      'default: "bg-primary text-primary-foreground',
    );
  });

  it("Button link variant uses the text-tier pink", () => {
    expect(buttonSvelte).toContain("text-primary-text");
  });

  it("Sidebar active nav uses gradient-soft pill, never raw primary (Aurora §5 / AA)", () => {
    const sidebar = read("src", "lib", "components", "admin", "Sidebar.svelte");
    // Aurora slice 2 upgrades the active pill from bg-primary-strong → bg-gradient-brand-soft
    // (spec §5 "gradient-soft treatment, §2 budget"). Raw bg-primary is still banned.
    expect(sidebar).not.toContain("class:bg-primary=");
    expect(sidebar).toContain("class:bg-gradient-brand-soft=");
  });
});
