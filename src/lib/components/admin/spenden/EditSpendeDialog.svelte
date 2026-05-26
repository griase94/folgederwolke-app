<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import DateField from '$lib/components/ui/date-field/DateField.svelte';

	type Spende = {
		id: string;
		businessId: string;
		zugewendetAm: string | null;
		betragCents: number;
		spendeKind: string;
		spenderName: string | null;
		spenderAdresse: string | null;
		spenderEmail: string | null;
		memberId: string | null;
		bescheinigungNr: string | null;
		kategorieId: string | null;
		projectId: string | null;
		zweckbindungKind: string;
		zweckbindungText: string | null;
	};

	let {
		open = $bindable(false),
		spende,
		kategorien: _kategorien,
		members: _members,
		projects: _projects,
		onSuccess
	}: {
		open: boolean;
		spende: Spende | null;
		kategorien: { id: string; name: string; sphere: string }[];
		members: { id: string; label: string }[];
		projects: { id: string; name: string; businessId: string }[];
		onSuccess?: () => void;
	} = $props();

	let loading = $state(false);
	let errors = $state<Record<string, string[]>>({});

	function reset() {
		errors = {};
		loading = false;
	}

	function fieldError(key: string): string | undefined {
		return errors[key]?.[0];
	}

	const betragEurOf = (sp: Spende | null): string =>
		sp ? (sp.betragCents / 100).toFixed(2) : '';
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v: boolean) => {
		if (!v) reset();
	}}
>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Spende bearbeiten</Dialog.Title>
			{#if spende}
				<Dialog.Description>
					{spende.businessId}
					{#if spende.bescheinigungNr}
						&middot; bereits bescheinigt
					{/if}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if spende}
			{#if spende.bescheinigungNr}
				<p
					class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
				>
					Diese Spende ist bereits bescheinigt &mdash; nur Storno-Korrektur (Phase 2) m&ouml;glich.
				</p>
			{:else}
				<form
					method="POST"
					action="?/edit"
					use:enhance={() => {
						loading = true;
						errors = {};
						return async ({ result, update }) => {
							loading = false;
							if (result.type === 'failure') {
								errors = (result.data?.errors as Record<string, string[]>) ?? {};
							} else if (result.type === 'success') {
								open = false;
								reset();
								onSuccess?.();
								await invalidateAll();
							}
							await update();
						};
					}}
					class="space-y-4"
				>
					<input type="hidden" name="id" value={spende.id} />
					<input type="hidden" name="spende_kind" value={spende.spendeKind} />
					<input type="hidden" name="kategorie_id" value={spende.kategorieId ?? ''} />
					<input type="hidden" name="project_id" value={spende.projectId ?? ''} />
					<input
						type="hidden"
						name="member_id"
						value={spende.memberId ?? ''}
					/>

					<div class="grid gap-3 sm:grid-cols-2">
						<!-- E4.x (Night-2 C6-FORM): migrated to DateField. -->
						<div class="space-y-1">
							<Label for="edit-spende-datum">Zuwendungsdatum *</Label>
							<DateField
								id="edit-spende-datum"
								name="zugewendet_am"
								value={spende.zugewendetAm ?? ''}
								required
								aria-invalid={!!fieldError('zugewendet_am')}
							/>
							{#if fieldError('zugewendet_am')}
								<p class="text-xs text-destructive">{fieldError('zugewendet_am')}</p>
							{/if}
						</div>
						<div class="space-y-1">
							<Label for="edit-spende-betrag">Betrag (EUR) *</Label>
							<Input
								id="edit-spende-betrag"
								name="betrag_eur"
								type="number"
								min="0.01"
								step="0.01"
								value={betragEurOf(spende)}
								required
							/>
							{#if fieldError('betragCents') || fieldError('betrag_eur')}
								<p class="text-xs text-destructive">
									{fieldError('betragCents') ?? fieldError('betrag_eur')}
								</p>
							{/if}
						</div>
					</div>

					{#if !spende.memberId}
						<div class="space-y-1">
							<Label for="edit-spende-spender-name">Name *</Label>
							<Input
								id="edit-spende-spender-name"
								name="spender_name"
								value={spende.spenderName ?? ''}
								required
							/>
							{#if fieldError('spender_name')}
								<p class="text-xs text-destructive">{fieldError('spender_name')}</p>
							{/if}
						</div>
						<div class="space-y-1">
							<Label for="edit-spende-spender-adresse">Adresse *</Label>
							<textarea
								id="edit-spende-spender-adresse"
								name="spender_adresse"
								rows="3"
								class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
								required>{spende.spenderAdresse ?? ''}</textarea
							>
							{#if fieldError('spender_adresse')}
								<p class="text-xs text-destructive">{fieldError('spender_adresse')}</p>
							{/if}
						</div>
						<div class="space-y-1">
							<Label for="edit-spende-spender-email">E-Mail</Label>
							<Input
								id="edit-spende-spender-email"
								name="spender_email"
								type="email"
								value={spende.spenderEmail ?? ''}
							/>
						</div>
					{/if}

					<fieldset class="space-y-2">
						<Label>Zweckbindung</Label>
						<div class="flex gap-3 text-sm">
							<label class="flex items-center gap-2">
								<input
									type="radio"
									name="zweckbindung_kind"
									value="zweckfrei"
									checked={spende.zweckbindungKind === 'zweckfrei'}
								/>
								Zweckfrei
							</label>
							<label class="flex items-center gap-2">
								<input
									type="radio"
									name="zweckbindung_kind"
									value="zweckgebunden"
									checked={spende.zweckbindungKind === 'zweckgebunden'}
								/>
								Zweckgebunden
							</label>
						</div>
						<textarea
							name="zweckbindung_text"
							rows="2"
							class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
							placeholder="(nur bei Zweckgebunden)">{spende.zweckbindungText ?? ''}</textarea
						>
					</fieldset>

					<Dialog.Footer>
						<Dialog.Close>
							{#snippet child({ props }: { props: Record<string, unknown> })}
								<Button variant="outline" type="button" {...props} disabled={loading}>
									Abbrechen
								</Button>
							{/snippet}
						</Dialog.Close>
						<Button type="submit" disabled={loading}>
							{loading ? 'Speichern…' : 'Speichern'}
						</Button>
					</Dialog.Footer>
				</form>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
