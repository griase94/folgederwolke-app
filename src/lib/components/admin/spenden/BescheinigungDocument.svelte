<!--
	BescheinigungDocument — the amtsvordruck WYSIWYG preview body: shows, near
	verbatim, what the Zuwendungsbestätigung PDF will say. Composes the DocSheet
	paper primitive with the shared BMF-Wortlaut (bmfTitel/bmfSubtitle/
	bmfBescheidText/…) so the on-screen text and the issued PDF cannot drift
	(proof: bescheinigung-wortlaut.test.ts).

	Secondary on-paper text uses the DocSheet-exposed --dp-* vars (dark ink on
	light paper in BOTH themes); NEVER theme text tokens (they invert + vanish).
-->
<script lang="ts" module>
  import { DocSheet } from "$lib/components/ui/doc-sheet/index.js";
  import { formatCentsAsEuro } from "$lib/domain/money.js";
  import {
    bmfTitel,
    bmfSubtitle,
    bmfVerzichtSatz,
    bmf50Hinweis,
    bmfHaftungHinweis,
    bmfBescheidText,
    formatGermanDate,
  } from "$lib/domain/bescheinigung-wortlaut.js";

  export interface BescheinigungPreview {
    vereinName: string;
    vereinSteuernummer: string;
    vereinVr: string;
    vereinAdresse: string; // newline-joined
    vereinFinanzamt: string;
    bescheidTyp: "freistellungsbescheid" | "feststellung_60a";
    bescheidDatum: string;
    satzungsFassung: string | null;
    freistellungsbescheidVz: string | null;
    steuerbegueZwecke: string;
    spenderName: string;
    spenderAdresse: string;
    spendeDatum: string;
    betragCents: number;
    betragInWorten: string;
    spendeKind: "geldspende" | "sachspende";
    sacheBeschreibung: string | null;
    zweckbindungKind: "zweckfrei" | "zweckgebunden";
    zweckbindungText: string | null;
    bescheinigungNr: string;
    ausgestelltAm: string;
  }

  /** Ort for the DIN foot — the city line (PLZ + name) of a stacked address. */
  function ortFromAdresse(adr: string): string {
    const lines = adr
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const m = /^\d{4,5}\s+(.+)$/.exec(line);
      if (m?.[1]) return m[1];
    }
    return lines[lines.length - 1] ?? adr;
  }
</script>

<script lang="ts">
  let {
    preview,
    "data-testid": testId = "bescheinigung-document",
  }: { preview: BescheinigungPreview; "data-testid"?: string } = $props();

  const isSach = $derived(preview.spendeKind === "sachspende");
  // A real Bescheinigungs-Nr. (B-JJJJ-NNN) vs the pre-issue placeholder the load
  // supplies ("(noch nicht vergeben)").
  const hasNr = $derived(/^B-\d{4}-\d+/.test(preview.bescheinigungNr));
  const bescheidText = $derived(
    bmfBescheidText({
      bescheidTyp: preview.bescheidTyp,
      steuerbegueZwecke: preview.steuerbegueZwecke,
      vereinFinanzamt: preview.vereinFinanzamt,
      vereinSteuernummer: preview.vereinSteuernummer,
      bescheidDatum: preview.bescheidDatum,
      freistellungsbescheidVz: preview.freistellungsbescheidVz,
      satzungsFassung: preview.satzungsFassung,
    }),
  );
  const vereinAdresseLines = $derived(
    preview.vereinAdresse.split(/\n/).filter((l) => l.trim().length > 0),
  );
  const spenderAdresseLines = $derived(
    preview.spenderAdresse
      .split(/\n|,/)
      .map((l) => l.trim())
      .filter(Boolean),
  );
</script>

<DocSheet
  eyebrow="Vorschau · so wird das PDF ausgestellt"
  title={bmfTitel(preview.spendeKind)}
  subtitle={bmfSubtitle()}
  data-testid={testId}
