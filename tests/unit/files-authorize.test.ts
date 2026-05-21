import { describe, it, expect } from "vitest";
import { authorizeFileAccess } from "$lib/server/files/authorize";

describe("authorizeFileAccess (simplified — admin/steuerberater only have sessions)", () => {
  it("authenticated user → allow non-deleted file", async () => {
    const d = await authorizeFileAccess(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "u1", email: "a@b.de", role: "admin" } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "f1", deletedAt: null } as any,
    );
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("authenticated_user");
  });
  it("deleted file → deny", async () => {
    const d = await authorizeFileAccess(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "u1", email: "a@b.de", role: "admin" } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "f1", deletedAt: new Date() } as any,
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("file_soft_deleted");
  });
});
