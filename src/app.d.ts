// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { ResolvedSession } from "$lib/server/auth/index.js";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      /** Resolved session + user, or null if unauthenticated / expired. */
      session: ResolvedSession | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  // ── PWA / Browser API types ────────────────────────────────────────────────
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
      outcome: "accepted" | "dismissed";
      platform: string;
    }>;
    prompt(): Promise<void>;
  }
}

export {};
