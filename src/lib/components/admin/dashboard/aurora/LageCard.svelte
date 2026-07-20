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
	import { type Sphere } from '$lib/domain/sphere.js';
	// Direct component imports (not the charts barrel) so the dashboard pulls
	// only these two into the client bundle, not the whole chart family — the
	// barrel isn't tree-shakeable (package has no `sideEffects: false`).
	import SphaerenBars from '$lib/components/charts/sphaeren/SphaerenBars.svelte';
	import AgingRail from '$lib/components/charts/stat-tiles/AgingRail.svelte';

	let {
		beitraege,
		dimmed,
		sphaeren,
		wgb,
		offeneErstattungen
	}: {
		beitraege: {
			year: number;
			/** Active members (austritts_datum IS NULL) — the universe. */
			memberCount: number;
			/** Active members marked beitragsbefreit this year (Ehrenmitglieder). */
			exemptMemberCount: number;
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
		/** Approved-but-not-yet-erstattet aging (dataviz aging rail). */
		offeneErstattungen?: {
			count: number;
			sumCents: number;
			oldestDays: number;
			fristDays: number;
		};
	} = $props();

	const sphaerenRows = $derived(
		sphaeren.map((s) => ({ sphere: s.sphere, cents: s.saldoCents }))
	);

	// Denominator = members EXPECTED to pay = active members minus exempt
	// (Ehrenmitglieder). The old `paidMemberCount + openMemberCount` only counted
	// members who already HAD a beitrags row, so genuinely-unpaid members with no
	// row vanished and "total" wrongly equalled "paid". (deep-verification HIGH)
	const total = $derived(Math.max(beitraege.memberCount - beitraege.exemptMemberCount, 0));
	// F9/F38: numerator + denominator now share one liable-in-year, non-exempt
	// population in the loader, so paidMemberCount can never exceed total. Clamp
	// defensively anyway so a future query drift can't render an impossible
	// "6/5 bezahlt" or overflow the progress bar past 100%.
	const paidMembers = $derived(Math.min(beitraege.paidMemberCount, total));
	const paidPct = $derived(total === 0 ? 0 : Math.min((paidMembers / total) * 100, 100));
	const overduePct = $derived(
		total === 0 ? 0 : Math.min((beitraege.overdueCount / total) * 100, 100)
	);
	// „Offen" = unpaid but not yet overdue (openMemberCount includes overdue).
	// v6 meter order: bezahlt (grün) · offen (amber) · überfällig (rot).
	const openNotOverdue = $derived(
		Math.max(beitraege.openMemberCount - beitraege.overdueCount, 0)
	);
	const openPct = $derived(total === 0 ? 0 : Math.min((openNotOverdue / total) * 100, 100));

	// "Nothing materialized" — no member_beitrags rows exist for this year, so
	// every aggregate is zero. Distinct from "all paid" (which has paidCents > 0)
	// and from "all open" (offenCents > 0). Showing "0/N bezahlt · 0,00 offen"
	// here reads like a debt that doesn't exist, so we render a CTA instead.
	const noBeitraege = $derived(
		beitraege.paidMemberCount === 0 &&
			beitraege.overdueCount === 0 &&
			beitraege.paidCents === 0 &&
			beitraege.offenCents === 0
	);

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

<section class="rounded-2xl bg-card p-4 shadow-(--shadow-card)" aria-labelledby="lage-heading">
	<!-- Desktop-only: gives the card the same header rhythm as the Aufgaben
	     column. Hidden on mobile (single stack) so it doesn't eat the
	     above-the-fold budget; aria-labelledby still resolves the name. -->
	<h2 id="lage-heading" class="mb-3 hidden text-sm font-semibold tracking-tight text-ink-900 md:block">
		Lage
	</h2>

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
		{#if noBeitraege}
			<!-- No member_beitrags rows for this year — friendly CTA instead of a
			     misleading "0 bezahlt / 0,00 offen" debt-like read. -->
			<p class="mt-2 text-sm text-ink-700" data-testid="lage-beitraege-empty">
				Noch keine Beiträge für {beitraege.year} erfasst.
			</p>
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href="/app/einstellungen/beitraege"
				class="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				data-testid="lage-beitraege-cta"
			>
				Beiträge einrichten →
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{:else}
			<p class="mt-2 text-sm font-medium text-ink-900">
				{paidMembers}/{total} bezahlt{#if beitraege.exemptMemberCount > 0}<span class="font-normal text-ink-500">&nbsp;· {beitraege.exemptMemberCount} befreit</span>{/if}
			</p>
			<!-- v6 status meter: bezahlt GRÜN · offen AMBER · überfällig ROT (kein Lila). -->
			<div
				class="mt-2 flex h-2 gap-px overflow-hidden rounded-full bg-dataviz-track"
				role="img"
				aria-label={`${paidMembers} von ${total} Beiträgen bezahlt, ${openNotOverdue} offen, ${beitraege.overdueCount} überfällig${beitraege.exemptMemberCount > 0 ? `, ${beitraege.exemptMemberCount} befreit` : ''}`}
			>
				<div class="bg-type-einnahme" style={`width:${paidPct}%`}></div>
				<div class="bg-severity-warn" style={`width:${openPct}%`}></div>
				<div class="bg-severity-critical" style={`width:${overduePct}%`}></div>
			</div>
			<div class="mt-1.5 flex items-center gap-3 text-xs text-ink-500">
				<span class="inline-flex items-center gap-1">
					<span class="size-1.5 rounded-full bg-type-einnahme" aria-hidden="true"></span> bezahlt
				</span>
				<span class="inline-flex items-center gap-1">
					<span class="size-1.5 rounded-full bg-severity-warn" aria-hidden="true"></span> offen
				</span>
				<span class="inline-flex items-center gap-1">
					<span class="size-1.5 rounded-full bg-severity-critical" aria-hidden="true"></span> überfällig
				</span>
			</div>
			<p class="mt-1.5 text-sm tabular-nums text-ink-700" data-testid="lage-beitraege-sums">
				{formatMoney(beitraege.paidCents)} eingegangen · {formatMoney(beitraege.offenCents)} offen
			</p>
		{/if}
	</div>

	<hr class="my-4 border-(--hairline)" />

	<!-- (2) Sphären — sorted mini-bars (dataviz sphaere-v7 dense) -->
	<div data-testid="lage-sphaeren">
		<h3 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Sphären-Saldo</h3>
		<SphaerenBars rows={sphaerenRows} dense totalLabel="Saldo" />
	</div>

	<!-- (2b) Offene Erstattungen — aging rail -->
	{#if offeneErstattungen && offeneErstattungen.count > 0}
		<hr class="my-4 border-(--hairline)" />
		<div data-testid="lage-erstattungen">
			<div class="mb-2 flex items-baseline justify-between gap-2">
				<h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Offene Erstattungen</h3>
				<span class="text-xs tabular-nums text-ink-500">
					{offeneErstattungen.count}
					{offeneErstattungen.count === 1 ? 'Auslage' : 'Auslagen'} · {formatMoney(offeneErstattungen.sumCents)}
				</span>
			</div>
			<AgingRail daysOld={offeneErstattungen.oldestDays} fristDays={offeneErstattungen.fristDays} />
		</div>
	{/if}

	<!-- (3) WGB · § 64 AO — LAST; only once WGB > 0 AND a real Freigrenze is set
	     (freigrenzeCents > 0 guards the wgbPct division: a zeroed statutory
	     value would otherwise make einnahmenCents / 0 → Infinity → NaN bar). -->
	{#if wgb.einnahmenCents > 0 && wgb.freigrenzeCents > 0}
		<hr class="my-4 border-(--hairline)" />
		<div data-testid="lage-wgb">
			<div class="flex items-baseline justify-between gap-2">
				<h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
					Wirtschaftl. Geschäftsbetrieb · § 64 AO
				</h3>
				<span class="text-xs tabular-nums text-ink-500">
					{formatMoney(wgb.einnahmenCents)} von {formatMoney(wgb.freigrenzeCents)}
				</span>
			</div>
			<div class="relative mt-2 h-1.5 rounded-full bg-dataviz-track">
				<div
					data-testid="lage-wgb-fill"
					class={'h-1.5 rounded-full ' + wgbFill}
					style={`width:${wgbPct}%`}
				></div>
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
