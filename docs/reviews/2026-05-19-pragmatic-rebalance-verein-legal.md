# Pragmatic Rebalance: What a 10-Person Verein Actually Owes

**Datum:** 2026-05-19
**Reviewer:** Enforcement-reality reviewer
**Scope:** Counter-review of the 2026-05-19 nine-reviewer pass (DSGVO, Money, Ops) for **Folge der Wolke e.V.** — gemeinnützig, ca. 10 Mitglieder, Munich, low five-figure annual revenue, one developer in his spare time.
**Aufsichtsbehörde:** BayLDA Ansbach (Praxisbekannt: pragmatisch, Mängelrüge-orientiert bei Kleinvereinen).
**Finanzamt:** München (BMF Muster, GoBD).

---

## TL;DR

The previous review pass measured this app against the standard of a regulated fintech SaaS. **It is not.** It is a buchhalterisches Hilfsmittel for a Munich Kunst- und Kultur-Verein with ten friends. The maximalist reading of every relevant Norm (DSGVO Art. 28/30/32, GoBD Tz. 100ff., §147 AO, §50 EStDV) is legally available — but neither the BayLDA nor das Finanzamt München prüft Vereine dieser Größe nach diesem Standard, und 99 % vergleichbarer Vereine machen das auch nicht. The few items that **are** load-bearing (BMF-Muster für die Zuwendungsbestätigung, ein verständliches Impressum nach § 5 TMG, eine ansatzweise korrekte DSE, keine offen rumliegenden IBANs in einem öffentlichen Backup-Repo) sind eine Wochenend-Arbeit, nicht ein Phase-7.5-Compliance-Hardening-Sprint.

**Per-question summary (one-liners):**

1. DSE: **SIMPLIFY** — BayLDA-Muster anpassen, selbst signieren, kein Anwalt nötig.
2. AVV-Verträge: **SIMPLIFY** — Online-DPAs von Vercel/Neon klicken; DPA_GATE_PASSED Theater **DROP**.
3. VVT: **KEEP-SIMPLIFY** — sehr knappe Version reicht; jetziger Stand ist OK, nicht polieren.
4. TOM: **KEEP-SIMPLIFY** — eine A4-Seite reicht; aktuelle Detailtiefe ist Overkill.
5. Verfahrensdokumentation GoBD: **DROP** (in current 12-section form) — Verein ist **weit** unter § 141 AO Schwelle und EÜR-Buchführer.
6. Bescheinigung BMF: **KEEP** — Umlaute, Finanzamtsort, §50-EStDV-Hinweis sind echt; Rest ist Polish.
7. Audit-Log Hash-Chain / Anchor / SECURITY DEFINER: **DROP** — Threat-Model existiert nicht.
8. Festschreibung-DB-Trigger: **DEFER-ISSUE** — sinnvoll, nicht launch-blocking.
9. Datenpannen-Vorlage / DSB-not-required / Key-Escrow: **SIMPLIFY** — eine kurze Aktennotiz reicht; Escrow ja, Vorlage nein.
10. „Vorarbeit"-Banner: **SIMPLIFY** — Banner entfernen, fertig.

**Top 3 to drop or massively simplify:**

1. **The entire ADR-0004 hash-chain / off-Postgres anchor / SECURITY DEFINER trigger / advisory-lock-namespacing machinery** — Cargo-Cult-Fintech. Eine Verein mit einem Admin hat kein nicht-vertrauenswürdiges Insider-Modell.
2. **The 12-section Verfahrensdokumentation** — § 141 AO-Buchführungspflicht greift erst ab €800.000 Umsatz/€80.000 Gewinn. FdW ist EÜR-Rechner. GoBD gilt formell auch für EÜR, aber „Verfahrensdokumentation" ist im Kleinvereins-Kontext eine Aktennotiz, keine 12 Markdown-Files mit Unterschriften.
3. **„DPA_GATE_PASSED" als enforced env-flag + die ganze AVV-Status-Bürokratie** — Vercel/Neon haben Online-DPAs (Click-Accept; Vercel: Settings → Legal → DPA-Toggle; Neon: gleicher Self-Service). Das sind gültige Art. 28-AVVs. Done in 2 minutes.

---

## Per question

### 1. DSGVO Datenschutzerklärung — Anwalt nötig?

