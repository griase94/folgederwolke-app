<!--
  RejectDialog — template picker + free-text Grund for rejection.

  Lists a small set of canned templates (Beleg unleserlich, doppelte
  Einreichung, Betrag falsch, …) that pre-fill the Grund textarea. The
  admin can edit before submitting; the rejection mail (handled by the
  `auslage.rejected` event handler) uses the final Grund text.

  Submits to the `?/reject` action on the detail route with hidden
  submissionId. Closes itself on success.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		open = $bindable(false),
		submissionId,
		ausId,
		formAction = '?/reject'
	}: {
		open: boolean;
		submissionId: string;
		ausId: string;
		/**
		 * Form action target. Defaults to the review-page `?/reject` action.
		 * The DecisionBand passes it explicitly. (The old list-row
		 * `inline-reject` override was deleted in the Aurora inbox redesign —
		 * the list no longer decides.)
		 */
		formAction?: string;
	} = $props();

	type Template = {
		key: string;
		label: string;
		text: string;
	};

	const templates: Template[] = [
		{
			key: 'beleg_unleserlich',
			label: 'Beleg unleserlich',
			text:
				'Der eingereichte Beleg ist nicht ausreichend lesbar. Bitte reiche die Auslage erneut ein und prüfe, dass alle Pflichtangaben (Datum, Betrag, Aussteller) erkennbar sind.'
		},
		{
			key: 'doppelte_einreichung',
			label: 'Doppelte Einreichung',
			text:
				'Diese Auslage wurde bereits über eine frühere Einreichung erfasst. Bitte schau in deinem Postfach nach der ersten Bestätigung; eine erneute Erstattung ist nicht möglich.'
		},
		{
			key: 'betrag_falsch',
			label: 'Betrag stimmt nicht mit Beleg überein',
			text:
				'Der angegebene Betrag stimmt nicht mit dem auf dem Beleg ausgewiesenen Betrag überein. Bitte reiche die Auslage mit dem korrekten Betrag erneut ein.'
		},
		{
			key: 'nicht_satzungszweck',
			label: 'Nicht im Satzungszweck',
			text:
				'Die Auslage fällt nicht unter den Satzungszweck des Vereins und kann daher nicht erstattet werden.'
		},
		{
			key: 'sonstiges',
			label: 'Sonstiges (frei formulieren)',
			text: ''
		}
	];

	let loading = $state(false);
	let selectedKey = $state(templates[0]!.key);
	let grund = $state(templates[0]!.text);
	let error = $state<string | null>(null);

	function selectTemplate(key: string): void {
		selectedKey = key;
		const tpl = templates.find((t) => t.key === key);
		if (tpl) grund = tpl.text;
	}

	function reset(): void {
		loading = false;
		error = null;
		selectedKey = templates[0]!.key;
		grund = templates[0]!.text;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) reset();
	}}
>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Einreichung {ausId} ablehnen</Dialog.Title>
			<Dialog.Description>
				Wähle eine Vorlage oder formuliere den Grund frei. Wenn eine E-Mail-Adresse hinterlegt
				ist, wird die Ablehnung als Mail verschickt.
			</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action={formAction}
			use:enhance={() => {
				loading = true;
				error = null;
				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'failure') {
						const data = result.data as { error?: string } | null;
						error = data?.error ?? 'Ablehnung fehlgeschlagen.';
					} else if (result.type === 'success' || result.type === 'redirect') {
						toast.success('Abgelehnt');
						open = false;
						reset();
						await update();
					} else {
						await update();
					}
				};
			}}
			class="space-y-4"
		>
			<input type="hidden" name="submissionId" value={submissionId} />

			<!-- Template picker -->
			<fieldset class="space-y-2">
				<legend class="text-sm font-medium text-foreground">Vorlage</legend>
				<div class="flex flex-col gap-2 sm:grid sm:grid-cols-2">
					{#each templates as tpl (tpl.key)}
						<label
							class="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
						>
							<input
								type="radio"
								name="template_key"
								value={tpl.key}
								checked={selectedKey === tpl.key}
								onchange={() => selectTemplate(tpl.key)}
								class="mt-0.5 text-primary focus-visible:ring-ring"
							/>
							<span class="leading-tight">{tpl.label}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<div class="space-y-1.5">
				<Label for="reject-grund">Grund (wird im Mail-Text verwendet)</Label>
				<textarea
					id="reject-grund"
					name="grund"
					bind:value={grund}
					rows={5}
					required
					minlength={3}
					maxlength={2000}
					class="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				></textarea>
			</div>

			{#if error}
				<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{error}
				</p>
			{/if}

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button variant="outline" type="button" {...props} disabled={loading}>
							Abbrechen
						</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" variant="destructive" disabled={loading || grund.trim().length < 3}>
					{#if loading}
						<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
						</svg>
					{/if}
					Ablehnen
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
