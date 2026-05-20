import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { LocalFsFileStorage } from "./local-fs-impl.js";
import { runConformanceSuite } from "./storage.conformance.js";

let testRoot: string;

afterEach(() => {
  if (testRoot) {
    rmSync(testRoot, { recursive: true, force: true });
    testRoot = "";
  }
});

runConformanceSuite("local-fs", () => {
  testRoot = mkdtempSync(join(tmpdir(), "files-conf-"));
  return new LocalFsFileStorage({ root: testRoot });
});
