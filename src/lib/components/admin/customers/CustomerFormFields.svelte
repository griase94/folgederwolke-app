<!--
	CustomerFormFields — the shared Add/Edit field set (modal-kunde.md §4).

	ONE field component for both dialogs. Field ORDER follows the invoice reading
	order: Name → Anrede → Adresse (strukturiert) → Land → E-Mail → Notizen.

	Andy-Feedback 2026-07: the address is STRUCTURED (Straße+Hausnr / PLZ / Ort)
	and MANDATORY — the old free-text block was error-prone. A live BRIEFBLOCK
	preview shows exactly how the address lands on the Rechnung as you type.
	Validation is server-authoritative (`errors` echoes the 422 field map); the
	`required` + `*` are client comfort. PLZ format (German 5-digit) is checked
	server-side and surfaces here via `errors.plz`.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import type { CustomerView } from '$lib/server/domain/customers.js';
	import { buildCustomerBriefblock } from '$lib/domain/customers.js';

	let {
		idPrefix,
		values = null,
		errors = {},
		name = $bindable('')
	}: {
		/** Distinguishes add-/edit-dialog input ids so both can mount at once. */
		idPrefix: string;
		values?: CustomerView | null;
		errors?: Record<string, string[]>;
		/** Bound to the Name input so the parent can gate its submit CTA. */
		name?: string;
	} = $props();

	function err(key: string): string | undefined {
		return errors[key]?.[0];
	}

	// Structured address is bound so the live Briefblock preview updates as the
	// user types. Seeded once from `values` (edit route / post-fail echo) via a
	// one-shot hydration $effect — starting the state at a literal avoids the
	// `state_referenced_locally` warning (CI runs --fail-on-warnings).
	let adresszusatz = $state('');
	let strasse = $state('');
	let plz = $state('');
	let ort = $state('');
	let land = $state('Deutschland');
	let hydrated = false;
	$effect(() => {
		if (hydrated) return;
		hydrated = true;
		adresszusatz = values?.adresszusatz ?? '';
		strasse = values?.strasse ?? '';
		plz = values?.plz ?? '';
		ort = values?.ort ?? '';
		land = values?.land ?? 'Deutschland';
	});

	const briefblock = $derived(
		buildCustomerBriefblock({ adresszusatz, strasse, plz, ort, land })
	);
	const previewLines = $derived(briefblock ? briefblock.split('\n') : []);

	const textareaClass =
		'border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 sm:text-sm aria-invalid:border-destructive aria-invalid:ring-destructive/20';
</script>

<!-- required-field legend -->
<div
	class="flex items-start gap-2.5 rounded-xl border border-hairline bg-muted px-3 py-2.5 text-xs leading-relaxed text-ink-500"
>
	<svg class="mt-px h-4 w-4 shrink-0 text-primary-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<circle cx="12" cy="12" r="10" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01" />
	</svg>
	<span>
		<b class="font-semibold text-ink-700">Name</b> und <b class="font-semibold text-ink-700">Adresse</b>
		<span class="text-severity-critical">*</span> braucht jede Rechnung — die Adresse erscheint 1:1 im Rechnungskopf.
	</span>
</div>

