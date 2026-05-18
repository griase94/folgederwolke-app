/**
 * Re-exports shared Datenschutz constants for server-side consumers.
 * The actual constants live in $lib/domain/datenschutz.ts so they can also
 * be imported by Svelte client components without triggering SvelteKit's
 * server-module guard.
 */
export {
  DATENSCHUTZ_VERSION,
  DATENSCHUTZ_TITLE,
  DATENSCHUTZ_TEXT,
  FORM_DESCRIPTION,
} from "$lib/domain/datenschutz.js";
