<script lang="ts">
	/**
	 * ExemptCellPopover — review a per-year Befreiung + aufheben (spec §7.8).
	 *
	 * Shows the stored Pflicht-Grund and a destructive "Aufheben" button that
	 * reverts the year to open (no reason needed — the original Grund stays in
	 * the audit_log). Inline two-step confirm. Disabled when festgeschrieben.
	 *
	 * Rendered as popover *content*; parent owns positioning + the POST.
	 */
	import { Button } from '$lib/components/ui/button/index.js';
	import Ban from '@lucide/svelte/icons/ban';

	let {
		memberId,
		year,
		memberName,
		exemptReason = null,
		isLocked = false,
		submitting = false,
		onAufheben
	}: {
		memberId: string;
		year: number;
		memberName: string;
		exemptReason?: string | null;
		isLocked?: boolean;
		submitting?: boolean;
		onAufheben?: (detail: { memberId: string; year: number }) => void;
	} = $props();

	let confirming = $state(false);
	const titleId = $derived(`exempt-title-${memberId}-${year}`);

	function doAufheben() {
		if (submitting || isLocked) return;
		if (!confirming) {
			confirming = true;
			return;
		}
		onAufheben?.({ memberId, year });
	}
</script>

<div
	role="dialog"
	aria-labelledby={titleId}
	class="flex max-w-[280px] flex-col gap-2 p-1"
	data-popover="exempt"
>
	<h2
		id={titleId}
		class="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400"
	>
		<Ban size={14} class="shrink-0" aria-hidden="true" />
		{memberName} · {year} · BEFREIT
	</h2>
	<p class="text-sm text-foreground">Grund: {exemptReason ?? '—'}</p>

	{#if isLocked}
		<p role="alert" class="text-xs text-destructive">
			Jahr {year} ist festgeschrieben — Aufheben nicht möglich.
		</p>
	{/if}

	<div class="flex justify-end">
		<Button
			variant="destructive"
			size="sm"
			onclick={doAufheben}
			disabled={submitting || isLocked}
			aria-label={confirming ? 'Aufheben bestätigen' : 'Befreiung aufheben'}
		>
			{confirming ? 'Wirklich aufheben?' : 'Aufheben'}
		</Button>
	</div>
</div>