<!-- Name * -->
<div class="space-y-1.5">
	<label for="{idPrefix}-name" class="block text-sm font-medium text-ink-700">
		Name (Firma / Person) <span class="text-severity-critical">*</span>
	</label>
	<Input
		id="{idPrefix}-name"
		name="name"
		required
		bind:value={name}
		data-testid="{idPrefix}-name-input"
		placeholder="z. B. Muster GmbH oder Max Mustermann"
		aria-invalid={!!err('name')}
		aria-describedby={err('name') ? `${idPrefix}-name-err` : undefined}
	/>
	{#if err('name')}
		<p id="{idPrefix}-name-err" class="text-xs font-medium text-severity-critical">{err('name')}</p>
	{/if}
</div>

<!-- Anrede -->
<div class="space-y-1.5">
	<label for="{idPrefix}-anrede" class="block text-sm font-medium text-ink-700">Anrede</label>
	<Input
		id="{idPrefix}-anrede"
		name="anrede"
		value={values?.anrede ?? ''}
		placeholder="z. B. „Liebe Maria“"
		aria-invalid={!!err('anrede')}
	/>
	<p class="text-xs text-ink-500">Steht so in Mails: „Liebe Maria“ oder „Sehr geehrte Damen und Herren“.</p>
	{#if err('anrede')}
		<p class="text-xs font-medium text-severity-critical">{err('anrede')}</p>
	{/if}
</div>

<!-- Adresse (strukturiert) * + Live-Briefblock. sm:[&_input]:scroll-mb-32 hält
     ein fokussiertes Adressfeld beim Auto-Scroll ÜBER der sticky Preview (sonst
     landet es dahinter) — Judge-#151 Major-1. -->
<div class="space-y-2.5 rounded-xl border border-hairline bg-card p-3 sm:[&_input]:scroll-mb-32">
	<div class="flex items-center gap-1.5">
		<span class="text-sm font-semibold text-ink-700">Adresse</span>
		<span class="text-severity-critical">*</span>
	</div>

	<!-- Adresszusatz (optional) — DIN 5008: eigene Zeile zwischen Name und Straße -->
	<div class="space-y-1.5">
		<label for="{idPrefix}-adresszusatz" class="block text-xs font-medium text-ink-600">Adresszusatz (optional)</label>
		<Input
			id="{idPrefix}-adresszusatz"
			name="adresszusatz"
			bind:value={adresszusatz}
			data-testid="{idPrefix}-adresszusatz-input"
			placeholder="z. B. z. Hd. Frau Müller · c/o · Gebäude B"
			aria-invalid={!!err('adresszusatz')}
		/>
		{#if err('adresszusatz')}
			<p class="text-xs font-medium text-severity-critical">{err('adresszusatz')}</p>
		{/if}
	</div>

	<!-- Straße + Hausnr -->
	<div class="space-y-1.5">
		<label for="{idPrefix}-strasse" class="block text-xs font-medium text-ink-600">Straße &amp; Hausnr.</label>
		<Input
			id="{idPrefix}-strasse"
			name="strasse"
			required
			bind:value={strasse}
			data-testid="{idPrefix}-strasse-input"
			placeholder="z. B. Musterstraße 1"
			aria-invalid={!!err('strasse')}
			aria-describedby={err('strasse') ? `${idPrefix}-strasse-err` : undefined}
		/>
		{#if err('strasse')}
			<p id="{idPrefix}-strasse-err" class="text-xs font-medium text-severity-critical">{err('strasse')}</p>
		{/if}
	</div>

	<!-- PLZ + Ort (Fehler in der jeweiligen Spalte, nicht vollbreit) -->
	<div class="grid grid-cols-[minmax(0,7rem)_1fr] gap-2.5">
		<div class="space-y-1.5">
			<label for="{idPrefix}-plz" class="block text-xs font-medium text-ink-600">PLZ</label>
			<Input
				id="{idPrefix}-plz"
				name="plz"
				required
				inputmode="numeric"
				bind:value={plz}
				data-testid="{idPrefix}-plz-input"
				placeholder="80331"
				aria-invalid={!!err('plz')}
				aria-describedby={err('plz') ? `${idPrefix}-plz-err` : undefined}
			/>
			{#if err('plz')}
				<p id="{idPrefix}-plz-err" class="text-xs font-medium text-severity-critical">{err('plz')}</p>
			{/if}
		</div>
		<div class="space-y-1.5">
			<label for="{idPrefix}-ort" class="block text-xs font-medium text-ink-600">Ort</label>
			<Input
				id="{idPrefix}-ort"
				name="ort"
				required
				bind:value={ort}
				data-testid="{idPrefix}-ort-input"
				placeholder="München"
				aria-invalid={!!err('ort')}
				aria-describedby={err('ort') ? `${idPrefix}-ort-err` : undefined}
			/>
			{#if err('ort')}
				<p id="{idPrefix}-ort-err" class="text-xs font-medium text-severity-critical">{err('ort')}</p>
			{/if}
		</div>
	</div>

	<!-- Land (optional, Freitext, halbbreit) — nur ≠ Deutschland erscheint im Briefblock -->
	<div class="space-y-1.5">
		<label for="{idPrefix}-land" class="block text-xs font-medium text-ink-600">Land</label>
		<Input
			id="{idPrefix}-land"
			name="land"
			bind:value={land}
			data-testid="{idPrefix}-land-input"
			placeholder="Deutschland"
			aria-invalid={!!err('land')}
			class="sm:max-w-[240px]"
		/>
		<p class="text-xs text-ink-500">Nur wenn nicht Deutschland — dann steht das Land mit auf der Rechnung.</p>
		{#if err('land')}
			<p class="text-xs font-medium text-severity-critical">{err('land')}</p>
		{/if}
	</div>

	<!-- Mobile-Sheet: inline-Preview im Adressblock (unverändert — sitzt dort perfekt). -->
	<div
		class="rounded-lg border border-dashed border-hairline bg-muted/40 px-3 py-2.5 sm:hidden"
		data-testid="{idPrefix}-address-preview"
	>
		{@render addressPreviewBody()}
	</div>
</div>

<!-- E-Mail -->
<div class="space-y-1.5">
	<label for="{idPrefix}-email" class="block text-sm font-medium text-ink-700">E-Mail</label>
	<Input
		id="{idPrefix}-email"
		name="email"
		type="email"
		autocomplete="email"
		value={values?.email ?? ''}
		placeholder="rechnung@kunde.de"
		aria-invalid={!!err('email')}
		aria-describedby={err('email') ? `${idPrefix}-email-err` : undefined}
	/>
	<p class="text-xs text-ink-500">Nötig, um die Rechnung „Per Mail senden“ zu können.</p>
	{#if err('email')}
		<p id="{idPrefix}-email-err" class="text-xs font-medium text-severity-critical">{err('email')}</p>
	{/if}
</div>

<!-- Notizen -->
<div class="space-y-1.5">
	<label for="{idPrefix}-notes" class="block text-sm font-medium text-ink-700">Notizen</label>
	<textarea
		id="{idPrefix}-notes"
		name="notes"
		rows="2"
		class={textareaClass}
		placeholder="Interne Notiz — erscheint nicht auf der Rechnung"
		>{values?.notes ?? ''}</textarea
	>
</div>

<!-- sm+: dieselbe Preview STICKY am unteren Rand des Modal-Scroll-Containers
     (Judge-#151 Major-1) — sitzt NACH allen Eingaben, überlappt also kein Feld,
     und bleibt beim Tippen sichtbar. Opak (bg-card) + Schatten, damit gescrollte
     Felder nicht durchscheinen. Mobile nutzt die inline-Kopie oben. -->
<div
	class="hidden sm:sticky sm:bottom-0 sm:z-10 sm:block sm:rounded-lg sm:border sm:border-dashed sm:border-hairline sm:bg-card sm:px-3 sm:py-2.5 sm:shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.3)]"
	data-testid="{idPrefix}-address-preview-sticky"
>
	{@render addressPreviewBody()}
</div>

{#snippet addressPreviewBody()}
	<p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">So auf der Rechnung</p>
	{#if previewLines.length > 0}
		<address class="text-sm not-italic leading-snug text-ink-700">
			{#if name.trim()}<div class="font-semibold text-ink-900">{name.trim()}</div>{/if}
			{#each previewLines as line (line)}<div>{line}</div>{/each}
		</address>
	{:else}
		<p class="text-sm italic text-ink-400">Adresse eingeben — Vorschau erscheint hier.</p>
	{/if}
{/snippet}