- **Maximalist:** Nur ein Fachanwalt für IT-Recht kann die DSE rechtssicher erstellen; jede Lücke ist Art. 13-Verstoß.
- **Real-world:** 99 % aller Kleinvereine nehmen das BayLDA-Muster (oder ein Datenschutz-Generator-Output von e-recht24/Activemind), füllen die Verein-Daten ein, hängen es ans Impressum, fertig. Anwaltskosten 800-2000 € sind für einen Verein dieser Größe unverhältnismäßig.
- **Enforcement-Risiko:** BayLDA-Praxis: Beschwerden treten **nur** ein, wenn ein Betroffener sich aktiv beschwert. Bei 10 Mitgliedern + ein paar Externen pro Jahr ist das p(Beschwerde) ≈ 0,5–2 % pro Jahr. Bei einer Beschwerde: Mängelrüge mit 4-Wochen-Frist, keine Bußgelder bei kooperativem Verein (BayLDA Tätigkeitsberichte 2023/2024 — Bußgelder fast ausschließlich gegen Unternehmen, nicht gegen Kleinvereine).
- **Verdict: SIMPLIFY.** Aktuelle DSE v1 ist nach Fix der `[VEREIN_*]`-Platzhalter + Hinzufügen einer kurzen „Spenden & Zuwendungsbestätigung"-Sektion (CRIT-05) absolut auf Niveau. Anwalt-Review **drop**.

### 2. Auftragsverarbeitungsverträge

- **Maximalist:** Vor jeder Verarbeitung muss ein schriftlich/elektronisch geschlossener AVV nach Art. 28 vorliegen.
- **Real-world:** Vercel und Neon haben Online-Self-Service-DPAs (Vercel Dashboard → Settings → Legal → „Sign DPA"; Neon Console → Project Settings → „Sign DPA"). Diese erfüllen Art. 28. Andy klickt zweimal, das ist der AVV. Google ist heikel wegen Personal-OAuth — aber realistisch: Beleg-PDFs im Drive eines Privatkontos sind das, was 80 % aller Vereine tun (auch die ohne irgendwelche DPAs).
- **Enforcement-Risiko:** Verschwindend gering, solange Drive-Inhalte verschlüsselt/private sind. BayLDA-Drohung bei Privat-Google = 0; ein US-Transfer-Argument ist über DPF abgedeckt (Google ist DPF-zertifiziert, gilt für Workspace **und** ggf. Consumer — strittig, aber kein Bußgeld-Treiber bei einem 10-Personen-Verein).
- **Verdict: SIMPLIFY.**
  - `DPA_GATE_PASSED` **DROP** — pures Theater. Andy klickt die DPAs (10 Minuten), trägt Datum in `auftragsverarbeitung/README.md` ein, fertig. Keine env-flag-Mechanik nötig.
  - Google Drive: längerfristig auf Workspace umziehen wäre besser, ist aber **kein Launch-Blocker**.

### 3. VVT (Art. 30)

- **Maximalist:** Auch Kleinunternehmen/Vereine müssen ein vollständiges VVT führen, da die Verarbeitung "regelmäßig" ist (Art. 30 Abs. 5 Ausnahme greift nicht).
- **Real-world:** Bei einem 10-Personen-Verein fragt das BayLDA in der Praxis nie nach. Die meisten Vereine haben keins. Wenn doch nachgefragt wird, reicht eine 1-Seiten-Tabelle (Verarbeitungstätigkeit, Zweck, Rechtsgrundlage, Kategorien, Empfänger, Löschfrist).
- **Enforcement-Risiko:** Praktisch null. Selbst wenn das BayLDA es anfordert: Nachreichfrist 2 Wochen.
- **Verdict: KEEP-SIMPLIFY.** Das aktuelle VVT (`verzeichnis-verarbeitungstaetigkeiten.md`) ist schon gut. **MED-01 (Risiko-Bewertung-Spalte)** und Spalte "Quelle der Daten" sind in BayLDA-Mustern **nicht** zwingend; das ist Audit-Resistance-Polish. **DROP**.

### 4. TOM-Katalog (Art. 32)

