/**
 * German error strings for upload-pipeline failure modes.
 *
 * Map a StorageError `code` (or any other thrown error's code) to a single
 * user-facing German sentence. Used by route actions to keep the
 * StorageError typing on the server side and the German UX strings here.
 */
export function germanFileError(code: string): string {
  switch (code) {
    case "STORAGE_INVALID":
      return "Diese Datei kann leider nicht hochgeladen werden. Bitte prüfe Größe (max 4,5 MB komprimiert) und Format (PDF, JPEG, PNG, WebP, HEIC).";
    case "STORAGE_DUPLICATE":
      return "Dieser Beleg wurde bereits hochgeladen.";
    case "STORAGE_NETWORK":
      return "Netzwerkfehler. Bitte erneut versuchen.";
    case "STORAGE_NOT_FOUND":
      return "Datei nicht gefunden.";
    case "STORAGE_IMMUTABLE":
      return "Diese Datei kann nicht mehr geändert werden (Buchungsjahr abgeschlossen).";
    default:
      return "Beim Upload ist ein Fehler aufgetreten. Bitte erneut versuchen.";
  }
}
