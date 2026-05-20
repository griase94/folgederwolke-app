# Deutsche Microcopy-Konventionen

Diese Datei dokumentiert die Sprach- und Beschriftungs-Regeln für die App,
festgelegt während C9 (overnight 2026-05-20). Wenn du neue UI-Komponenten
schreibst, halte dich an diese Regeln — sonst ziehe es in einem Review.

## Grundton

- **Warm, klar, deutsch.** Keine Anglizismen außer Industrie-Standards
  (`PDF`, `QR-Code`, `IBAN`, `BIC`, `SEPA`, `URL` sind ok; `Submit`, `Save`,
  `Click here` sind nicht ok).
- **Aktiv vor passiv.** „Lege ein Mitglied an" statt „Mitglied wird angelegt".
- **Du-Form, nicht Sie-Form.** Die App spricht den Anwender direkt an —
  Kassenwartin im Du.
- **Kurz statt lang.** „Spende erfassen" statt „Eine neue Spende erfassen".

## Submit-Buttons: ehrlich und entitäten-spezifisch

Eine Schaltfläche muss beschreiben, was sie tut. Generische Texte
(`Hinzufügen`, `Speichern`, `OK`) sind verboten. Stattdessen:

| Aktion                  | Label                                  |
| ----------------------- | -------------------------------------- |
| Neues Mitglied          | `Mitglied anlegen`                     |
| Neuer Kunde             | `Kunden anlegen`                       |
| Neues Projekt           | `Projekt anlegen`                      |
| Neue Rechnung (mit PDF) | `Rechnung erstellen & PDF`             |
| Neue Spende             | `Spende erfassen`                      |
| Neue Ausgabe            | `Ausgabe erfassen`                     |
| Neue Einnahme           | `Einnahme erfassen`                    |
| Bearbeiten speichern    | `Änderungen speichern`                 |
| Archivieren             | `Archivieren` (mit Bestätigungs-Modal) |

Warm-Wort-Wahl: „erfassen" für Buchungen (Spende, Ausgabe, Einnahme), „anlegen"
für Stammdaten (Mitglied, Kunde, Projekt), „erstellen" wenn ein Artefakt
materialisiert wird (Rechnung + PDF, Bescheinigung).

## Empty-States

Jede leere Liste bekommt:

1. Ein Icon (folder, file-text, users — je nach Entität)
2. Eine Überschrift: `Noch keine {Entität}`
3. Einen Satz Hilfetext, der eine **konkrete nächste Aktion** beschreibt:
   `Lege das erste Mitglied an, um loszulegen.` (nicht: „Füge das erste
   Mitglied mit dem Button oben hinzu." — das ist eine Umweg-Anweisung.)
4. Einen **inline Call-to-Action** (Button oder Link) mit dem entsprechenden
   Submit-Button-Label.

Bevorzugt: `<NoEntries>` aus `$lib/components/empty/NoEntries.svelte`
mit dem `action` Snippet.

## Datum-Eingaben

Jedes `<input type="date">` und `<Input type="date">` braucht
`lang="de"`. Damit zeigt der native Browser-Datepicker `tt.mm.jjjj`
statt `mm/dd/yyyy` als Platzhalter. Ohne dieses Attribut ist die App
für deutsche Anwender sofort identifizierbar als „aus dem Englischen
übersetzt" — der UX-Killer Nummer 1.

```svelte
<Input type="date" lang="de" name="zugewendet_am" />
<input type="date" lang="de" id="rechnungsdatum" />
```

## Soft-Undo bei destruktiven Aktionen

Jede destruktive Aktion (Mitglied/Kunde/Projekt archivieren,
Buchung löschen, Spende stornieren) muss einen Toast mit Undo-Aktion
zeigen, der ~8 Sekunden steht. Das Pattern:

```ts
const toastId = toast.success("Projekt archiviert", {
  action: {
    label: "Rückgängig",
    onClick: async () => {
      const fd = new FormData();
      fd.set("id", entityId);
      await fetch("?/restore", { method: "POST", body: fd });
      await invalidateAll();
      toast.dismiss(toastId);
      toast.info("Wiederhergestellt");
    },
  },
  duration: 8000,
});
```

Der Server muss eine entsprechende `restore` Action liefern, die
`deletedAt = NULL` (oder `austrittsDatum = NULL` bei Mitgliedern) setzt.

## Navigation

- Die Sidebar zeigt **5** primäre Einträge:
  `Übersicht`, `Audit Inbox`, `Transaktionen`, `Mitglieder`, `Rechnungen`.
- Alles andere lebt in der einklappbaren „Mehr"-Sektion.
- Der Dashboard-Eintrag heißt `Übersicht`, nicht `Heute` (die Seite zeigt
  KPIs / YTD, nicht Heute-Aufgaben).
- `/app/sheet-resync` ist absichtlich **nicht** in der Navigation — der
  Importer ist via URL erreichbar für seltene Admin-Tasks.

## Toast-Sprache

| Situation                      | Text                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Erfolg (anlegen)               | `Mitglied angelegt` / `Spende erfasst`                                                          |
| Erfolg (aktualisieren)         | `Mitglied aktualisiert`                                                                         |
| Erfolg (archivieren, mit Undo) | `Projekt archiviert` + Undo-Action                                                              |
| Undo durchgeführt              | `Wiederhergestellt`                                                                             |
| Fehler                         | konkrete Fehlermeldung („IBAN-Prüfsumme stimmt nicht") oder Fallback `Speichern fehlgeschlagen` |

## Tests die diese Konventionen verteidigen

- `src/lib/components/admin/c9-nav-registry.test.ts` — Sidebar-Diet + Übersicht
- `tests/unit/c9-submit-labels.test.ts` — ehrliche Submit-Labels
- `tests/unit/c9-empty-state-ctas.test.ts` — CTA in jeder Empty-State
- `tests/unit/c9-date-input-lang.test.ts` — `lang="de"` auf Datum-Inputs
- `tests/unit/c9-soft-undo-toasts.test.ts` — Undo bei destruktiven Aktionen
- `tests/unit/c9-auslage-layout-projects.test.ts` — Projekt-Dropdown gefüllt
- `tests/e2e/c9-auslagen-projects-load.spec.ts` — E2E AT-002

Wenn du eines dieser Patterns brichst, schlägt einer dieser Tests fehl.
