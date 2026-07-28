<script lang="ts">
	import { page } from '$app/state';
	import StatusSplitShell, { type StatusShellTone } from '$lib/components/public/StatusSplitShell.svelte';
	import StatusMedallion, { type MedallionTone } from '$lib/components/ui/StatusMedallion.svelte';
	import IdChip from '$lib/components/ui/id-chip/IdChip.svelte';
	import AuslageStatusDetail from '$lib/components/public/AuslageStatusDetail.svelte';
	import BatchStatusGroup, { type BatchNode, type TallyChip } from '$lib/components/public/BatchStatusGroup.svelte';
	import { statusPresentation } from '$lib/components/auslagen/status-presentation.js';
	import { buildNodeDetail, buildSingleAside, deDate, type StatusNode } from '$lib/components/auslagen/status-detail-builder.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import type { AuslageStatus } from '$lib/server/domain/auslage-status.js';
	import Check from '@lucide/svelte/icons/check';
	import Clock from '@lucide/svelte/icons/clock';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import Receipt from '@lucide/svelte/icons/receipt';
	import HandCoins from '@lucide/svelte/icons/hand-coins';
	import Lock from '@lucide/svelte/icons/lock';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const nodes = $derived(data.nodes as StatusNode[]);
	const isBatch = $derived(nodes.length > 1);
	const focus = $derived(nodes.find((n) => n.ausId === data.focusAusId) ?? nodes[0]!);
	const submittedLabel = $derived(deDate(data.submittedAt) ?? '');

	// Shell tone follows the focused node (single); a batch stays neutral so one
	// node's fate never washes the whole group.
	const shellTone = $derived<StatusShellTone>(
		isBatch
			? 'default'
			: focus.status === 'erstattet'
				? 'done'
				: focus.status === 'abgelehnt'
					? 'reject'
					: 'default'
	);
	const medallionTone = $derived<MedallionTone>(statusPresentation(focus.status).medallion);
	const singleAside = $derived(buildSingleAside(focus));

	const TALLY_LABEL: Record<AuslageStatus, string> = {
		eingegangen: 'in Prüfung',
		in_pruefung: 'in Prüfung',
		geprueft: 'freigegeben',
		erstattet: 'erstattet',
		abgelehnt: 'abgelehnt'
	};
	const tally = $derived.by((): TallyChip[] => {
		const order: string[] = [];
		const counts: Record<string, { variant: TallyChip['variant']; label: string; n: number }> = {};
		for (const n of nodes) {
			const label = TALLY_LABEL[n.status];
			const variant = statusPresentation(n.status).chip;
			const key = `${variant}:${label}`;
			if (!counts[key]) {
				counts[key] = { variant, label, n: 0 };
				order.push(key);
			}
			counts[key].n += 1;
		}
		return order.map((k) => ({ variant: counts[k]!.variant, label: `${counts[k]!.n} ${counts[k]!.label}` }));
	});

	const batchNodes = $derived<BatchNode[]>(
		nodes.map((n) => ({
			ausId: n.ausId,
			bezeichnung: n.bezeichnung,
			betragCents: n.betragCents,
			chip: { variant: statusPresentation(n.status).chip, label: statusPresentation(n.status).pill },
			detail: buildNodeDetail(n, { compact: true })
		}))
	);
</script>

<svelte:head><title>Status {focus.ausId} — {page.data.vereinName}</title></svelte:head>

{#snippet medallionIcon(status: AuslageStatus)}
	{#if status === 'eingegangen'}<Check />{:else if status === 'in_pruefung'}<Clock />{:else if status === 'geprueft'}<ShieldCheck />{:else if status === 'erstattet'}<CircleCheck />{:else}<CircleX />{/if}
{/snippet}

<main class="mx-auto w-full max-w-5xl px-3 py-6 lg:px-6 lg:py-10">
	<StatusSplitShell tone={shellTone}>
		{#snippet aside()}
			{#if isBatch}
				<div class="flex flex-1 flex-col">
					<StatusMedallion class="mb-4" tone="pruef" size="lg">{#snippet icon()}<Receipt />{/snippet}</StatusMedallion>
					<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">Deine Einreichung</span>
					<h1 class="mt-2 text-[25px] leading-tight font-extrabold tracking-tight text-ink-900">{nodes.length} Auslagen auf einmal</h1>
					<p class="mt-3 max-w-[332px] text-[13.5px] leading-relaxed text-ink-700">
						Vom {submittedLabel} — {nodes.length} Auslagen, jede mit eigener Nummer und eigenem Stand. Jede
						deiner Nummern öffnet die ganze Gruppe — Hauptsache, du hast eine parat.
					</p>
					<span class="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-hairline bg-card px-3 py-1.5 text-[12.5px] font-bold text-ink-700 shadow-[var(--shadow-card)] [&_svg]:size-3.5 [&_svg]:text-ink-300">
						<HandCoins aria-hidden="true" />Gesamt&nbsp;·&nbsp;<span class="tabular-nums text-type-ausgabe">{formatMoney(data.gesamtCents)}</span>
					</span>
					<div class="mt-auto flex items-center gap-2 pt-5 text-[12px] font-semibold text-type-einnahme [&_svg]:size-4">
						<Lock aria-hidden="true" />Nur wer deine Nummer hat, sieht den Stand — deine Kontodaten bleiben verdeckt.
					</div>
				</div>
			{:else}
				<div class="flex flex-1 flex-col">
					<StatusMedallion class="mb-4" tone={medallionTone} size="lg">{#snippet icon()}{@render medallionIcon(focus.status)}{/snippet}</StatusMedallion>
					<span
						class="text-[11px] font-bold tracking-wide uppercase {focus.status === 'erstattet'
							? 'text-type-einnahme'
							: focus.status === 'abgelehnt'
								? 'text-severity-critical-text'
								: 'text-ink-500'}">{singleAside.eyebrow}</span
					>
					<h1 class="mt-2 max-w-[342px] text-[25px] leading-tight font-extrabold tracking-tight text-ink-900">{singleAside.headline}</h1>
					<p class="mt-3 max-w-[332px] text-[13.5px] leading-relaxed text-ink-700">{singleAside.sub}</p>
					<IdChip class="mt-4 w-fit" value={focus.ausId}>{#snippet icon()}<Receipt />{/snippet}</IdChip>
					<div class="mt-auto flex items-center gap-2 pt-5 text-[12px] font-semibold text-type-einnahme [&_svg]:size-4">
						<Lock aria-hidden="true" />Nur wer deine Nummer hat, sieht den Stand — deine Kontodaten bleiben verdeckt.
					</div>
				</div>
			{/if}
		{/snippet}
		{#snippet main()}
			{#if isBatch}
				<BatchStatusGroup {submittedLabel} gesamtCents={data.gesamtCents} {tally} nodes={batchNodes} focusAusId={data.focusAusId} />
			{:else}
				<div class="mb-5 flex items-baseline justify-between gap-3">
					<span class="text-[18px] font-extrabold tracking-tight text-ink-900">Deine Auslage</span>
					<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">Übersicht &amp; Verlauf</span>
				</div>
				<AuslageStatusDetail {...buildNodeDetail(focus)} />
			{/if}
		{/snippet}
	</StatusSplitShell>
</main>
