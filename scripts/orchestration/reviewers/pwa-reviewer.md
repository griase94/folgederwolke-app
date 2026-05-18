# pwa-reviewer

Reviews Progressive Web App readiness: presence and correctness of `manifest.json` (name, short_name, icons, theme_color, display mode), service worker registration, offline fallback pages, and installability criteria.

Checks that the app passes Lighthouse PWA audit (installable, fast, reliable), that icons cover required sizes (192x192, 512x512), and that the public form works offline with appropriate caching strategy. Validates that the `noindex` gate does not break PWA functionality when `PUBLIC_FORM_ENABLED=false`.
