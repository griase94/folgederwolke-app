<script lang="ts">
	/**
	 * Lage card (spec §7) — hairline sections in BINDING order:
	 * (1) Beiträge {berlinYear} (own-year eyebrow; dimmed when switcher ≠ current)
	 * (2) Sphären — 4-row tabular table, negative saldi in severity text
	 * (3) WGB · § 64 AO — slim inline meter LAST, semantic fills per wgb.status
	 *     (NEVER re-derived from cents), 1px notch at the limit, rendered only
	 *     once WGB > 0. Y is ALWAYS wgb.freigrenzeCents formatted — no literals.
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { SPHERE_LABELS, type Sphere } from '$lib/domain/sphere.js';

	let {
		beitraege,
		dimmed,
		sphaeren,
		wgb
	}: {
		beitraege: {
			year: number;
			paidMemberCount: number;
			openMemberCount: number;
			overdueCount: number;
			paidCents: number;
			offenCents: number;
		};
		// `dimmed` is computed by the page from data.selectedYear !==
		// data.currentYear — both arrive via the layout parent-data merge
		// (src/routes/app/+layout.server.ts; PageData already includes them).
		// Do NOT add selectedYear/currentYear to +page.server.ts.
		dimmed: boolean;
		sphaeren: { sphere: Sphere; saldoCents: number }[];
		wgb: {
			status: 'ok' | 'erhoeht' | 'kritisch' | 'ueberschritten';
			einnahmenCents: number;
			freigrenzeCents: number;
		};
	} = $props();

	const total = $derived(beitraege.paidMemberCount + beitraege.openMemberCount);
	const paidPct = $derived(total === 0 ? 0 : (beitraege.paidMemberCount / total) * 100);
	const overduePct = $derived(total === 0 ? 0 : (beitraege.overdueCount / total) * 100);

	const wgbPct = $derived(
		Math.min((wgb.einnahmenCents / wgb.freigrenzeCents) * 100, 100)
	);
	// Semantic fill from wgb.status tiers — the ONLY source of truth (spec §7).
	const wgbFill = $derived(
		wgb.status === 'ueberschritten'
			? 'bg-severity-critical'
			: wgb.status === 'kritisch' || wgb.status === 'erhoeht'
				? 'bg-severity-warn'
				: 'bg-dataviz-paid'
	);
</script>

<section class="rounded-2xl bg-white p-4 shadow-(--shadow-card)" aria-label="Lage">
	<!-- (1) Beiträge — anchored to the Berlin year, NOT the year switcher -->
	<div class={dimmed ? 'opacity-60' : ''} data-testid="lage-beitraege">
		<div class="flex items-baseline justify-between">
			<h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
				Beiträge {beitraege.year}
			</h3>
			{#if dimmed}
				<span class="text-xs text-ink-500" data-testid="lage-heute-label">Heute</span>
			{/if}
		</div>
		<p class="mt-2 text-sm font-medium text-ink-900">
			{beitraege.paidMemberCount}/{total} bezahlt
		</p>
		<div
			class="mt-2 flex h-2 overflow-hidden rounded-full bg-dataviz-track"
			role="img"
			aria-label={`${beitraege.paidMemberCount} von ${total} Beiträgen bezahlt, ${beitraege.overdueCount} überfällig`}
		>
			<div class="bg-dataviz-paid" style={`width:${paidPct}%`}></div>
			<div class="bg-severity-warn" style={`width:${overduePct}%`}></div>
		</div>
		<div class="mt-1.5 flex items-center gap-3 text-xs text-ink-500">
			<span class="inline-flex items-center gap-1">
				<span class="size-1.5 rounded-full bg-dataviz-paid" aria-hidden="true"></span> bezahlt
			</span>
			<span class="inline-flex items-center gap-1">
				<span class="size-1.5 rounded-full bg-severity-warn" aria-hidden="true"></span> überfällig
			</span>
			<span class="inline-flex items-center gap-1">
				<span class="size-1.5 rounded-full bg-dataviz-track" aria-hidden="true"></span> offen
			</span>
		</div>
		<p class="mt-1.5 text-sm tabular-nums text-ink-700" data-testid="lage-beitraege-sums">
			{formatMoney(beitraege.paidCents)} eingegangen · {formatMoney(beitraege.offenCents)} offen
		</p>
	</div>

	<hr class="my-4 border-(--hairline)" />

	<!-- (2) Sphären -->
	<div data-testid="lage-sphaeren">
		<h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Sphären</h3>
		<table class="mt-2 w-full text-sm">
			<tbody>
				{#each sphaeren as row (row.sphere)}
					<tr>
						<td class="py-1 text-ink-700">{SPHERE_LABELS[row.sphere]}</td>
						<td
							data-testid={`sphaere-saldo-${row.sphere}`}
							class={'py-1 text-right tabular-nums ' +
								(row.saldoCents < 0 ? 'text-severity-critical-text' : 'text-ink-700')}
						>
							{formatMoney(row.saldoCents)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- (3) WGB · § 64 AO — LAST; only once WGB > 0 AND a real Freigrenze is set
	     (freigrenzeCents > 0 guards the wgbPct division: a zeroed statutory
	     value would otherwise make einnahmenCents / 0 → Infinity → NaN bar). -->
	{#if wgb.einnahmenCents > 0 && wgb.freigrenzeCents > 0}
		<hr class="my-4 border-(--hairline)" />
		<div data-testid="lage-wgb">
			<div class="flex items-baseline justify-between gap-2">
				<h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
					WGB · § 64 AO
				</h3>
				<span class="text-xs tabular-nums text-ink-500">
					{formatMoney(wgb.einnahmenCents)} von {formatMoney(wgb.freigrenzeCents)}
				</span>
			</div>
			<div class="relative mt-2 h-1.5 rounded-full bg-dataviz-track">
				{#if wgb.status !== 'ok'}
					<div
						data-testid="lage-wgb-fill"
						class={'h-1.5 rounded-full ' + wgbFill}
						style={`width:${wgbPct}%`}
					></div>
				{:else}
					<div
						class={'h-1.5 rounded-full ' + wgbFill}
						style={`width:${wgbPct}%`}
					></div>
				{/if}
				<!-- 1px notch at the statutory limit (right edge of the track) -->
				<div class="absolute right-0 top-[-2px] h-[10px] w-px bg-ink-300" aria-hidden="true"></div>
			</div>
			{#if wgb.status === 'ueberschritten'}
				<p class="mt-1.5 text-xs text-severity-critical-text">Freigrenze überschritten</p>
			{:else if wgb.status === 'kritisch' || wgb.status === 'erhoeht'}
				<p class="mt-1.5 text-xs text-severity-warn-text">Freigrenze nähert sich</p>
			{/if}
		</div>
	{/if}
</section>
