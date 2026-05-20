import type { FileStorage } from "./storage.js";
import { StorageNetworkError } from "./errors.js";

/**
 * Wrapper around any FileStorage that injects failures on demand.
 * Used for failure-injection tests in upload-pipeline + archive-job + reconciliation.
 *
 * Forwards `_internal*` methods to the wrapped impl so the wrapper is transparent
 * to test code that inspects storage state.
 */
export class ChaosFileStorage implements FileStorage {
  private up = 0;
  private down = 0;

  constructor(private readonly inner: FileStorage) {}

  failNextUpload(n: number) {
    this.up = n;
  }
  failNextDownload(n: number) {
    this.down = n;
  }

  async upload(args: Parameters<FileStorage["upload"]>[0]) {
    if (this.up > 0) {
      this.up--;
      throw new StorageNetworkError("CHAOS: simulated upload failure");
    }
    return this.inner.upload(args);
  }

  async download(p: string) {
    if (this.down > 0) {
      this.down--;
      throw new StorageNetworkError("CHAOS: simulated download failure");
    }
    return this.inner.download(p);
  }

  async downloadStream(p: string) {
    return this.inner.downloadStream(p);
  }
  async archive(p: string, y: number) {
    return this.inner.archive(p, y);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async _internalDelByPath(p: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.inner as any)._internalDelByPath?.(p);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async _internalList(prefix?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.inner as any)._internalList?.(prefix);
  }
}
