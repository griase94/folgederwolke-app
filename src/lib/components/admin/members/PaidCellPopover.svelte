<script lang="ts">
	/**
	 * PaidCellPopover — review a paid Beitrag + storno (spec §7.5).
	 *
	 * Shows status (member · year · Betrag), the gezahltAm date, and the
	 * EÜR-Buchungsjahr. A destructive "Stornieren" button reverts to open via
	 * an inline two-step confirm (no nested dialog inside the popover — keeps
	 * focus management simple). Disabled when the year is festgeschrieben.
	 *
	 * Rendered as popover *content*; parent owns positioning + the POST.
	 */
	import { Button } from '$lib/components/ui/button/index.js';
	import Check from '@lucide/svelte/icons/check';
	import { berlinYear } from '$lib/domain/year.js';

	let {
		memberId,
		year,
		memberName,
		betragCents,
		gezahltAm = null,
		isLocked = false,
		submitting = false,
		onStorno
	}: {
		memberId: string;
		year: number;
		memberName: string;
		betragCents: number;
		gezahltAm?: string | null;
		isLocked?: boolean;
		submitting?: boolean;
		onStorno?: (detail: { memberId: string; year: number }) => void;
	} = $props();

	let confirming = $state(false);

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	function formatDateDe(iso: string | null): string {
		if (!iso) return '—';
		const [y, m, d] = iso.split('-');
		return `${d}.${m}.${y}`;
	}

	const euerYear = $derived.by(() => {
		if (!gezahltAm) return berlinYear();
		const parsed = new Date(`${gezahltAm}T12:00:00`);
		return Number.isNaN(parsed.getTime()) ? berlinYear() : berlinYear(parsed);
	});

	const titleId = $derived(`paid-title-${memberId}-${year}`);

	function doStorno() {
		if (submitting || isLocked) return;
		if (!confirming) {
			confirming = true;
			return;
		}
		onStorno?.({ memberId, year });
	}
</script>

<div
	role="dialog"
	aria-labelledby={titleId}
	class="flex max-w-[280px] flex-col gap-2 p-1"
	data-popover="paid"
>
	<h2
		id={titleId}
		class="flex items-center gap-1.5 text-sm font-semibold text-foreground tabular-nums"
	>
		<Check size={14} class="shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
		{memberName} · {year} · {eur(betragCents)}
	</h2>
	<p class="text-xs text-muted-foreground tabular-nums">
		Bezahlt am {formatDateDe(gezahltAm)}
	</p>
	<p class="text-xs text-muted-foreground tabular-nums">EÜR-Buchung {euerYear}</p>

	{#if isLocked}
		<p role="alert" class="text-xs text-destructive">
			Jahr {year} ist festgeschrieben — Storno nicht möglich.
		</p>
	{/if}

	<div class="flex justify-end">
		<Button
			variant="destructive"
			size="sm"
			onclick={doStorno}
			disabled={submitting || isLocked}
			aria-label={confirming ? 'Storno bestätigen' : 'Zahlung stornieren'}
		>
			{confirming ? 'Wirklich stornieren?' : 'Stornieren'}
		</Button>
	</div>
</div>
