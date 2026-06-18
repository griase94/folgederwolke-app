/**
 * @vitest-environment node
 * @phase-entry-modals
 *
 * Unit tests for the ?/manual-import action (inbox +page.server.ts).
 *
 * Coverage:
 *   - member arm: posting member_display_name does NOT 422 and calls
 *     manualImportSubmission with the correct display_name
 *   - verein arm: posting verein_display_name passes through to the domain
 *     helper (composeBezahltVonDisplay receives it)
 *   - neither-beleg-nor-grund: action returns 422 with errors.beleg
 *
 * These tests exercise the SvelteKit action layer directly — they don't go
 * through the network. The pattern mirrors tests/unit/ausgaben-create.server.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared before SUT import
// ---------------------------------------------------------------------------

const manualImportSubmissionMock = vi.fn(async (_input: unknown) => ({
  submissionId: "sub-test-1",
  ausId: "AUS-2026-001",
}));

vi.mock("$lib/server/domain/audit-inbox-actions.js", () => ({
  manualImportSubmission: manualImportSubmissionMock,
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  markExpenseErstattet: vi.fn(),
}));

const handleAuslageUploadMock = vi.fn(async () => ({
  fileId: "file-test-1",
  dedupHit: false,
  sniffedMimeType: "application/pdf",
  sanitizedFilename: "beleg.pdf",
}));

vi.mock("$lib/server/files/handleAuslageUpload.js", () => ({
  handleAuslageUpload: handleAuslageUploadMock,
}));

vi.mock("$lib/server/domain/auslagen.js", () => ({
  composeBezahltVonDisplay: (_bv: unknown) => "Mitglied: Felix Muster",
}));

vi.mock("$lib/server/domain/iban.js", () => ({
  validateIban: (v: string) => /^DE\d{20}$/.test(v.replace(/\s/g, "")),
  normalizeIban: (v: string) => v.replace(/\s/g, ""),
}));

// DB fake for load() — not under test; the action itself reads no DB for the
// member-arm path (validation is Zod-only).
function makeDbFake() {
  const chain = {
    from() {
      return chain;
    },
    leftJoin() {
      return chain;
    },
    where() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    select() {
      return chain;
    },
    then(resolve: (rows: unknown[]) => unknown) {
      return Promise.resolve([]).then(resolve);
    },
  };
  return { select: () => chain };
}

vi.mock("$lib/server/db/index.js", () => ({ getDb: () => makeDbFake() }));
vi.mock("$lib/server/db/schema/auslagen_submissions.js", () => ({
  auslagenSubmissions: {},
}));
vi.mock("$lib/server/db/schema/members.js", () => ({ members: {} }));

// ---------------------------------------------------------------------------
// SUT — imported AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

const { actions } = await import("../../src/routes/app/inbox/+page.server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ActionEvent {
  request: Request;
  locals: { session: { user: { id: string } } | null };
}

function makeEvent(
  fields: Record<string, string | File>,
  user: { id: string } = { id: "admin-1" },
): ActionEvent {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return {
    request: new Request("http://test.local/app/inbox?/manual-import", {
      method: "POST",
      body: fd,
    }),
    locals: { session: { user } },
  };
}

function mkBelegFile(): File {
  const buf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n",
    "utf-8",
  );
  return new File([buf], "beleg.pdf", { type: "application/pdf" });
}

const MEMBER_UUID = "11111111-1111-4111-8111-111111111111";

const BASE_MEMBER_FIELDS = {
  bezahlt_von_kind: "member",
  member_id: MEMBER_UUID,
  member_display_name: "Felix Muster",
  member_email: "felix@example.com",
  bezeichnung: "Bahnticket Berlin",
  betragCents: "3200",
  rechnungsdatum: "2026-05-15",
};

const BASE_VEREIN_FIELDS = {
  bezahlt_von_kind: "verein",
  verein_display_name: "Folge der Wolke e.V.",
  bezeichnung: "Druckerpapier",
  betragCents: "890",
  rechnungsdatum: "2026-05-01",
};

beforeEach(() => {
  manualImportSubmissionMock.mockClear();
  handleAuslageUploadMock.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

type ActionResult =
  | { status?: number; data?: unknown }
  | { success: true; ausId: string };

async function runManualImport(event: ActionEvent): Promise<ActionResult> {
  const result = await (
    actions["manual-import"] as (e: ActionEvent) => Promise<unknown>
  )(event);
  return result as ActionResult;
}

describe("?/manual-import — member arm", () => {
  it("does NOT 422 when member_display_name is posted and calls manualImportSubmission", async () => {
    const event = makeEvent({
      ...BASE_MEMBER_FIELDS,
      beleg: mkBelegFile(),
    });

    const result = await runManualImport(event);

    // Must not be a fail() (fail returns an object with status 4xx)
    expect(result).not.toHaveProperty("status");

    // manualImportSubmission was called
    expect(manualImportSubmissionMock).toHaveBeenCalledTimes(1);
    const call = manualImportSubmissionMock.mock.calls[0]![0] as {
      bezahlt_von: { kind: string; member_id: string; display_name: string };
    };
    expect(call.bezahlt_von.kind).toBe("member");
    expect(call.bezahlt_von.member_id).toBe(MEMBER_UUID);
    expect(call.bezahlt_von.display_name).toBe("Felix Muster");
  });

  it("returns 422 with errors.member when member_id is provided but member_display_name is missing", async () => {
    const event = makeEvent({
      bezahlt_von_kind: "member",
      member_id: MEMBER_UUID,
      // member_display_name intentionally omitted — the old bug
      bezeichnung: "Bahnticket Berlin",
      betragCents: "3200",
      rechnungsdatum: "2026-05-15",
      keinBeleg: "true",
      begruendung: "Quittung verloren",
    });

    const result = await runManualImport(event);

    expect(result).toHaveProperty("status", 422);
    const data = (result as { data: { errors?: { member?: unknown[] } } }).data;
    expect(data?.errors?.member).toBeDefined();

    // manualImportSubmission must NOT be called on a 422
    expect(manualImportSubmissionMock).not.toHaveBeenCalled();
  });
});

describe("?/manual-import — verein arm", () => {
  it("passes verein_display_name through to the domain helper", async () => {
    const event = makeEvent({
      ...BASE_VEREIN_FIELDS,
      keinBeleg: "true",
      begruendung: "Quittung verloren gegangen",
    });

    const result = await runManualImport(event);

    expect(result).not.toHaveProperty("status");
    expect(manualImportSubmissionMock).toHaveBeenCalledTimes(1);
    const call = manualImportSubmissionMock.mock.calls[0]![0] as {
      bezahlt_von: { kind: string; display_name?: string };
    };
    expect(call.bezahlt_von.kind).toBe("verein");
    expect(call.bezahlt_von.display_name).toBe("Folge der Wolke e.V.");
  });
});

describe("?/manual-import — beleg gate", () => {
  it("returns 422 with errors.beleg when neither file nor keinBeleg+Begründung is provided", async () => {
    const event = makeEvent({
      ...BASE_VEREIN_FIELDS,
      // no beleg file, no keinBeleg
    });

    const result = await runManualImport(event);

    expect(result).toHaveProperty("status", 422);
    const data = (result as { data: { errors?: { beleg?: unknown[] } } }).data;
    expect(data?.errors?.beleg).toBeDefined();
    expect(manualImportSubmissionMock).not.toHaveBeenCalled();
  });
});
