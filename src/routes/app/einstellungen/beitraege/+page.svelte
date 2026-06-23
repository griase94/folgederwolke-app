<script lang="ts">
	import { page } from '$app/state';
	/**
	 * /app/einstellungen/beitraege — Beitragssatz settings (Task 2.9 / spec §8).
	 *
	 * Table of per-year rates with inline edit. Locked (festgeschrieben) years
	 * show a lock icon + disabled edit. A new-rate form lets the admin add a
	 * future year. The preview-impact panel ($derived) shows betroffene
	 * Mitglieder + erwartete Einnahmen for the value being edited (§17 C5).
	 */
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import Lock from '@lucide/svelte/icons/lock';
	import Plus from '@lucide/svelte/icons/plus';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	function fmtDateDe(iso: string | null): string {
		if (!iso) return '—';
		const [y, m, d] = iso.split('-');
		return `${d}.${m}.${y}`;
	}

	// ── Inline-edit state ────────────────────────────────────────────────────
	let editingYear = $state<number | null>(null);
	let editBetrag = $state(''); // euro string
	let editFaelligkeit = $state('');
	let editBeschluss = $state('');
	let saving = $state(false);

	// ── New-rate form ─────────────────────────────────────────────────────────
	// Default the new-year input to the first year that has NO satz yet:
	// max(existing years)+1, or the current year if none exist. This avoids
	// defaulting onto an already-existing year (which would otherwise risk a
	// silent overwrite). data.rates is sorted desc by year, so rates[0] is max.
	const firstFreeYear = untrack(() => {
		const maxYear = data.rates[0]?.year;
		return maxYear !== undefined ? maxYear + 1 : data.currentYear;
	});
	let addingNew = $state(false);
	let newYear = $state(firstFreeYear);
	let newBetrag = $state('69.69');
	let newFaelligkeit = $state(`${firstFreeYear}-03-31`);
	let newBeschluss = $state('');

	function startEdit(rate: PageData['rates'][0]) {
		editingYear = rate.year;
		editBetrag = (rate.cents / 100).toFixed(2);
		editFaelligkeit = rate.faelligkeitAt ?? `${rate.year}-03-31`;
		editBeschluss = rate.decisionNote ?? '';
	}

	function cancelEdit() {
		editingYear = null;
	}

	// Preview-impact: parse the euro value currently being edited/added and
	// project expected income across active, non-exempt members (§17 C5).
	const previewBetrag = $derived(
		addingNew ? newBetrag : editingYear !== null ? editBetrag : ''
	);
	const previewCents = $derived.by(() => {
		// previewBetrag may be a string (text input) or a number (type=number
		// binding) — coerce to string, then use the canonical de-DE/English parser
		// so the preview matches what the server (parseEuroToCents) will store.
		const cents = parseBetragCents(String(previewBetrag ?? ''));
		return Number.isFinite(cents) && cents >= 0 ? cents : 0;
	});
	const previewIncomeCents = $derived(previewCents * data.activeMemberCount);
	// Delta vs. the most recent existing rate (sorted desc, first entry).
	const latestRateCents = $derived(data.rates[0]?.cents ?? 0);
	const previewDeltaCents = $derived(previewCents - latestRateCents);

	const showPreview = $derived(addingNew || editingYear !== null);
</script>

