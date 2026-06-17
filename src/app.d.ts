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
    interface PageState {
      /**
       * Aurora bottom sheets (spec §5): open state lives in a history entry
       * (SvelteKit shallow routing). MobileTabBar pushState()s these flags;
       * dismissing a sheet calls history.back() so Android back / iOS
       * swipe-back closes the SHEET, not the page.
       */
      mehrSheet?: boolean;
      createSheet?: boolean;
    }
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
