import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cluster C5 — PWA icon pack + manifest contract.
 *
 * Asserts the full icon set exists at the declared paths/dimensions, the
 * manifest is valid JSON, and the manifest declares the additions required
 * by PM-001/002/004/005/007/015/020 (shortcuts, share_target, id, categories,
 * display_override, dir, prefer_related_applications, plus PNG icon entries).
 */

const repoRoot = resolve(__dirname, "..", "..");
const staticDir = resolve(repoRoot, "static");

interface IconSpec {
  file: string;
  width: number;
  height: number;
}

const expectedPngIcons: IconSpec[] = [
  { file: "icons/icon-192.png", width: 192, height: 192 },
  { file: "icons/icon-512.png", width: 512, height: 512 },
  { file: "icons/icon-192-maskable.png", width: 192, height: 192 },
  { file: "icons/icon-512-maskable.png", width: 512, height: 512 },
  { file: "apple-touch-icon.png", width: 180, height: 180 },
  { file: "favicon-16.png", width: 16, height: 16 },
  { file: "favicon-32.png", width: 32, height: 32 },
  { file: "favicon-96.png", width: 96, height: 96 },
];

function readPngDimensions(absPath: string): { width: number; height: number } {
  const buf = readFileSync(absPath);
  // PNG signature must be 89 50 4E 47 0D 0A 1A 0A
  const sig = buf.subarray(0, 8);
  const expected = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (!sig.equals(expected)) {
    throw new Error(`${absPath} is not a valid PNG (bad signature)`);
  }
  // IHDR width/height are big-endian uint32 at offsets 16 and 20.
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

describe("PWA icon pack — files exist", () => {
  for (const spec of expectedPngIcons) {
    it(`${spec.file} exists`, () => {
      const abs = resolve(staticDir, spec.file);
      expect(existsSync(abs), `missing ${abs}`).toBe(true);
      expect(statSync(abs).size).toBeGreaterThan(0);
    });
  }

  it("favicon.ico exists", () => {
    const abs = resolve(staticDir, "favicon.ico");
    expect(existsSync(abs)).toBe(true);
    expect(statSync(abs).size).toBeGreaterThan(0);
  });
});

describe("PWA icon pack — PNG dimensions match the declared sizes", () => {
  for (const spec of expectedPngIcons) {
    it(`${spec.file} is ${spec.width}x${spec.height}`, () => {
      const abs = resolve(staticDir, spec.file);
      const { width, height } = readPngDimensions(abs);
      expect(width).toBe(spec.width);
      expect(height).toBe(spec.height);
    });
  }
});

describe("manifest.webmanifest — structural validity", () => {
  const raw = readFileSync(resolve(staticDir, "manifest.webmanifest"), "utf8");
  const manifest = JSON.parse(raw) as Record<string, unknown>;

  it("parses as JSON", () => {
    expect(manifest).toBeTypeOf("object");
  });

  it("keeps core branding fields", () => {
    expect(manifest.name).toBe("Folge der Wolke");
    expect(manifest.short_name).toBe("FdW");
    expect(manifest.theme_color).toBe("#fff1f6"); // Aurora wash anchor (Task 1.8)
    expect(manifest.lang).toBe("de");
    expect(manifest.scope).toBe("/");
  });

  it("declares dir + categories + id + prefer_related_applications (PM trivia)", () => {
    expect(manifest.dir).toBe("ltr");
    expect(Array.isArray(manifest.categories)).toBe(true);
    expect((manifest.categories as string[]).length).toBeGreaterThan(0);
    expect(manifest.id).toBeTypeOf("string");
    expect(manifest.prefer_related_applications).toBe(false);
  });

  it("uses /?source=pwa as start_url (A1: role-aware root router)", () => {
    // The launch target is the role-aware root, which routes admins → /app,
    // returning externals → the form (sticky), and everyone else → the landing
    // with both choices. Previously this was /app?source=pwa, which trapped
    // logged-out users on the public form.
    expect(manifest.start_url).toBe("/?source=pwa");
  });

  it("declares display_override fallback chain", () => {
    expect(Array.isArray(manifest.display_override)).toBe(true);
    expect(manifest.display_override).toContain("standalone");
  });
});

describe("manifest.webmanifest — icons array (PM-002, PM-015)", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(staticDir, "manifest.webmanifest"), "utf8"),
  ) as {
    icons: Array<{
      src: string;
      sizes: string;
      type: string;
      purpose?: string;
    }>;
  };

  it("references PNG variants for 192 + 512 in both 'any' and 'maskable' purposes", () => {
    const png192Any = manifest.icons.find(
      (i) =>
        i.src.endsWith("icon-192.png") && (i.purpose ?? "any").includes("any"),
    );
    const png512Any = manifest.icons.find(
      (i) =>
        i.src.endsWith("icon-512.png") && (i.purpose ?? "any").includes("any"),
    );
    const png192Maskable = manifest.icons.find(
      (i) =>
        i.src.endsWith("icon-192-maskable.png") &&
        (i.purpose ?? "").includes("maskable"),
    );
    const png512Maskable = manifest.icons.find(
      (i) =>
        i.src.endsWith("icon-512-maskable.png") &&
        (i.purpose ?? "").includes("maskable"),
    );

    expect(
      png192Any,
      "manifest must reference icon-192.png as purpose 'any'",
    ).toBeDefined();
    expect(
      png512Any,
      "manifest must reference icon-512.png as purpose 'any'",
    ).toBeDefined();
    expect(
      png192Maskable,
      "manifest must reference icon-192-maskable.png as purpose 'maskable'",
    ).toBeDefined();
    expect(
      png512Maskable,
      "manifest must reference icon-512-maskable.png as purpose 'maskable'",
    ).toBeDefined();
    expect(png192Any?.type).toBe("image/png");
    expect(png512Any?.type).toBe("image/png");
  });

  it("each icon entry points at a file that actually exists", () => {
    for (const icon of manifest.icons) {
      const trimmed = icon.src.replace(/^\//, "");
      const abs = resolve(staticDir, trimmed);
      expect(existsSync(abs), `manifest icon ${icon.src} missing on disk`).toBe(
        true,
      );
    }
  });

  it("no SVG icon entries in the manifest (marble design is raster-only — stale FdW-text SVGs removed)", () => {
    const svgIcons = manifest.icons.filter(
      (i) => i.type === "image/svg+xml" || i.src.toLowerCase().endsWith(".svg"),
    );
    expect(
      svgIcons,
      `manifest should not declare SVG icons; found: ${svgIcons.map((i) => i.src).join(", ")}`,
    ).toEqual([]);
  });
});

