<!--
	CustomerFormFields — the shared Add/Edit field set (modal-kunde.md §4).

	ONE field component for both dialogs (brief recommendation — the two used to
	duplicate the markup). Field ORDER follows the invoice reading order
	(brief §1.3 / spec §2.5, ratified): Name → Anrede → Adresse → Land → E-Mail
	→ Notizen. Hints explain the CONSEQUENCE (where the value lands on the
	Rechnung / Mail), never the obvious. Validation is server-authoritative;
	`errors` echoes the 422 field map, `required` on Name is client comfort only.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import type { CustomerView } from '$lib/server/domain/customers.js';

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

	const COUNTRIES: Array<[string, string]> = [
		['DE', 'Deutschland'],
		['AT', 'Österreich'],
		['CH', 'Schweiz'],
		['FR', 'Frankreich'],
		['IT', 'Italien'],
		['NL', 'Niederlande'],
		['BE', 'Belgien'],
		['LU', 'Luxemburg'],
		['GB', 'Vereinigtes Königreich'],
		['US', 'Vereinigte Staaten'],
		['ES', 'Spanien']
	];

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
		Nur der <b class="font-semibold text-ink-700">Name</b> muss sein
		<span class="text-severity-critical">*</span> — der Rest ist Kür. Der Adressblock
		erscheint 1:1 im Rechnungskopf.
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

<!-- Adressblock -->
<div class="space-y-1.5">
	<label for="{idPrefix}-address" class="block text-sm font-medium text-ink-700">Adressblock</label>
	<textarea
		id="{idPrefix}-address"
		name="address_block"
		rows="3"
		class={textareaClass}
		aria-invalid={!!err('address_block')}
		placeholder="Zeile für Zeile — genau so, wie es auf dem Rechnungs-PDF stehen soll"
		>{values?.addressBlock ?? ''}</textarea
	>
	<p class="text-xs text-ink-500">Genau so, Zeile für Zeile, auf dem Rechnungs-PDF.</p>
	{#if err('address_block')}
		<p class="text-xs font-medium text-severity-critical">{err('address_block')}</p>
	{/if}
</div>

<!-- Land -->
<div class="space-y-1.5">
	<label for="{idPrefix}-country" class="block text-sm font-medium text-ink-700">Land</label>
	<select
		id="{idPrefix}-country"
		name="country"
		class="border-input bg-background focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
	>
		{#each COUNTRIES as [code, label] (code)}
			<option value={code} selected={(values?.country ?? 'DE') === code}>{label}</option>
		{/each}
	</select>
	<p class="text-xs text-ink-500">Außer Deutschland steht das Land mit auf der Rechnung.</p>
	{#if err('country')}
		<p class="text-xs font-medium text-severity-critical">{err('country')}</p>
	{/if}
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
