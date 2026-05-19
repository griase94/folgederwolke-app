// Ambient type declarations for vite-pwa virtual modules.
// Must be a non-module file (no top-level import/export) so declarations
// are globally ambient and picked up by svelte-check.

declare module "virtual:pwa-register/svelte" {
  import type { Writable } from "svelte/store";
  interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (
      swUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: Writable<boolean>;
    offlineReady: Writable<boolean>;
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
