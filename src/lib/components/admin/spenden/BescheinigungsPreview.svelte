<script lang="ts">
	type Preview = {
		vereinName: string;
		vereinSteuernummer: string;
		vereinVr: string;
		vereinAdresse: string;
		bescheidTyp: string;
		bescheidDatum: string;
		satzungsFassung: string | null;
		freistellungsbescheidVz: string | null;
		steuerbegueZwecke: string;
		spenderName: string;
		spenderAdresse: string;
		spendeDatum: string;
		betragCents: number;
		betragInWorten: string;
		spendeKind: string;
		sacheBeschreibung: string | null;
		zweckbindungKind: string;
		zweckbindungText: string | null;
		bescheinigungNr: string;
		ausgestelltAm: string;
	};

	let { preview }: { preview: Preview } = $props();

	const fmt = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: 'EUR',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});

	const dateRe = /^(\d{4})-(\d{2})-(\d{2})/;
	const dateDe = (iso: string) => {
		const m = dateRe.exec(iso);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
	};

	const bescheidLabel = (t: string) => {
		if (t === 'freistellungsbescheid') return 'Freistellungsbescheid';
		if (t === 'feststellung_60a') return 'Feststellung §60a AO';
		return '—';
	};
</script>

<section
	class="space-y-4 rounded-xl border border-border bg-card px-5 py-5 text-sm"
	data-testid="bescheinigung-preview"
>
	<header class="border-b border-border pb-3">
		<p class="text-xs uppercase tracking-wide text-muted-foreground">Vorschau</p>
		<h2 class="mt-1 text-lg font-semibold">Zuwendungsbestätigung</h2>
		<p class="text-xs text-muted-foreground">
			Bescheinigungs-Nr <strong data-testid="bescheinigung-nr">{preview.bescheinigungNr}</strong>
			&middot; ausgestellt am {dateDe(preview.ausgestelltAm)}
		</p>
	</header>

	<dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Verein</dt>
			<dd class="font-medium">{preview.vereinName}</dd>
			<dd class="text-xs text-muted-foreground">{preview.vereinAdresse}</dd>
			<dd class="text-xs text-muted-foreground">
				Steuernr. {preview.vereinSteuernummer} &middot; {preview.vereinVr}
			</dd>
		</div>
		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Spender</dt>
			<dd class="font-medium" data-testid="preview-spender">{preview.spenderName}</dd>
			<dd class="whitespace-pre-line text-xs text-muted-foreground">
				{preview.spenderAdresse}
			</dd>
		</div>

		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Art der Zuwendung</dt>
			<dd>{preview.spendeKind === 'sachspende' ? 'Sachzuwendung' : 'Geldzuwendung'}</dd>
		</div>
		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Tag der Zuwendung</dt>
			<dd data-testid="preview-zugewendet-am">{dateDe(preview.spendeDatum)}</dd>
		</div>

		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Betrag</dt>
			<dd class="text-base font-semibold tabular-nums" data-testid="preview-betrag">
				{fmt(preview.betragCents)}
			</dd>
		</div>
		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">In Worten</dt>
			<dd data-testid="preview-betrag-in-worten">{preview.betragInWorten}</dd>
		</div>

		{#if preview.spendeKind === 'sachspende' && preview.sacheBeschreibung}
			<div class="sm:col-span-2">
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">
					Beschreibung der Sachzuwendung
				</dt>
				<dd>{preview.sacheBeschreibung}</dd>
			</div>
		{/if}

		{#if preview.zweckbindungKind === 'zweckgebunden' && preview.zweckbindungText}
			<div class="sm:col-span-2">
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Zweckbindung</dt>
				<dd>{preview.zweckbindungText}</dd>
			</div>
		{/if}

		<div class="sm:col-span-2">
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Bescheid-Grundlage</dt>
			<dd data-testid="preview-bescheid-typ">
				{bescheidLabel(preview.bescheidTyp)} vom {dateDe(preview.bescheidDatum)}
				{#if preview.satzungsFassung}
					&middot; Satzung vom {dateDe(preview.satzungsFassung)}
				{/if}
				{#if preview.freistellungsbescheidVz}
					&middot; VZ {preview.freistellungsbescheidVz}
				{/if}
			</dd>
		</div>

		<div class="sm:col-span-2">
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">
				Steuerbegünstigte Zwecke
			</dt>
			<dd>{preview.steuerbegueZwecke}</dd>
		</div>
	</dl>

	<p class="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
		Diese Vorschau spiegelt die Pflichtangaben aus dem aktuellen BMF-Vordruck wider. Der
		Download liefert die endg&uuml;ltige PDF-Bescheinigung mit Unterschriftsfeld.
	</p>
</section>
