/**
 * Verein-Stammdaten domain helper (Phase 9 — Task 10).
 *
 * Reads + writes the Verein's master data via the existing `settings`
 * key-value table. When no row exists for a given key, the read falls
 * back to the corresponding VEREIN_* env var so the legacy
 * "config via env only" mode keeps working until an admin saves the
 * Stammdaten form for the first time.
 *
 * Storage layout — all keys are dot-namespaced under `verein.`:
 *
 *   verein.name                  string
 *   verein.adresse               string
 *   verein.iban                  string  (validated via validateIban)
 *   verein.bic                   string
 *   verein.steuernummer          string
 *   verein.vr                    string  (Vereinsregister-Nr, env: VEREIN_VR)
 *   verein.meta.vorstand_ids     string[] (member UUIDs)
 *
 * Each row is `{ key, value: <jsonb>, updated_at }`. Strings are stored
 * as JSON-encoded strings (`"..."`); arrays as JSON-encoded arrays.
 */

import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { env, assertVereinBankConsistent } from "$lib/server/env.js";
import { validateIban } from "$lib/server/domain/iban.js";

export type StammdatenSource = "settings" | "env-fallback";

export interface StammdatenView {
  name: string;
  adresse: string;
  iban: string;
  bic: string;
  steuernummer: string;
  vr: string;
  vorstandIds: string[];
  /**
   * Provenance per field — `settings` means the value came from the DB,
   * `env-fallback` means no row existed and we used the VEREIN_* env var.
   * The UI uses this to show a "currently from env, will be persisted on
   * save" hint next to each input.
   */
  source: {
    name: StammdatenSource;
    adresse: StammdatenSource;
    iban: StammdatenSource;
    bic: StammdatenSource;
    steuernummer: StammdatenSource;
    vr: StammdatenSource;
    vorstandIds: StammdatenSource;
  };
}

export interface StammdatenWrite {
  name?: string;
  adresse?: string;
  iban?: string;
  bic?: string;
  steuernummer?: string;
  vr?: string;
  vorstandIds?: string[];
}

export type WriteResult = { ok: true } | { ok: false; error: string };

const KEYS = {
  name: "verein.name",
  adresse: "verein.adresse",
  iban: "verein.iban",
  bic: "verein.bic",
  steuernummer: "verein.steuernummer",
  vr: "verein.vr",
  vorstandIds: "verein.meta.vorstand_ids",
} as const;

const ENV_FALLBACKS = {
  name: () => env.VEREIN_NAME ?? "",
  adresse: () => env.VEREIN_ADRESSE ?? "",
  iban: () => env.VEREIN_IBAN ?? "",
  bic: () => env.VEREIN_BIC ?? "",
  steuernummer: () => env.VEREIN_STEUERNUMMER ?? "",
  vr: () => env.VEREIN_VR ?? "",
} as const;

/**
 * Roles whose members may sign Spenden-Bescheinigungen (and therefore
 * appear in the Vorstands-Mitgliedsliste). Mirrors the enum values in
 * `memberRoleEnum`. Members with `role='mitglied'` or `'fördermitglied'`
 * are rejected by `writeStammdaten`.
 */
const VORSTAND_ROLES = new Set<string>([
  "vorstand",
  "kassenwart",
  "schriftfuehrer",
]);

/** UUIDv4 (or any RFC 4122 UUID) — guards against arbitrary user input. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalises a jsonb value coming back from postgres-js into a plain
 * string. Settings rows store strings as JSON-encoded strings (so jsonb
 * round-trips cleanly), but legacy rows may have used wrapped objects
 * like `{value: "..."}` — handle both.
 */
function asString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (
    typeof raw === "object" &&
    raw !== null &&
    "value" in raw &&
    typeof (raw as { value: unknown }).value === "string"
  ) {
    return (raw as { value: string }).value;
  }
  return null;
}

function asStringArray(raw: unknown): string[] | null {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  return null;
}

export async function readStammdaten(): Promise<StammdatenView> {
  const db = getDb();
  // Hard-coded IN-list — KEYS is closed and static, so literal interpolation
  // is safe and avoids the array-bind pitfalls of drizzle's sql template
  // (which spreads array params into multiple positional binds, breaking
  // `ANY(...::text[])`).
  const rows = (await db.execute<{ key: string; value: unknown }>(sql`
    SELECT key, value FROM settings WHERE key IN (
      'verein.name',
      'verein.adresse',
      'verein.iban',
      'verein.bic',
      'verein.steuernummer',
      'verein.vr',
      'verein.meta.vorstand_ids'
    )
  `)) as { key: string; value: unknown }[];

  const map = new Map<string, unknown>(rows.map((r) => [r.key, r.value]));

  const get = (
    k: keyof typeof ENV_FALLBACKS,
  ): { value: string; source: StammdatenSource } => {
    const raw = map.get(KEYS[k]);
    if (raw === undefined) {
      return { value: ENV_FALLBACKS[k](), source: "env-fallback" };
    }
    const s = asString(raw);
    if (s === null) {
      // Row exists but value isn't a string — treat as env-fallback so the
      // UI surfaces the inconsistency rather than rendering "[object Object]".
      return { value: ENV_FALLBACKS[k](), source: "env-fallback" };
    }
    return { value: s, source: "settings" };
  };

  const name = get("name");
  const adresse = get("adresse");
  const iban = get("iban");
  const bic = get("bic");
  const steuernummer = get("steuernummer");
  const vr = get("vr");

  const vorstandRaw = map.get(KEYS.vorstandIds);
  const vorstandParsed = asStringArray(vorstandRaw);
  const vorstandIds = vorstandParsed ?? [];
  const vorstandSource: StammdatenSource =
    vorstandRaw === undefined ? "env-fallback" : "settings";

  return {
    name: name.value,
    adresse: adresse.value,
    iban: iban.value,
    bic: bic.value,
    steuernummer: steuernummer.value,
    vr: vr.value,
    vorstandIds,
    source: {
      name: name.source,
      adresse: adresse.source,
      iban: iban.source,
      bic: bic.source,
      steuernummer: steuernummer.source,
      vr: vr.source,
      vorstandIds: vorstandSource,
    },
  };
}