>
  <p class="doc-idline">
    Bescheinigungs-Nr.
    {#if hasNr}<b>{preview.bescheinigungNr}</b>{:else}<span
        class="doc-idpending">wird beim Ausstellen vergeben</span
      >{/if}
  </p>

  <div class="doc-rule strong"></div>

  <div class="doc-cols">
    <div class="doc-block">
      <span class="doc-lbl">Aussteller</span>
      <div class="doc-val">
        <b>{preview.vereinName}</b>
        {#each vereinAdresseLines as line (line)}<br />{line}{/each}
        <br />Steuernummer {preview.vereinSteuernummer}
        <br />Vereinsregister {preview.vereinVr}
      </div>
    </div>
    <div class="doc-block">
      <span class="doc-lbl">Zuwendende Person</span>
      <div class="doc-val">
        <b>{preview.spenderName}</b>
        {#each spenderAdresseLines as line (line)}<br />{line}{/each}
      </div>
    </div>
  </div>

  <div class="doc-rule"></div>

  {#if isSach && preview.sacheBeschreibung}
    <div class="doc-block">
      <span class="doc-lbl">Genaue Bezeichnung der Sachzuwendung</span>
      <div class="doc-val">{preview.sacheBeschreibung}</div>
    </div>
  {:else}
    <div class="doc-block">
      <span class="doc-lbl">Art der Zuwendung</span>
      <div class="doc-val">
        Geldzuwendung · Tag der Zuwendung: {formatGermanDate(
          preview.spendeDatum,
        )}
      </div>
    </div>
  {/if}

  <div class="doc-amount">
    <span class="da-lbl"
      >{isSach ? "Wert der Zuwendung" : "Betrag der Zuwendung"}</span
    >
    <span class="da-val">{formatCentsAsEuro(BigInt(preview.betragCents))}</span>
  </div>
  <p class="doc-words">
    In Worten: <b>{preview.betragInWorten}</b
    >{#if isSach}&nbsp;·&nbsp;{formatGermanDate(preview.spendeDatum)}{/if}
  </p>

  {#if preview.zweckbindungKind === "zweckgebunden" && preview.zweckbindungText}
    <p class="doc-para">Zweckbindung: {preview.zweckbindungText}</p>
  {/if}

  <p class="doc-para">{bmfVerzichtSatz()}</p>

  <div class="doc-rule"></div>

  {#each bescheidText as para (para)}
    <p class="doc-para">{para}</p>
  {/each}

  <div class="doc-foot">
    <span class="df-place"
      >{ortFromAdresse(preview.vereinAdresse)}, {formatGermanDate(
        preview.ausgestelltAm,
      )}</span
    >
    <div class="doc-sig">
      <div class="sig-line">{preview.vereinName} · Vorstand</div>
    </div>
  </div>
  <p class="doc-note">{bmf50Hinweis()}</p>
  <p class="doc-note">{bmfHaftungHinweis()}</p>
</DocSheet>

<style>
  /* Body classes for the amtsvordruck (kit-ext doc-sheet.css). They read the
     DocSheet-exposed --dp-* vars, which inherit down from the .doc-sheet
     container — so the sheet stays physical paper (light) in both themes. */
  .doc-rule {
    height: 0;
    border-top: 1px solid var(--dp-line);
    margin: 16px 0;
  }
  .doc-rule.strong {
    border-top-color: var(--dp-line2);
  }
  .doc-idline {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--dp-ink2);
  }
  .doc-idline b {
    font-weight: 700;
    color: var(--dp-ink);
    font-variant-numeric: tabular-nums;
  }
  .doc-idpending {
    color: var(--dp-faint);
    font-style: italic;
  }
  .doc-block {
    margin: 14px 0;
  }
  .doc-lbl {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dp-faint);
    margin-bottom: 4px;
  }
  .doc-val {
    font-size: 13px;
    line-height: 1.5;
    color: var(--dp-ink);
  }
  .doc-val b {
    font-weight: 700;
  }
  .doc-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .doc-amount {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 15px;
    border-radius: 10px;
    background: var(--dp-accent-tint);
    margin: 16px 0 8px;
  }
  .doc-amount .da-lbl {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dp-accent);
  }
  .doc-amount .da-val {
    font-size: 22px;
    font-weight: 800;
    color: var(--dp-accent);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .doc-words {
    font-size: 12px;
    color: var(--dp-ink2);
    margin: 0 0 12px;
  }
  .doc-words b {
    font-weight: 700;
    font-style: italic;
  }
  .doc-para {
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--dp-ink2);
    margin: 8px 0;
  }
  .doc-note {
    font-size: 10.5px;
    line-height: 1.55;
    color: var(--dp-faint);
    margin-top: 4px;
  }
  .doc-foot {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
    margin-top: 22px;
  }
  .doc-foot .df-place {
    font-size: 12px;
    color: var(--dp-ink2);
  }
  .doc-sig {
    min-width: 200px;
    text-align: center;
  }
  .doc-sig .sig-line {
    border-top: 1px solid var(--dp-faint);
    padding-top: 6px;
    font-size: 10.5px;
    color: var(--dp-faint);
  }
  @media (max-width: 440px) {
    .doc-cols {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }
</style>
