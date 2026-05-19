import { describe, expect, it } from "vitest";
import {
  scrubEnv,
  tripWire,
  type ClusterEnv,
} from "../../../scripts/orchestrate/secret-guard.js";

describe("scrubEnv", () => {
  it("returns only whitelisted keys + cluster-allocated values", () => {
    const cluster: ClusterEnv = {
      DATABASE_URL: "postgres://localhost:5441/folgederwolke_test_c1",
      DIRECT_DATABASE_URL: "postgres://localhost:5441/folgederwolke_test_c1",
      FILE_STORAGE_ROOT: "./.dev-data/drive-c1",
      VITE_PORT: "5181",
    };
    const fullEnv = {
      PATH: "/usr/bin",
      HOME: "/home/x",
      NEON_PASSWORD: "secret",
      GOOGLE_OAUTH_REFRESH_TOKEN: "ya29.real",
      ...cluster,
    };
    const out = scrubEnv(fullEnv, cluster);
    expect(out.PATH).toBe("/usr/bin");
    expect(out.DATABASE_URL).toBe(cluster.DATABASE_URL);
    expect(out.MAIL_PROVIDER).toBe("no-op");
    expect(out.STORAGE_BACKEND).toBe("local-fs");
    expect("NEON_PASSWORD" in out).toBe(false);
    expect("GOOGLE_OAUTH_REFRESH_TOKEN" in out).toBe(false);
  });
});

describe("tripWire", () => {
  it("returns null when env is safe", () => {
    expect(
      tripWire({
        MAIL_PROVIDER: "no-op",
        STORAGE_BACKEND: "local-fs",
        DATABASE_URL: "postgres://localhost:5441/x",
      }),
    ).toBeNull();
  });
  it("detects STORAGE_BACKEND=drive", () => {
    expect(tripWire({ STORAGE_BACKEND: "drive" })).toMatch(/STORAGE_BACKEND/);
  });
  it("detects MAIL_PROVIDER=smtp or resend", () => {
    expect(tripWire({ MAIL_PROVIDER: "smtp" })).toMatch(/MAIL_PROVIDER/);
    expect(tripWire({ MAIL_PROVIDER: "resend" })).toMatch(/MAIL_PROVIDER/);
  });
  it("detects neon.tech in DATABASE_URL", () => {
    expect(
      tripWire({
        DATABASE_URL: "postgres://u:p@x.eu-central-1.aws.neon.tech/db",
      }),
    ).toMatch(/neon\.tech/);
  });
});
