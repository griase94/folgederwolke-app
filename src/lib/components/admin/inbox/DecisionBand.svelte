<!--
  DecisionBand — the review route's decision controls (spec §2.2 "alignment cure").

  ONE content column, shared edges:
    label row  : "Kategorie" (left) + right-aligned Sphäre chip (after a pick)
    select     : full-width KategoriePicker native select
    button row : Freigeben (flex-1, the ONLY filled CTA: bg-primary-strong +
                 white + glow) + Ablehnen (fixed 128px, severity-critical TEXT
                 on white + hairline — never a red fill), sharing the select edges
    ghost      : "Verzicht spenden" text-link + "In Vorbereitung" chip
    footnote   : reimbursement happens after Freigabe on the Ausgabenseite

  Gating (FormFooter semantics, master §2.6, inlined because the spec's button
  row is bespoke): live "Fehlt noch: Kategorie" + Freigeben /70 until chosen;
  pressing early focuses the picker (server 400 backstop). ADR-0002: sphere is
  re-derived server-side — we send only kategorieName; onSphere is display-only.

  Festschreibung: approve 409 → LockBanner (currentYear), NOT a toast (spec §3).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import type { KategorieOption } from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import SphereBadge from '$lib/components/admin/transactions/fields/SphereBadge.svelte';
	import RejectDialog from '$lib/components/admin/inbox/RejectDialog.svelte';
	import AufwandsspendeStubModal from '$lib/components/admin/inbox/AufwandsspendeStubModal.svelte';
	import LockBanner from '$lib/components/ui/LockBanner.svelte';
	import type { Sphere } from '$lib/domain/sphere.js';

	let {
		submissionId,
		ausId,
		kategorieOptions,
		festgeschriebenBis = null,
		currentYear
	}: {
		submissionId: string;
		ausId: string;
		kategorieOptions: KategorieOption[];
		festgeschriebenBis?: number | null;
		currentYear: number;
	} = $props();

	let kategorieName = $state('');
	let sphere = $state<Sphere | null>(null);
	let approving = $state(false);
	let rejectOpen = $state(false);
	let aufwandsspendeOpen = $state(false);

	// Festschreibung: render LockBanner proactively when the current Buchungsjahr
	// is closed, AND reactively if the server returns a 409 (race / stale tab).
	// Initial value is derived from props; the 409 handler can override it.
	let lockYearOverride = $state<number | null>(null);
	const lockYear = $derived(
		lockYearOverride !== null
			? lockYearOverride
			: festgeschriebenBis !== null && currentYear <= festgeschriebenBis
				? currentYear
				: null
	);

	const missing = $derived(kategorieName ? [] : ['Kategorie']);
	let pickerEl = $state<HTMLElement | null>(null);

	function focusPicker(): void {
		pickerEl?.querySelector<HTMLSelectElement>('select')?.focus();
	}

	function onApproveClick(e: MouseEvent): void {
		if (missing.length === 0) return;
		// Never submit with a gap — focus the picker instead (spec §3 guardrail).
		e.preventDefault();
		focusPicker();
	}
</script>

<div class="flex flex-col gap-3">
	{#if lockYear !== null}
		<LockBanner year={lockYear} />
	{/if}

	<!-- Approve form: label row + select + Freigeben/Ablehnen row share edges. -->
	<form
		method="POST"
		action="?/approve"
		use:enhance={() => {
			approving = true;
			return async ({ result, update }) => {
				approving = false;
				if (result.type === 'success') {
					toast.success('Freigegeben');
					await update();
				} else if (result.type === 'failure') {
					const d = result.data as { error?: string } | null;
					const msg = d?.error ?? 'Freigabe fehlgeschlagen.';
					if (result.status === 409 && /festgeschrieben/i.test(msg)) {
						// Festschreibung → LockBanner, not a toast (spec §3).
						lockYearOverride = currentYear;
					} else {
						toast.error(msg);
					}
				} else {
					toast.error('Freigabe fehlgeschlagen.');
				}
			};
		}}
		class="flex flex-col gap-3"
	>
		<input type="hidden" name="submissionId" value={submissionId} />

		<!-- Label row: "Kategorie" + right-aligned Sphäre chip (after a pick). -->
		<div class="flex items-center justify-between">
			<span class="text-sm font-medium text-ink-700">Kategorie</span>
			{#if sphere}
				<span data-testid="decision-sphere" class="inline-flex items-center gap-1 text-xs text-ink-500">
					<span class="text-ink-500">Sphäre:</span>
					<SphereBadge {sphere} />
				</span>
			{/if}
		</div>

		<!-- Full-width Kategorie select. KategoriePicker's own <label> is hidden
		     (sr-only, via hideLabel) since the label row above already shows
		     "Kategorie" + the Sphäre chip; its inline SphereBadge is suppressed
		     (hideSphere) so the Sphäre isn't shown twice. The picker's sr-only
		     <label for> remains the a11y name the gate focuses. -->
		<div bind:this={pickerEl} data-slot="decision-picker">
			<KategoriePicker
				id="approve-kategorie"
				name="kategorieName"
				options={kategorieOptions}
				value={kategorieName}
				onChange={(n) => (kategorieName = n)}
				onSphere={(s) => (sphere = s)}
				hideLabel
				hideSphere
			/>
		</div>

		{#if missing.length > 0}
			<p
				data-testid="decision-missing"
				class="text-sm text-ink-500"
				aria-live="polite"
				aria-atomic="true"
			>
				<span class="font-medium text-ink-700">Fehlt noch:</span>
				{missing.join(', ')}
			</p>
		{/if}

		<!-- Button row sharing the select's edges (w-full so the row spans the
		     same width as the full-width select even if a parent's align-items
		     is ever overridden). -->
		<div class="flex w-full items-stretch gap-2">
			<button
				type="submit"
				data-testid="decision-approve"
				onclick={onApproveClick}
				disabled={approving}
				class={'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
					(missing.length > 0
						? 'bg-primary-strong/70'
						: 'bg-primary-strong shadow-(--glow-brand) hover:bg-primary-strong/90') +
					(approving ? ' opacity-60' : '')}
			>
				{#if approving}
					<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
					</svg>
				{:else}
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.5"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				{/if}
				Freigeben
			</button>
			<button
				type="button"
				data-testid="decision-reject"
				onclick={() => (rejectOpen = true)}
				disabled={approving}
				class="flex h-11 w-32 shrink-0 items-center justify-center rounded-[10px] border border-hairline bg-white text-sm font-medium text-severity-critical-text transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				Ablehnen
			</button>
		</div>
	</form>

	<!-- Aufwandsspende (deferred): ghost text-link + "In Vorbereitung" chip. -->
	<div class="flex items-center gap-2">
		<button
			type="button"
			onclick={() => (aufwandsspendeOpen = true)}
			class="text-sm font-medium text-ink-500 underline-offset-2 hover:text-ink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>Verzicht spenden</button
		>
		<span
			class="inline-flex items-center rounded-full border border-hairline bg-white px-1.5 py-px text-[10px] font-medium text-ink-500"
			>In Vorbereitung</span
		>
	</div>

	<p class="text-xs text-ink-500">
		Erstattung erfolgt nach der Freigabe auf der Ausgabenseite — Überweisung manuell.
	</p>
</div>

<RejectDialog bind:open={rejectOpen} {submissionId} {ausId} formAction="?/reject" />
<AufwandsspendeStubModal bind:open={aufwandsspendeOpen} />