/**
 * Upserts the supplied keys. `actorUserId` is recorded for future audit-log
 * threading (not yet wired through bus.emit — see Task 10.3 note in the plan).
 */
export async function writeStammdaten(
  patch: StammdatenWrite,
  _actorUserId: string,
): Promise<WriteResult> {
  // ---- Validation ---------------------------------------------------------

  if (patch.iban !== undefined && patch.iban !== "") {
    if (!validateIban(patch.iban)) {
      return { ok: false, error: "IBAN ungültig" };
    }
  }

  // Blocker B: IBAN/BIC consistency check when both fields are present.
  // assertVereinBankConsistent throws on known-BLZ mismatch; we catch and
  // convert to a structured WriteResult so callers get { ok: false, error }.
  if (
    patch.iban !== undefined &&
    patch.iban !== "" &&
    patch.bic !== undefined &&
    patch.bic !== ""
  ) {
    try {
      assertVereinBankConsistent({ iban: patch.iban, bic: patch.bic });
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "IBAN/BIC stimmen nicht überein",
      };
    }
  }

  if (patch.vorstandIds !== undefined) {
    if (!Array.isArray(patch.vorstandIds)) {
      return { ok: false, error: "vorstandIds muss ein Array sein" };
    }
    for (const id of patch.vorstandIds) {
      if (typeof id !== "string" || !UUID_RE.test(id)) {
        return { ok: false, error: `Ungültige Mitglieds-ID: ${String(id)}` };
      }
    }
    if (patch.vorstandIds.length > 0) {
      const db = getDb();
      // Build a Postgres array literal from the (already UUID-validated)
      // strings. drizzle's `sql` template spreads JS arrays into multiple
      // positional binds, which breaks `ANY(::uuid[])`, so we marshal the
      // array ourselves. Safe because every element passed UUID_RE above
      // (no quotes, no commas, no shell-able chars).
      const pgArrayLiteral = `{${patch.vorstandIds.join(",")}}`;
      const rows = (await db.execute<{ id: string; role: string }>(sql`
        SELECT id::text AS id, role::text AS role
          FROM members
         WHERE id = ANY(${pgArrayLiteral}::uuid[])
           AND (austritts_datum IS NULL OR austritts_datum > current_date)
      `)) as { id: string; role: string }[];

      const byId = new Map(rows.map((r) => [r.id, r.role]));
      for (const id of patch.vorstandIds) {
        const role = byId.get(id);
        if (role === undefined) {
          return { ok: false, error: `Mitglied ${id} existiert nicht` };
        }
        if (!VORSTAND_ROLES.has(role)) {
          return {
            ok: false,
            error: `Mitglied ${id} ist kein Vorstand/Kassenwart/Schriftführer (Rolle: ${role})`,
          };
        }
      }
    }
  }

  // ---- Persist ------------------------------------------------------------

  const db = getDb();

  type Entry =
    | { key: string; kind: "string"; value: string }
    | { key: string; kind: "array"; value: string[] };

  const entries: Entry[] = [];
  // Blocker C: skip empty-string values — writing "" would permanently shadow
  // the env fallback, making the reader return "" (source: "settings") instead
  // of the VEREIN_* env value. An empty string means "no override; defer to env".
  if (patch.name !== undefined && patch.name !== "")
    entries.push({ key: KEYS.name, kind: "string", value: patch.name });
  if (patch.adresse !== undefined && patch.adresse !== "")
    entries.push({ key: KEYS.adresse, kind: "string", value: patch.adresse });
  if (patch.iban !== undefined && patch.iban !== "")
    entries.push({ key: KEYS.iban, kind: "string", value: patch.iban });
  if (patch.bic !== undefined && patch.bic !== "")
    entries.push({ key: KEYS.bic, kind: "string", value: patch.bic });
  if (patch.steuernummer !== undefined && patch.steuernummer !== "")
    entries.push({
      key: KEYS.steuernummer,
      kind: "string",
      value: patch.steuernummer,
    });
  if (patch.vr !== undefined && patch.vr !== "")
    entries.push({ key: KEYS.vr, kind: "string", value: patch.vr });
  if (patch.vorstandIds !== undefined)
    entries.push({
      key: KEYS.vorstandIds,
      kind: "array",
      value: patch.vorstandIds,
    });

  for (const e of entries) {
    if (e.kind === "string") {
      // Store strings as a JSON-encoded string (`"..."`). Casting the bound
      // string parameter to `jsonb` directly fails for plain identifiers
      // (`"foo"` is not valid JSON), so we JSON.stringify first.
      const jsonLiteral = JSON.stringify(e.value);
      await db.execute(sql`
        INSERT INTO settings (key, value, updated_at)
        VALUES (${e.key}, ${jsonLiteral}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = NOW()
      `);
    } else {
      const jsonLiteral = JSON.stringify(e.value);
      await db.execute(sql`
        INSERT INTO settings (key, value, updated_at)
        VALUES (${e.key}, ${jsonLiteral}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = NOW()
      `);
    }
  }

  // Audit-log emission point — not wired yet (no `settings.updated` event
  // type registered in src/lib/server/events/types.ts as of this PR).
  // Follow-up: add typed `settings.updated` event, emit one per key.

  return { ok: true };
}
