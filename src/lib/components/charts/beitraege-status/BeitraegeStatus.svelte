<script lang="ts" module>
	export interface BeitragStateInput {
		count: number;
		/** Amount for this state, integer cents. */
		cents: number;
	}
	export interface BeitraegeStatusProps {
		/** Total Soll (all liable members), integer cents. */
		sollCents: number;
		/** Eingegangen / Kassenstand, integer cents. */
		eingegangenCents: number;
		/** Regelbeitrag per member, integer cents. */
		perMemberCents: number;
		/** Liable member population (denominator). */
		total: number;
		paid: BeitragStateInput;
		open: BeitragStateInput;
		over: BeitragStateInput;
		exempt: BeitragStateInput;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Beiträge-Status (dataviz §6 beitraege-status-v6) — deliberately a readout,
	 * not a chart. The Beitragskasse € leads; the four states (Bezahlt · Offen ·
	 * Überfällig · Befreit) each name count · share · betrag; a slim segmented
	 * meter splits the Soll by state. Fully static — every number is printed.
	 */
	import { eurCents, pctWhole } from "../_shared/format.js";

	let {
		sollCents,
		eingegangenCents,
		perMemberCents,
		total,
		paid,
		open,
		over,
		exempt,
		class: className,
	}: BeitraegeStatusProps = $props();

	type Key = "paid" | "open" | "over" | "exempt";
	const meta: Record<Key, { label: string; note: string; mark: string; ink: string }> = {
		paid: { label: "Bezahlt", note: "eingegangen", mark: "var(--st-paid)", ink: "var(--st-paid-ink)" },
		open: { label: "Offen", note: "noch nicht bezahlt", mark: "var(--st-open)", ink: "var(--st-open-ink)" },
		over: { label: "Überfällig", note: "Zahlungsfrist vorbei", mark: "var(--st-over)", ink: "var(--st-over-ink)" },
		exempt: { label: "Befreit", note: "Beitrag erlassen", mark: "var(--st-exempt)", ink: "var(--st-exempt-ink)" },
	};
	const HATCH = "repeating-linear-gradient(45deg,rgb(255 255 255/.34) 0 2px,transparent 2px 5px)";

	const states = $derived([
		{ key: "paid" as Key, ...paid },
		{ key: "open" as Key, ...open },
		{ key: "over" as Key, ...over },
		{ key: "exempt" as Key, ...exempt },
	]);

	const pctPaid = $derived(total > 0 ? Math.round((paid.count / total) * 100) : 0);
	function sharePct(count: number): number {
		return total > 0 ? Math.round((count / total) * 100) : 0;
	}
</script>

<section data-slot="beitraege-status" data-testid="beitraege-status" class={["rounded-2xl bg-card p-6 shadow-(--shadow-card)", className]}>
	<div class="mb-5 flex items-start justify-between gap-6">
		<div>
			<p class="text-[11px] font-bold uppercase tracking-[0.08em] text-primary-text">Beitragskasse · Kassenstand</p>
			<p class="mt-1.5 text-base font-bold text-ink-900">Wer hat gezahlt — und wie viel ist in der Kasse</p>
		</div>
		<div class="flex flex-none flex-col items-end gap-1.5 whitespace-nowrap">
			<span class="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-300">Mitglieder bezahlt</span>
			<span class="flex items-baseline gap-2">
				<span class="text-3xl font-extrabold leading-none tracking-[-0.02em] text-ink-900">{paid.count}</span>
				<span class="text-ink-300">/</span>
				<span class="text-lg font-bold text-ink-500">{total}</span>
				<span class="text-lg font-extrabold leading-none" style:color="var(--st-paid-ink)">{pctPaid} %</span>
			</span>
		</div>
	</div>

	<div class="grid gap-6 md:grid-cols-[minmax(300px,0.92fr)_minmax(0,1.28fr)]">
		<!-- Kasse hero + segmented meter -->
		<div class="flex flex-col rounded-2xl border border-(--hairline) p-[22px]" style:background="linear-gradient(180deg,color-mix(in srgb,var(--st-paid) 6%,transparent),color-mix(in srgb,var(--ink-900) 1.5%,transparent))">
			<p class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">Beitragskasse</p>
			<p class="mt-3.5 flex flex-wrap items-baseline gap-2.5">
				<span data-testid="beitraege-kasse" class="text-[38px] font-extrabold leading-none tracking-[-0.022em] text-ink-900">{eurCents(eingegangenCents)}</span>
				<span class="text-[13.5px] font-semibold text-ink-500">von <b class="font-bold text-ink-700">{eurCents(sollCents)}</b> Soll</span>
			</p>
			<p class="mt-2 text-[12.5px] text-ink-500"><b class="font-extrabold" style:color="var(--st-paid-ink)">{pctPaid} %</b> des Beitragssolls eingegangen</p>

			<!-- segmented meter -->
			<div data-testid="beitraege-meter" class="mt-4 flex h-3.5 gap-0.5 overflow-hidden rounded-full" style:background="var(--dataviz-track)" role="img" aria-label={`Soll aufgeteilt: ${paid.count} bezahlt, ${open.count} offen, ${over.count} überfällig, ${exempt.count} befreit`}>
				{#each states as st (st.key)}
					<div class="h-full min-w-[3px]" style:flex={`${sharePct(st.count)} 0 auto`} style:background-color={meta[st.key].mark} style:background-image={st.key === "exempt" ? HATCH : undefined}></div>
				{/each}
			</div>
			<div class="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
				{#each states as st (st.key)}
					<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-500">
						<span class="size-[9px] rounded-[3px]" style:background-color={meta[st.key].mark} style:background-image={st.key === "exempt" ? HATCH : undefined}></span>
						{meta[st.key].label}
					</span>
				{/each}
			</div>

			<p class="mt-3.5 border-t border-(--hairline) pt-3 text-[11.5px] text-ink-500">
				Regelbeitrag <b class="font-bold tabular-nums text-ink-700">{eurCents(perMemberCents)}</b> je Mitglied · Soll = {total} × {eurCents(perMemberCents)}
			</p>
		</div>

		<!-- four state rows -->
		<div class="flex flex-col justify-center">
			{#each states as st (st.key)}
				<div
					data-testid={`beitraege-row-${st.key}`}
					class="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-(--hairline) px-2 py-3.5 first:border-t-0"
					style:background={st.key === "over" ? "linear-gradient(90deg,color-mix(in srgb,var(--st-over) 6%,transparent),transparent 70%)" : undefined}
					style:border-radius={st.key === "over" ? "11px" : undefined}
				>
					<span class="flex size-[38px] items-center justify-center rounded-[11px]" style:background-color={`color-mix(in srgb,${meta[st.key].mark} 15%,#fff)`} style:background-image={st.key === "exempt" ? "repeating-linear-gradient(45deg,rgb(36 24 48/.05) 0 3px,transparent 3px 7px)" : undefined} style:color={meta[st.key].ink}>
						<svg viewBox="0 0 24 24" class="size-[19px]" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							{#if st.key === "paid"}<path d="M20 6 9 17l-5-5" />
							{:else if st.key === "open"}<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
							{:else if st.key === "over"}<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" />
							{:else}<circle cx="12" cy="12" r="9" /><path d="M8 12h8" />{/if}
						</svg>
					</span>
					<span class="min-w-0">
						<span class="block text-[15px] font-extrabold leading-tight" style:color={meta[st.key].ink}>{meta[st.key].label}</span>
						<span class="text-[11.5px] tabular-nums text-ink-500"><b class="font-extrabold text-ink-900">{st.count}</b> {st.count === 1 ? "Mitglied" : "Mitglieder"} · <b class="font-extrabold" style:color={meta[st.key].ink}>{pctWhole(sharePct(st.count))}</b></span>
					</span>
					<span class="text-right text-[17px] font-extrabold tabular-nums" style:color={st.key === "over" ? "var(--st-over-ink)" : "var(--ink-900)"}>{eurCents(st.cents)}</span>
				</div>
			{/each}
		</div>
	</div>
</section>
