<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type TransactionType = 'expense' | 'income' | 'donation';

	let selectedType = $state<TransactionType>('expense');
	let submitting = $state(false);

	const typeLabels: Record<TransactionType, string> = {
		expense: 'Ausgabe',
		income: 'Einnahme',
		donation: 'Spende',
	};

	// BezahltVon state (expense only)
	let bezahltVonKind = $state<'verein' | 'member' | 'extern'>('member');
	let selectedMemberId = $state('');

	const selectedMember = $derived(
		data.members.find((m) => m.id === selectedMemberId),
	);

	const bezahltVonDisplay = $derived(() => {
		if (bezahltVonKind === 'verein') return 'Folge der Wolke e.V.';
		if (bezahltVonKind === 'member' && selectedMember) {
			return `${selectedMember.vorname} ${selectedMember.nachname}`.trim();
		}
		return '';
	});
</script>

<svelte:head>
	<title>Neue Transaktion – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-2xl px-4 py-8 sm:px-6">
	<!-- ── Breadcrumb ──────────────────────────────────────────────────────── -->
	<nav class="mb-6 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/transactions" class="hover:text-foreground">Transaktionen</a>
		<span aria-hidden="true">›</span>
		<span class="text-foreground font-medium">Neue Transaktion</span>
	</nav>

	<div class="rounded-xl border border-border bg-background p-6 shadow-sm">
		<h1 class="mb-6 text-xl font-bold text-foreground">Neue Transaktion erfassen</h1>

		<!-- ── Type picker ─────────────────────────────────────────────────── -->
		<div class="mb-6">
			<p class="mb-2 text-sm font-medium text-foreground">Typ</p>
			<div class="flex gap-2">
				{#each Object.entries(typeLabels) as [t, label] (t)}
					<button
						type="button"
						onclick={() => (selectedType = t as TransactionType)}
						class={[
							'rounded-md px-4 py-2 text-sm font-medium transition-colors',
							selectedType === t
								? 'bg-primary text-primary-foreground shadow-sm'
								: 'bg-muted text-muted-foreground hover:text-foreground',
						].join(' ')}
						aria-pressed={selectedType === t}
					>
						{label}
					</button>
				{/each}
			</div>
		</div>

		{#if form?.error}
			<div class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
				{form.error}
			</div>
		{/if}

		<!-- ── Form ────────────────────────────────────────────────────────── -->
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<input type="hidden" name="type" value={selectedType} />

			<!-- Bezeichnung -->
			<div>
				<label for="bezeichnung" class="mb-1 block text-sm font-medium text-foreground">
					Bezeichnung <span class="text-red-500" aria-hidden="true">*</span>
				</label>
				<input
					id="bezeichnung"
					name="bezeichnung"
					type="text"
					required
					maxlength={500}
					placeholder="z.B. Druckerpatronen, Raummiete März"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
			</div>

			<!-- Betrag -->
			<div>
				<label for="betragCents-display" class="mb-1 block text-sm font-medium text-foreground">
					Betrag (€) <span class="text-red-500" aria-hidden="true">*</span>
				</label>
				<div class="relative">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
					<input
						id="betragCents-display"
						type="number"
						step="0.01"
						min="0.01"
						required
						placeholder="0,00"
						oninput={(e) => {
							const v = parseFloat((e.target as HTMLInputElement).value) || 0;
							const hidden = document.querySelector<HTMLInputElement>('input[name="betragCents"]');
							if (hidden) hidden.value = String(Math.round(v * 100));
						}}
						class="w-full rounded-md border border-border bg-background py-2 pr-3 pl-8 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
					<input type="hidden" name="betragCents" value="" />
				</div>
			</div>

			<!-- Expense-specific fields -->
			{#if selectedType === 'expense'}
				<div>
					<label for="rechnungsdatum" class="mb-1 block text-sm font-medium text-foreground">Rechnungsdatum</label>
					<input
						id="rechnungsdatum"
						name="rechnungsdatum"
						type="date"
						lang="de"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>

				<!-- BezahltVon -->
				<div>
					<p class="mb-2 text-sm font-medium text-foreground">Bezahlt von</p>
					<div class="flex gap-2 mb-3">
						{#each [['verein', 'Verein'], ['member', 'Mitglied'], ['extern', 'Extern']] as [k, l] (k)}
							<button
								type="button"
								onclick={() => (bezahltVonKind = k as 'verein' | 'member' | 'extern')}
								class={[
									'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
									bezahltVonKind === k
										? 'bg-primary text-primary-foreground'
										: 'bg-muted text-muted-foreground hover:text-foreground',
								].join(' ')}
							>
								{l}
							</button>
						{/each}
					</div>

					<input type="hidden" name="bezahltVonKind" value={bezahltVonKind} />
					<input type="hidden" name="bezahltVonDisplay" value={bezahltVonDisplay()} />

					{#if bezahltVonKind === 'member'}
						<select
							name="bezahltVonMemberId"
							bind:value={selectedMemberId}
							class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
						>
							<option value="">Mitglied auswählen…</option>
							{#each data.members as m (m.id)}
								<option value={m.id}>{m.nachname}, {m.vorname}</option>
							{/each}
						</select>
					{:else if bezahltVonKind === 'extern'}
						<div class="space-y-2">
							<input
								name="externName"
								type="text"
								placeholder="Name"
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							/>
							<input
								name="externIban"
								type="text"
								placeholder="IBAN"
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none"
							/>
							<input
								name="externEmail"
								type="email"
								placeholder="E-Mail (optional)"
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							/>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Income-specific -->
			{#if selectedType === 'income'}
				<div>
					<label for="geldEingangDatum" class="mb-1 block text-sm font-medium text-foreground">Geldeingangsdatum</label>
					<input
						id="geldEingangDatum"
						name="geldEingangDatum"
						type="date"
						lang="de"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>
			{/if}

			<!-- Donation-specific -->
			{#if selectedType === 'donation'}
				<div>
					<label for="spenderName" class="mb-1 block text-sm font-medium text-foreground">Spender</label>
					<input
						id="spenderName"
						name="spenderName"
						type="text"
						placeholder="Name des Spenders"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>
				<div>
					<label for="zugewendetAm" class="mb-1 block text-sm font-medium text-foreground">Zugewendet am</label>
					<input
						id="zugewendetAm"
						name="zugewendetAm"
						type="date"
						lang="de"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>

				<!-- Kategorie snapshot (hidden default for now) -->
				<input type="hidden" name="kategorieNameSnapshot" value="Spende" />
				<input type="hidden" name="spendeKind" value="geldspende" />
				<input type="hidden" name="zweckbindungKind" value="zweckfrei" />
			{/if}

			<!-- Kommentar -->
			<div>
				<label for="kommentar" class="mb-1 block text-sm font-medium text-foreground">Kommentar</label>
				<textarea
					id="kommentar"
					name="kommentar"
					rows="2"
					maxlength={2000}
					class="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				></textarea>
			</div>

			<!-- Hidden defaults -->
			<input type="hidden" name="kategorieNameSnapshot" value="(Unkategorisiert)" />
			<input type="hidden" name="sphereSnapshot" value="ideeller" />

			<!-- Actions -->
			<div class="flex gap-3 pt-2">
				<button
					type="submit"
					disabled={submitting}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
				>
					{submitting ? 'Speichere…' : `${typeLabels[selectedType]} erfassen`}
				</button>
				<Button href="/app/transactions" variant="ghost" size="sm">Abbrechen</Button>
			</div>
		</form>
	</div>
</div>
