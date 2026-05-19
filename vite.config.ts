import { sveltekit } from "@sveltejs/kit/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      strategies: "generateSW",
      registerType: "prompt",
      // We manage the manifest file in /static directly
      manifest: false,
      workbox: {
        // Precache app-shell JS/CSS/HTML
        globPatterns: ["client/**/*.{js,css,html,svg,png,ico,webmanifest}"],
        maximumFileSizeToCacheInBytes: 3_000_000,
        // Runtime cache for GET API calls: stale-while-revalidate, 60 s TTL
        runtimeCaching: [
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
        ],
        // Immediately activate new SW so UpdateAvailableToast can prompt reload
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false, // disable SW in dev to avoid stale-cache confusion
      },
    }),
  ],
});