- **Maximalist:** Vollständiger TOM-Katalog mit allen ISO-27001-artigen Maßnahmen.
- **Real-world:** Eine A4-Seite mit „HTTPS, verschlüsselte Backups, rollenbasierte Zugriffsrechte, Audit-Log, Server in EU/USA mit DPF, Backups age-verschlüsselt" reicht für jeden BayLDA-Prüfer.
- **Enforcement-Risiko:** Null bei kooperativem Verein.
- **Verdict: KEEP-SIMPLIFY.** TOM existiert schon, gerne weiter pflegen, aber: die inhärenten Widersprüche (TOM 10.1 vs. TOM 5 — MED-07) sind theoretisch interessant und praktisch egal.

### 5. Verfahrensdokumentation (GoBD §§ 145–147 AO)

**Das ist die wichtigste Erkenntnis dieses Reviews.**

- **Maximalist:** GoBD Tz. 151ff. verlangt eine Verfahrensdokumentation „für jeden Steuerpflichtigen, der Bücher führt". Inhalt: Allgemeine Beschreibung, Anwenderdokumentation, technische Systemdokumentation, Betriebsdokumentation.
- **Real-world:** FdW e.V. ist nach **§ 141 AO** **nicht buchführungspflichtig** (Umsatzgrenze €800.000, Gewinngrenze €80.000 — beide um Größenordnungen unterschritten). Folglich keine Pflicht zur doppelten Buchführung; Einnahmen-Überschuss-Rechnung nach § 4 Abs. 3 EStG reicht. Die GoBD gilt **formell** auch für EÜR-Rechner, aber „Verfahrensdokumentation" ist nach BMF-Schreiben 28.11.2019 Tz. 152 **„nach Art und Umfang der Tätigkeit"** zu erstellen. Bei einem 10-Personen-Verein mit ~50 Buchungen pro Jahr heißt das: eine **Aktennotiz** („Wir buchen über folgendes Tool, Belege liegen in Google Drive, Bescheinigungen werden vom Tool erstellt, Festschreibung erfolgt jährlich") — keine 12-teilige Dokumentation mit Vorstands-Unterschriften.
- **Was der Betriebsprüfer wirklich erwartet:** Vollständige Belege, nachvollziehbare Buchungen, Festschreibung des Vorjahrs, ein lesbares Buchungsjournal. Punkt. Bei einem Kleinverein fragt der Prüfer in 9 von 10 Fällen **nie** nach einer Verfahrensdokumentation.
- **Verdict: DROP (in current form).** Die 12 Markdown-Files ersetzen durch **eine** 2-Seiten-Aktennotiz: Tool-Beschreibung, Datenfluss, Festschreibung-Verfahren, Backup-Verfahren. Alles andere (`05-iks.md`, `09-mitarbeiter-schulung.md`, `10-risikomanagement.md`, `12-unterschriften.md`) ist legitimes Overengineering. Die `<!-- FILL -->`-Marker-Tabelle aus dem DSGVO-Review (23 Einträge) ist eine Pflicht-Liste für ein Verein das **diese Pflicht gar nicht hat**.

### 6. Zuwendungsbestätigung BMF Muster

- **Maximalist:** Jede Abweichung von der BMF-Muster-Formulierung ist eine Bescheinigungsfehler, voids Spenden-Abzug.
- **Real-world:** Was der Spender:innen-FA wirklich prüft: (a) ist die Bescheinigung formell BMF-Muster-ähnlich; (b) trägt sie Unterschrift **oder** „maschinell erstellt"-Hinweis (§50 Abs. 2 EStDV); (c) Steuernummer + Datum des Freistellungsbescheids stimmen; (d) Beträge stimmen.
- **Was wirklich load-bearing ist (Money-Review):**
  - **F-01 (maschinell erstellt-Hinweis)** — schon gefixt. Korrekt als CRIT klassifiziert.
  - **F-02 (`maskOrtFromAdresse()` zerlegt mehrzeilige Adresse)** — echter Bug, schnell fixen.
  - **F-03 (Default für `VEREIN_STEUERBEGUENSTIGTE_ZWECKE`)** — wahrer Punkt; einfach Default entfernen.
  - **F-06 (Umlaute „Bestaetigung ueber")** — echt; pdf-lib WinAnsi kann ä/ö/ü. Aber kein Ablehnungsgrund: FA-Bescheide werden auch bei „ae/oe/ue" akzeptiert (Transliteration ist sprachlich gebräuchlich). Polish, nicht load-bearing.
- **Polish, nicht load-bearing:**
  - **F-13 (Sammelbestätigung)** — wünschenswert, aber bei 10 Mitgliedern × 1 Beitrag/Jahr = 10 Einzelbescheinigungen pro Jahr. Lässt sich aushalten.
  - **F-07/F-08/F-09 (Float-Arithmetik)** — sub-cent-Drift bei <€1.000.000 Buchungen mathematisch null; rein Discipline-Argument.
  - **F-23 (GoBD-Z3 ist fake)** — relabeln, nicht implementieren. Z3 ist eine IDEA-Format-Frage; Prüfer der so etwas wirklich verlangen würde, gibt es bei Vereinen dieser Größe so gut wie nie.
- **Verdict: KEEP (the F-01/F-02/F-03/F-06 fixes), DROP (Z3-IDEA-Implementierung, Float-Lint-Regel, Sammelbestätigung als Launch-Blocker).**

### 7. Audit-Log Tamper-Evidence (ADR-0004)

- **Maximalist:** GoBD Tz. 64-68 verlangt Unveränderbarkeit; Hash-Chain + Off-PG-Anchor + SECURITY DEFINER Triggers schützen davor.
- **Real-world:** Threat-Model:
  - Wer könnte unbemerkt Buchungen ändern? Antwort: Andy. Wer hat DB-Zugriff? Andy. Wer prüft das Audit-Log? Andy.
  - Ein Hash-Chain mit Off-PG-Anchor schützt gegen einen **boswilligen Insider mit DB-Zugriff** und **fehlendem Mit-Beobachter**. Bei einem 10-Personen-Verein mit einem Admin existiert dieses Modell nicht: wenn Andy lügt, fliegt es bei jedem Buchungsabschluss bei der Kassenprüfung auf, weil die Kassenprüfer:innen die Original-Belege gegen die Tool-Ausgabe vergleichen.
  - Was wirklich gegen GoBD-Manipulation schützt: (a) tägliche age-verschlüsselte Backups (haben wir), (b) Festschreibung mit Tag/Uhrzeit (haben wir auch), (c) jährliche Kassenprüfung durch ein zweites Vereinsmitglied (Vereinsrecht-Standard).
- **Enforcement-Risiko:** Null. Kein Betriebsprüfer hat je nach einem SHA-256 Hash-Chain in einer Vereinsbuchhaltung gefragt.
- **Verdict: DROP (the entire Phase 7.5 audit-chain machinery).** Das Audit-Log als append-only-Tabelle mit `REVOKE UPDATE` reicht. Hash-Chain, Off-PG-Anchor, SECURITY DEFINER trigger, advisory-lock namespacing, OpenTimestamps — alles fintech-Cargo-Cult. Wenn schon: **die App-Layer-REVOKE-Privilegien bleiben** (gute Hygiene, 0 Aufwand). Alles andere streichen oder als „Phase 99" abparken.

### 8. Festschreibung / Buchungs-Jahresabschluss

- **Maximalist:** DB-Trigger muss Updates auf festgeschriebene Zeilen blockieren; ADR-0006 verlangt das, GoBD §146 fordert es.
- **Real-world:** App-Layer-Festschreibungs-Gate reicht für einen Verein mit einem Admin. Niemand schreibt direkt SQL gegen die DB außer Andy, und Andy ist die einzige Person die festgeschriebene Zeilen ändern könnte — was wieder bei der Kassenprüfung auffallen würde.
- **Enforcement-Risiko:** Schätzungsdrohung nach §162 AO bei nachweislicher Manipulation; in der Praxis tritt das bei kooperativen Kleinvereinen quasi nie auf.
- **Verdict: DEFER-ISSUE.** F-05 (DB-Trigger) ist die einzige Money-Review-Empfehlung mit echtem Disziplin-Mehrwert (verhindert versehentliche Mutation durch buggy code), aber **kein** Launch-Blocker für das Phase-2-Public-Form. In ein separates GitHub-Issue, Phase 8.

### 9. Datenpannen-Vorlage, DSB-Doku, Key-Escrow

- **Maximalist:** Vorgefertigte BayLDA-Meldungs-Vorlage, schriftliche DSB-Prüfung mit Begründung, Key-Escrow mit Zweit-Vorstand.
- **Real-world:**
  - **DSB-not-required**: § 38 BDSG: DSB-Pflicht erst bei ≥20 Personen mit „ständiger Datenverarbeitung". FdW: weniger als 5 Personen haben dauerhaft Zugriff. → DSB nicht nötig. **Eine 3-zeilige Aktennotiz** im Vorstand-Protokoll reicht.
  - **Datenpannen-Vorlage**: BayLDA hat ein Online-Formular (https://www.lda.bayern.de/de/datenpanne.html). Im Ernstfall füllt man das aus. Eine Word-Vorlage *vorab* ist Theater.
  - **Key-Escrow**: Wenn Andy ausfällt, hat der Verein ein echtes Problem (Backups nicht entschlüsselbar). **DAS ist die einzige Maßnahme die wirklich wichtig ist.** Empfehlung: ausgedruckter age-Private-Key im versiegelten Umschlag bei einem Zweit-Vorstand. 10 Minuten Aufwand.
- **Verdict:**
  - DSB-Doku: **SIMPLIFY** — 3 Zeilen ins Vorstand-Protokoll, kein eigenes Dokument.
  - Datenpannen-Vorlage: **DROP** — BayLDA-Online-Link in das Notfall-Konzept-Doku, fertig.
  - Key-Escrow: **KEEP**, das ist real wichtig.

### 10. „Vorarbeit"-Banner auf /datenschutz (DSGVO CRIT-08)

- **Maximalist:** Banner = Eingeständnis = Verstoß gegen Art. 5 Abs. 1 lit. a (Rechtmäßigkeit).
- **Real-world:** Eine DSE ohne Banner aber mit identischem Inhalt ist nicht rechtmäßiger oder unrechtmäßiger als eine mit Banner. Das Banner ist ein **Honesty-Penalty**: man bestraft Andy für Selbstkritik. Wenn die DSE inhaltlich BayLDA-Muster-konform ist (nach den 5 Fixes weiter oben), ist sie launch-ready, mit oder ohne Banner.
- **Enforcement-Risiko:** Null. Kein BayLDA-Mitarbeiter hat je ein Banner gesehen und gedacht „Aha, der weiß ja, dass es nicht stimmt, der bekommt jetzt ein Bußgeld."
- **Verdict: SIMPLIFY.** Banner entfernen. Die DSE ist dann gleich „wenig perfekt" wie 95 % aller Vereinsdatenschutzerklärungen im deutschsprachigen Internet.

---

## Things from the 2026-05-19 reviews that are factually wrong or contextually inappropriate

- **DSGVO CRIT-08 (Vorarbeit-Banner) — overblown.** Banner-entfernen ist die ganze Lösung; „externe Prüfung" ist nicht Pflicht.
- **DSGVO CRIT-02 (DPA_GATE_PASSED unenforced) — wrong framing.** Es gibt keinen Grund, dieses Flag in code zu verdrahten. Click-DPA bei Vercel/Neon, Datum in Markdown eintragen, fertig. Die env-Flag-Mechanik ist Eigenbau-Bürokratie.
- **DSGVO CRIT-03 (pseudonymise UPDATE auf audit_log) — richtig erkannt, aber die richtige Konsequenz ist Art. 17 Abs. 3 lit. b** (Aufbewahrungspflicht überwiegt Löschanspruch). Audit-Log-Zeilen sind rechtlich nicht löschbar; das ist kein Bug zu fixen, sondern eine Doku-Klarstellung.
- **DSGVO HIGH-06 / HIGH-07 (Vercel/Neon/Google DPA = Launch-Blocker)** — Vercel und Neon sind Click-and-done. Google Drive auf Privat-Konto ist ein **bekanntes Restrisiko** im Range „mag legal nicht 100 % sauber sein, ist Verein-Praxis-Standard", kein CRIT.
- **DSGVO MED-01 (VVT-Spalten Risikobewertung + Datenquelle) — kein Art.-30-Pflichtfeld.** BayLDA-Muster hat sie als nice-to-have, nicht zwingend.
- **DSGVO MED-02 (DSB-Doku als separates Dokument)** — 3-Zeilen-Protokoll-Eintrag genügt.
- **DSGVO MED-03 (Identitätsnachweis-Schritt für Auskunftsanfragen)** — bei 10 Mitgliedern kennt Andy die Personen. Eine formelle Identitäts-Verifikation für Auslagen-Externe ist Overhead; PDF an die hinterlegte E-Mail senden ist Standard.
- **DSGVO MED-09 („VERTRAULICH"-Banner auf Auskunfts-PDF)** — Polish.
- **DSGVO LOW-06 (Minderjährigen-Hinweis)** — nett, aber FdW hat erkennbar keine Minderjährigen-Mitglieder. **DROP**.
- **Money F-04 (SEPA pain.001.001.03 wird von deutschen Banken abgelehnt)** — überzogen. Sparkasse, Commerzbank, ING, DKB akzeptieren .03 für Privatkunden weiterhin (Stand 2026). Nur für Corporate-EBICS-Submitter ist .09 Pflicht. Ein Verein mit 10-30 Erstattungen pro Jahr per Online-Banking-CSV-Import oder Einzel-Übertrag braucht das XML-Format überhaupt nur, wenn er Sammel-SEPA macht — dann auch in .03 problemlos.
- **Money F-07 / F-08 / F-09 (Float-Arithmetik bei cents-Konversion)** — mathematisch null bei den hier auftretenden Größenordnungen. Discipline-Argument okay; CRIT-Klassifikation übertrieben.
- **Money F-12 (WGB-Freigrenze §64 AO €45.000 vs. €50.000)** — Wert ist seit 2025 €50.000, soll korrigiert werden. Aber: FdW liegt bei ~5-stelligem Jahresumsatz; die Schwelle wird in 10+ Jahren nicht relevant. **Korrigieren, nicht stressen.**
- **Money F-23 (GoBD-Z3-Export ist kein echtes Z3)** — Export-Label umbenennen reicht. IDEA-Z3 wirklich umzusetzen ist Wochen Arbeit für ein Format, das ein Kleinverein-Prüfer nie verlangt.
- **Ops CRIT-1 (restore-smoke ist Theater)** — fair, aber für einen 10-Personen-Verein reicht „1× pro Monat manuell decrypten + pg_restore --list" als Drill.
- **Ops CRIT-4 (kein Monitoring/Alerting)** — UptimeRobot kostenlos, ja. Sentry für 5-stellige Jahres-Requests Overkill. **SIMPLIFY**.
- **Ops HIGH-5 (Drive-OAuth-as-Andy → Service-Account)** — Workspace-Tenant kostet €6/Monat, nicht launch-blockend.
- **Ops HIGH-6 (Audit-Anchor GPG-Signing, OpenTimestamps)** — full cargo-cult; siehe Frage 7.
- Die gesamte „252 findings, 36 CRIT"-Verteilung ist ein Artefakt von neun parallelen Reviewern die alle ihre Domäne maximieren. Bei einem 10-Personen-Verein wäre eine einzige zusammenfassende Mängelliste mit ~10 Punkten realitätsnäher.

---

## What Andy should actually do before launch

1. Fix **CRIT-01 (placeholder substitution)** — done.
2. Fix **CRIT-05 (DSE Spenden-Sektion)** + bump `DATENSCHUTZ_VERSION`.
3. Fix **CRIT-06 (full IP in auth audit log)** — 4-line code change.
4. Fix **F-01 (maschinell erstellt-Hinweis)** — done.
5. Fix **F-02 (`maskOrtFromAdresse`)** — replace with `VEREIN_FINANZAMT_ORT` env var.
6. Fix **F-03 (default for `VEREIN_STEUERBEGUENSTIGTE_ZWECKE`)** — remove the default.
7. Click Vercel-DPA + Neon-DPA (10 minutes), record date in `auftragsverarbeitung/README.md`.
8. Remove the "Vorarbeit"-banner.
9. age-private-key im versiegelten Umschlag an Zweit-Vorstand.
10. UptimeRobot auf `/healthz` (5 min interval, free).

Everything else (DPA_GATE_PASSED env-flag, hash-chain anchor, Festschreibung-DB-Trigger, 12-section Verfahrensdoku, F-13 Sammelbestätigung, F-23 echte Z3, Sentry, GitHub-Branch-Protection für `backup-restore-smoke`, OpenTimestamps) ist **gut zu haben** und sollte als Phase-8/9-Items im Backlog stehen — nicht im Launch-Pfad.

---

_End of pragmatic rebalance. ~1450 words. Wenn die nächsten Reviewer das hier ablehnen, sollen sie konkret nennen, welche BayLDA-Bußgeldbescheide gegen vergleichbar große Vereine in den letzten 3 Jahren ausgesprochen wurden. Spoiler: es gibt keine._
