import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      strategies: "generateSW",
      // Silent auto-update: a new deploy installs in the background and applies
      // on the next launch/navigation (or via the controllerchange reload in
      // PwaUpdater.svelte for a session left open across a deploy). The old
      // "prompt" + skipWaiting combination was incoherent — skipWaiting removes
      // the "waiting" state the prompt UI depended on, so the toast never fired.
      registerType: "autoUpdate",
      // Registration is handled manually in PwaUpdater.svelte with an absolute
      // `/sw.js` + `scope: '/'`. The plugin's own injected registration uses a
      // path-relative scope that 404s on sub-path entries (e.g. a shared link
      // straight to /auslage-einreichen). `false` disables it so there is no
      // double-register.
      injectRegister: false,
      // We manage the manifest file in /static directly
      manifest: false,
      workbox: {
        // Precache app-shell JS/CSS/HTML
        globPatterns: ["client/**/*.{js,css,html,svg,png,ico,webmanifest}"],
        maximumFileSizeToCacheInBytes: 3_000_000,
        runtimeCaching: [
          // Runtime cache for GET API calls: stale-while-revalidate, 60 s TTL.
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "fdw-api-runtime",
              expiration: {
                maxAgeSeconds: 60,
                maxEntries: 100,
              },
            },
          },
          // PM-006: background-sync queue for the public Auslagen form POST.
          // Workbox installs a BackgroundSyncPlugin under the hood from this
          // shape; failed POSTs to /auslage-einreichen are queued in IndexedDB
          // and replayed automatically when the browser fires the 'sync' event.
          // maxRetentionTime is in minutes (24 h).
          {
            urlPattern: ({ url, request }) =>
              request.method === "POST" &&
              url.pathname.startsWith("/auslage-einreichen"),
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "fdw-auslage-queue",
                options: {
                  maxRetentionTime: 24 * 60,
                },
              },
            },
          },
        ],
        // New SW self-activates + claims clients immediately; PwaUpdater then
        // applies the update silently (reload deferred to the next navigation).
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false, // disable SW in dev to avoid stale-cache confusion
      },
    }),
  ],
});