<svelte:head>
	<title>Mitgliedsbeiträge – Einstellungen – {page.data.vereinName}</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Mitgliedsbeiträge</h1>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Jährliche Beitragssätze und Fälligkeit
			</p>
		</div>
		<Button onclick={() => (addingNew = !addingNew)} data-testid="add-rate-toggle">
			<Plus size={16} class="mr-1.5" aria-hidden="true" />
			Satz für neues Jahr
		</Button>
	</div>

	<!-- New-rate form -->
	{#if addingNew}
		<form
			method="POST"
			action="?/set-rate"
			use:enhance={() => {
				saving = true;
				return async ({ result }) => {
					saving = false;
					if (result.type === 'success') {
						toast.success(`Beitragssatz ${newYear} gespeichert`);
						addingNew = false;
						await invalidateAll();
					} else if (result.type === 'failure') {
						toast.error((result.data?.error as string) ?? 'Speichern fehlgeschlagen');
					}
				};
			}}
			class="mb-4 rounded-xl border border-border bg-card p-4 dark:border-border/60 dark:bg-card/40"
		>
			<input type="hidden" name="mode" value="create" />
			<h2 class="mb-3 text-sm font-semibold text-foreground">Neuer Beitragssatz</h2>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
				<label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
					Jahr
					<input
						name="year"
						type="number"
						bind:value={newYear}
						min={data.currentYear}
						class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums dark:bg-input/30"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
					Betrag (€)
					<input
						name="betrag"
						type="number"
						step="0.01"
						min="0"
						bind:value={newBetrag}
						aria-label="Betrag"
						class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums dark:bg-input/30"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
					Fällig bis
					<input
						name="faelligkeitAt"
						type="date"
						bind:value={newFaelligkeit}
						class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums dark:bg-input/30"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
					Beschluss
					<input
						name="decisionNote"
						type="text"
						bind:value={newBeschluss}
						placeholder="MV 14.03., TOP 7"
						class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm dark:bg-input/30"
					/>
				</label>
			</div>
			<div class="mt-3 flex justify-end gap-2">
				<Button type="button" variant="ghost" onclick={() => (addingNew = false)}>Abbrechen</Button>
				<Button type="submit" disabled={saving}>Speichern</Button>
			</div>
		</form>
	{/if}

	<!-- Rates table -->
	{#if data.rates.length === 0 && !addingNew}
		<EmptyState
			title="Noch keine Beitragssätze"
			description="Lege den ersten jährlichen Beitragssatz fest, um Mitgliedsbeiträge zu erfassen."
		>
			{#snippet cta()}
				<Button onclick={() => (addingNew = true)}>
					<Plus size={16} class="mr-1.5" aria-hidden="true" />
					Beitragssatz anlegen
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="overflow-x-auto rounded-xl border border-border">
			<table class="w-full text-sm" data-testid="beitragssatz-table">
				<thead>
					<tr class="border-b border-border bg-muted/50 text-left">
						<th class="px-4 py-2.5 font-semibold text-foreground" scope="col">Jahr</th>
						<th class="px-4 py-2.5 font-semibold text-foreground" scope="col">Betrag</th>
						<th class="px-4 py-2.5 font-semibold text-foreground" scope="col">Fällig bis</th>
						<th
							class="hidden px-4 py-2.5 font-semibold text-foreground sm:table-cell"
							scope="col">Beschluss</th
						>
						<th class="px-4 py-2.5" scope="col"><span class="sr-only">Aktionen</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.rates as rate (rate.year)}
						<tr
							class="border-b border-border last:border-0 {rate.isLocked
								? 'opacity-60'
								: ''}"
							data-testid="rate-row"
							data-year={rate.year}
						>
							{#if editingYear === rate.year}
								<!-- Inline edit row -->
								<td class="px-4 py-2.5 tabular-nums">{rate.year}</td>
								<td colspan="4" class="px-4 py-2.5">
									<form
										method="POST"
										action="?/set-rate"
										use:enhance={() => {
											saving = true;
											return async ({ result }) => {
												saving = false;
												if (result.type === 'success') {
													toast.success(`Beitragssatz ${rate.year} aktualisiert`);
													editingYear = null;
													await invalidateAll();
												} else if (result.type === 'failure') {
													toast.error(
														(result.data?.error as string) ?? 'Speichern fehlgeschlagen'
													);
												}
											};
										}}
										class="flex flex-wrap items-end gap-3"
									>
										<input type="hidden" name="mode" value="update" />
										<input type="hidden" name="year" value={rate.year} />
										<label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
											Betrag (€)
											<input
												name="betrag"
												type="number"
												step="0.01"
												min="0"
												bind:value={editBetrag}
												aria-label="Betrag"
												class="min-h-[44px] w-28 rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums dark:bg-input/30"
											/>
										</label>
										<label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
											Fällig bis
											<input
												name="faelligkeitAt"
												type="date"
												bind:value={editFaelligkeit}
												class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums dark:bg-input/30"
											/>
										</label>
										<label class="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
											Beschluss
											<input
												name="decisionNote"
												type="text"
												bind:value={editBeschluss}
												class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm dark:bg-input/30"
											/>
										</label>
										<div class="flex gap-2">
											<Button type="button" variant="ghost" onclick={cancelEdit}>Abbrechen</Button>
											<Button type="submit" disabled={saving}>Speichern</Button>
										</div>
									</form>
								</td>
							{:else}
								<td class="px-4 py-2.5 tabular-nums">
									<span class="inline-flex items-center gap-1">
										{rate.year}
										{#if rate.isLocked}
											<Lock
												size={12}
												class="text-muted-foreground"
												aria-label="Festgeschrieben"
											/>
										{/if}
									</span>
								</td>
								<td class="px-4 py-2.5 tabular-nums">{eur(rate.cents)}</td>
								<td class="px-4 py-2.5 tabular-nums">{fmtDateDe(rate.faelligkeitAt)}</td>
								<td class="hidden px-4 py-2.5 text-muted-foreground sm:table-cell"
									>{rate.decisionNote ?? '—'}</td
								>
								<td class="px-4 py-2.5 text-right">
									{#if rate.isLocked}
										<span
											class="text-xs text-muted-foreground"
											title="Dieses Jahr ist festgeschrieben."
										>
											gesperrt
										</span>
									{:else}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => startEdit(rate)}
											data-testid="edit-rate"
										>
											Bearbeiten
										</Button>
									{/if}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Preview-impact panel (§17 C5) -->
	{#if showPreview && previewCents > 0}
		<div
			class="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm dark:border-border/60 dark:bg-card/40"
			data-testid="rate-preview"
		>
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Vorschau
			</h3>
			<dl class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
				<div class="flex justify-between gap-2">
					<dt class="text-muted-foreground">Neuer Beitragssatz</dt>
					<dd class="font-medium tabular-nums" data-testid="preview-betrag">{eur(previewCents)}</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="text-muted-foreground">Betroffene aktive Mitglieder</dt>
					<dd class="font-medium tabular-nums" data-testid="preview-members">
						{data.activeMemberCount}
					</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="text-muted-foreground">Erwartete Einnahmen</dt>
					<dd class="font-medium tabular-nums" data-testid="preview-income">
						{eur(previewIncomeCents)}
					</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="text-muted-foreground">Änderung vs. aktuell</dt>
					<dd class="font-medium tabular-nums">
						{previewDeltaCents >= 0 ? '+ ' : '− '}{eur(Math.abs(previewDeltaCents))}
					</dd>
				</div>
			</dl>
		</div>
	{/if}

	<!-- Audit -->
	{#if data.audit.length > 0}
		<section class="mt-8">
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
				Audit
			</h2>
			<ul class="space-y-1 text-xs text-muted-foreground">
				{#each data.audit as entry (entry.id)}
					<li class="tabular-nums">
						{entry.payload?.year ?? '—'} · geändert am
						{new Date(entry.occurredAt).toLocaleDateString('de-DE')}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
