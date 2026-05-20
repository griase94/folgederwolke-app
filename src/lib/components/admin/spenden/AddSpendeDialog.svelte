<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		open = $bindable(false),
		kategorien,
		members,
		projects,
		onSuccess
	}: {
		open: boolean;
		kategorien: { id: string; name: string; sphere: string }[];
		members: { id: string; label: string }[];
		projects: { id: string; name: string; businessId: string }[];
		onSuccess?: () => void;
	} = $props();

	let loading = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let kind = $state<'geldspende' | 'sachspende'>('geldspende');
	let spenderMode = $state<'member' | 'extern'>('member');
	let zweck = $state<'zweckfrei' | 'zweckgebunden'>('zweckfrei');

	function reset() {
		errors = {};
		loading = false;
		kind = 'geldspende';
		spenderMode = 'member';
		zweck = 'zweckfrei';
	}

	function fieldError(key: string): string | undefined {
		return errors[key]?.[0];
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v: boolean) => {
		if (!v) reset();
	}}
>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Neue Spende</Dialog.Title>
			<Dialog.Description>
				Geld- oder Sachspende erfassen. Pflichtfelder: Spender, Datum, Betrag, Kategorie.
			</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action="?/add"
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
			<fieldset class="space-y-2">
				<Label>Spende-Art *</Label>
				<div class="flex gap-3 text-sm">
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="spende_kind"
							value="geldspende"
							checked={kind === 'geldspende'}
							onchange={() => (kind = 'geldspende')}
						/>
						Geldspende
					</label>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="spende_kind"
							value="sachspende"
							checked={kind === 'sachspende'}
							onchange={() => (kind = 'sachspende')}
						/>
						Sachspende
					</label>
				</div>
				{#if fieldError('spende_kind')}
					<p class="text-xs text-destructive">{fieldError('spende_kind')}</p>
				{/if}
			</fieldset>

			<fieldset class="space-y-2">
				<Label>Spender *</Label>
				<div class="flex gap-3 text-sm">
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="spender_mode"
							value="member"
							checked={spenderMode === 'member'}
							onchange={() => (spenderMode = 'member')}
						/>
						Mitglied
					</label>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="spender_mode"
							value="extern"
							checked={spenderMode === 'extern'}
							onchange={() => (spenderMode = 'extern')}
						/>
						Externer Spender
					</label>
				</div>

				{#if spenderMode === 'member'}
					<select
						name="member_id"
						class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
						required
						data-testid="member-select"
					>
						<option value="">— Mitglied wählen —</option>
						{#each members as m (m.id)}
							<option value={m.id}>{m.label}</option>
						{/each}
					</select>
					{#if fieldError('member_id')}
						<p class="text-xs text-destructive">{fieldError('member_id')}</p>
					{/if}
				{:else}
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<Label for="add-spende-spender-name">Name *</Label>
							<Input
								id="add-spende-spender-name"
								name="spender_name"
								required
								aria-invalid={!!fieldError('spender_name')}
								data-testid="spender-name-input"
							/>
							{#if fieldError('spender_name')}
								<p class="text-xs text-destructive">{fieldError('spender_name')}</p>
							{/if}
						</div>
						<div class="space-y-1">
							<Label for="add-spende-spender-email">E-Mail</Label>
							<Input
								id="add-spende-spender-email"
								name="spender_email"
								type="email"
								aria-invalid={!!fieldError('spender_email')}
							/>
							{#if fieldError('spender_email')}
								<p class="text-xs text-destructive">{fieldError('spender_email')}</p>
							{/if}
						</div>
					</div>
					<div class="space-y-1">
						<Label for="add-spende-spender-adresse">Adresse * (mehrzeilig)</Label>
						<textarea
							id="add-spende-spender-adresse"
							name="spender_adresse"
							rows="3"
							class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
							data-testid="spender-adresse-input"
							required
						></textarea>
						{#if fieldError('spender_adresse')}
							<p class="text-xs text-destructive">{fieldError('spender_adresse')}</p>
						{/if}
					</div>
				{/if}
			</fieldset>

			<div class="grid gap-3 sm:grid-cols-2">
				<div class="space-y-1">
					<Label for="add-spende-datum">Zuwendungsdatum *</Label>
					<Input
						id="add-spende-datum"
						name="zugewendet_am"
						type="date"
						lang="de"
						required
						data-testid="zugewendet-am-input"
					/>
					{#if fieldError('zugewendet_am')}
						<p class="text-xs text-destructive">{fieldError('zugewendet_am')}</p>
					{/if}
				</div>
				<div class="space-y-1">
					<Label for="add-spende-betrag">Betrag (EUR) *</Label>
					<Input
						id="add-spende-betrag"
						name="betrag_eur"
						type="number"
						min="0.01"
						step="0.01"
						required
						aria-invalid={!!fieldError('betragCents')}
						data-testid="betrag-eur-input"
					/>
					{#if fieldError('betragCents') || fieldError('betrag_eur')}
						<p class="text-xs text-destructive">
							{fieldError('betragCents') ?? fieldError('betrag_eur')}
						</p>
					{/if}
				</div>
			</div>

			<div class="space-y-1">
				<Label for="add-spende-kat">Kategorie *</Label>
				<select
					id="add-spende-kat"
					name="kategorie_id"
					required
					class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
					data-testid="kategorie-select"
				>
					<option value="">— Kategorie wählen —</option>
					{#each kategorien as k (k.id)}
						<option value={k.id}>{k.name} ({k.sphere})</option>
					{/each}
				</select>
				{#if fieldError('kategorie_id')}
					<p class="text-xs text-destructive">{fieldError('kategorie_id')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="add-spende-project">Projekt (optional)</Label>
				<select
					id="add-spende-project"
					name="project_id"
					class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
				>
					<option value="">— kein Projekt —</option>
					{#each projects as p (p.id)}
						<option value={p.id}>{p.name} ({p.businessId})</option>
					{/each}
				</select>
			</div>

			{#if kind === 'sachspende'}
				<div class="space-y-1">
					<Label for="add-spende-sache">Beschreibung der Sache *</Label>
					<textarea
						id="add-spende-sache"
						name="sache_beschreibung"
						rows="2"
						class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
						placeholder="z.B. gebrauchter Laptop, Bj. 2020, Zustand gut"
						required
						data-testid="sache-beschreibung-input"
					></textarea>
					{#if fieldError('sache_beschreibung')}
						<p class="text-xs text-destructive">{fieldError('sache_beschreibung')}</p>
					{/if}
				</div>
				<div class="space-y-1">
					<Label>Wertermittlung *</Label>
					<select
						name="sache_wertermittlung"
						required
						class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
					>
						<option value="">— wählen —</option>
						<option value="verkehrswert">Verkehrswert</option>
						<option value="selbstermittelter_wert">Selbstermittelter Wert</option>
					</select>
					{#if fieldError('sache_wertermittlung')}
						<p class="text-xs text-destructive">{fieldError('sache_wertermittlung')}</p>
					{/if}
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
							checked={zweck === 'zweckfrei'}
							onchange={() => (zweck = 'zweckfrei')}
						/>
						Zweckfrei
					</label>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="zweckbindung_kind"
							value="zweckgebunden"
							checked={zweck === 'zweckgebunden'}
							onchange={() => (zweck = 'zweckgebunden')}
						/>
						Zweckgebunden
					</label>
				</div>
				{#if zweck === 'zweckgebunden'}
					<textarea
						name="zweckbindung_text"
						rows="2"
						class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
						placeholder="z.B. Renovierung Vereinsheim"
					></textarea>
					{#if fieldError('zweckbindung_text')}
						<p class="text-xs text-destructive">{fieldError('zweckbindung_text')}</p>
					{/if}
				{/if}
			</fieldset>

			{#if errors['_root']}
				<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{errors['_root']?.[0]}
				</p>
			{/if}

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props }: { props: Record<string, unknown> })}
						<Button variant="outline" type="button" {...props} disabled={loading}>
							Abbrechen
						</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={loading} data-testid="submit-spende">
					{loading ? 'Speichern…' : 'Spende erfassen'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