describe("manifest.webmanifest — shortcuts (PM-004)", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(staticDir, "manifest.webmanifest"), "utf8"),
  ) as {
    shortcuts?: Array<{
      name: string;
      url: string;
      icons?: Array<{ src: string }>;
    }>;
  };

  it("declares 4 shortcuts: Audit Inbox, Neue Spende, EÜR aktuelles Jahr, Auslage einreichen", () => {
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts!.length).toBeGreaterThanOrEqual(4);
    const names = manifest.shortcuts!.map((s) => s.name);
    expect(names.some((n) => /audit.*inbox/i.test(n))).toBe(true);
    expect(names.some((n) => /spende/i.test(n))).toBe(true);
    expect(names.some((n) => /eür|euer|jahr/i.test(n))).toBe(true);
    expect(names.some((n) => /auslage/i.test(n))).toBe(true);
  });

  it("shortcut urls carry ?source=shortcut analytics flag", () => {
    for (const s of manifest.shortcuts!) {
      expect(s.url).toMatch(/source=shortcut/);
    }
  });
});

describe("manifest.webmanifest — share_target (PM-005)", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(staticDir, "manifest.webmanifest"), "utf8"),
  ) as {
    share_target?: {
      action: string;
      method: string;
      enctype: string;
      params: { title?: string; text?: string; url?: string; files?: unknown };
    };
  };

  it("declares share_target wired to /auslage-einreichen", () => {
    expect(manifest.share_target).toBeDefined();
    expect(manifest.share_target!.action).toContain("/auslage-einreichen");
    expect(manifest.share_target!.method.toUpperCase()).toBe("POST");
    expect(manifest.share_target!.enctype).toBe("multipart/form-data");
  });

  it("share_target accepts file uploads (Beleg sharing from Android)", () => {
    expect(manifest.share_target!.params.files).toBeDefined();
  });
});

describe("InstallPrompt dismissal persistence (PM-011 — bonus, part of cluster scope)", () => {
  // The component lives in src/lib/components/pwa/InstallPrompt.svelte; we
  // assert via grep that it touches localStorage + a recognisable key.
  const src = readFileSync(
    resolve(repoRoot, "src/lib/components/pwa/InstallPrompt.svelte"),
    "utf8",
  );

  it("persists dismissal via localStorage", () => {
    expect(src).toMatch(/localStorage/);
    expect(src).toMatch(/install-dismissed/);
  });
});

describe("PWA asset generators — regeneration entrypoints exist", () => {
  it("scripts/build-app-icons.ts exists (marble icon/favicon pack)", () => {
    expect(existsSync(resolve(repoRoot, "scripts/build-app-icons.ts"))).toBe(
      true,
    );
  });

  it("scripts/build-splash.ts exists (iOS splash set)", () => {
    expect(existsSync(resolve(repoRoot, "scripts/build-splash.ts"))).toBe(true);
  });
});
