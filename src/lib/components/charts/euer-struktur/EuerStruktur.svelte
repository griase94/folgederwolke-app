<script lang="ts" module>
	export interface EuerCategory {
		name: string;
		/** Amount, integer cents. */
		cents: number;
	}
	export interface EuerStrukturProps {
		einnahmen: EuerCategory[];
		ausgaben: EuerCategory[];
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * EÜR-Ergebnis (dataviz §6 euer-struktur-v9) — two labelled blocks on one
	 * shared €-axis (Einnahmen green sorted, then Ausgaben rose sorted), each row
	 * name + betrag direct at the bar. A result strip compares the two sums; the
	 * green overhang gap IS the Überschuss and flips to a rose „Fehlbetrag" strip
	 * in a minus year. Hover a bar → Anteil an der Gruppe + Gruppensumme.
	 */
	import { eurWhole, pctWhole, eurWholeSigned } from "../_shared/format.js";
	import { TOKEN } from "../_shared/tokens.js";
	import { barRight, niceAxis, r2 } from "../_shared/geometry.js";
	import { watchFineHover } from "../_shared/interaction.js";
	import { onMount } from "svelte";

	let { einnahmen, ausgaben, class: className }: EuerStrukturProps = $props();

	const CAP = 10;
	function fold(arr: EuerCategory[]): EuerCategory[] {
		const sorted = [...arr].sort((a, b) => b.cents - a.cents);
		if (sorted.length <= CAP) return sorted;
		const head = sorted.slice(0, CAP - 1);
		const tail = sorted.slice(CAP - 1);
		return [...head, { name: `Sonstige (${tail.length})`, cents: tail.reduce((a, r) => a + r.cents, 0) }];
	}
	const ein = $derived(fold(einnahmen));
	const aus = $derived(fold(ausgaben));
	const incSum = $derived(einnahmen.reduce((a, r) => a + r.cents, 0));
	const expSum = $derived(ausgaben.reduce((a, r) => a + r.cents, 0));
	const result = $derived(incSum - expSum);
	const deficit = $derived(result < 0);

	// ── two-block chart geometry ───────────────────────────────────────────
	const vbW = 700;
	const ml = 158;
	const mr = 70;
	const rh = 26;
	const headH = 24;
	const grpGap = 20;
	const mtop = 6;
	const axisH = 24;
	const bt = 14;
	const plotW = vbW - ml - mr;

	const axis = $derived(niceAxis(Math.max(1, ...ein.map((r) => r.cents), ...aus.map((r) => r.cents))));
	const xFor = $derived((v: number) => ml + (v / (axis.max || 1)) * plotW);

	type Placed = { name: string; cents: number; y: number; group: "ein" | "aus"; grpSum: number; grpLabel: string };
	const placed = $derived.by(() => {
		const rows: Placed[] = [];
		let y = mtop;
		const groups = [
			{ tag: "EINNAHMEN", key: "ein" as const, arr: ein, sum: incSum },
			{ tag: "AUSGABEN", key: "aus" as const, arr: aus, sum: expSum },
		];
		const headers: { tag: string; sum: number; y: number; key: "ein" | "aus" }[] = [];
		for (let gi = 0; gi < groups.length; gi++) {
			const grp = groups[gi];
			if (!grp) continue;
			headers.push({ tag: grp.tag, sum: grp.sum, y, key: grp.key });
			y += headH;
			for (const seg of grp.arr) {
				rows.push({ name: seg.name, cents: seg.cents, y, group: grp.key, grpSum: grp.sum, grpLabel: grp.tag });
				y += rh;
			}
			if (gi < groups.length - 1) y += grpGap;
		}
		return { rows, headers, bottom: y };
	});
	const vbH = $derived(placed.bottom + axisH);

	let fineHover = $state(false);
	onMount(() => watchFineHover((v) => (fineHover = v)));
	let activeName = $state<string | null>(null);

	// ── result strip (overhang comparison) ─────────────────────────────────
	const comp = $derived.by(() => {
		const cvbW = 560;
		const cml = 84;
		const cmr = 12;
		const cmt = 8;
		const cbt = 22;
		const gap = 9;
		const localMax = Math.max(incSum, expSum) || 1;
		const x0 = cml;
		const trackW = cvbW - cml - cmr;
		const xF = (v: number) => x0 + (v / localMax) * trackW;
		const y1 = cmt;
		const y2 = cmt + cbt + gap;
		const a = xF(Math.min(incSum, expSum));
		const b = xF(Math.max(incSum, expSum));
		const bandTop = y1 - 3;
		const bandBot = y2 + cbt + 3;
		const mid = Math.max(x0 + 40, Math.min((a + b) / 2, cvbW - 40));
		const ly = bandBot + 6 + 14;
		return { cvbW, cvbH: ly + 8 + 9, x0, xF, y1, y2, cbt, a, b, bandTop, bandBot, mid, ly };
	});
</script>

<div data-slot="euer-struktur" data-testid="euer-struktur" class={["flex flex-col gap-6", className]}>
	<!-- result strip -->
	<div class="overflow-hidden rounded-2xl border" style:border-color={deficit ? "var(--crit-ring, var(--sev-critical))" : "var(--ein-ring, var(--type-einnahme))"}>
		<div class="h-[5px]" style:background-color={deficit ? TOKEN.over : TOKEN.einnahme}></div>
		<div class="grid gap-6 p-6 md:grid-cols-[300px_1fr]">
			<div>
				<p class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em]" style:color={deficit ? TOKEN.overText : "var(--einnahme-strong)"}>
					{deficit ? "Fehlbetrag" : "Überschuss"} · Ergebnis
				</p>
				<p data-testid="euer-result" class="mt-1 text-[52px] font-extrabold leading-none tracking-[-0.02em] tabular-nums" style:color={deficit ? TOKEN.overText : "var(--einnahme-strong)"}>{eurWholeSigned(result)}</p>
				<div class="mt-3 grid grid-cols-[14px_1fr_auto] items-baseline gap-x-2 gap-y-1 text-[13.5px]">
					<span class="font-extrabold text-ink-300"></span><span class="text-ink-700">Einnahmen</span><span class="text-right font-bold tabular-nums" style:color="var(--einnahme-strong)">{eurWhole(incSum)}</span>
					<span class="font-extrabold text-ink-300">−</span><span class="text-ink-700">Ausgaben</span><span class="text-right font-bold tabular-nums" style:color="var(--ausgabe-text)">{eurWhole(expSum)}</span>
					<span class="col-span-3 my-0.5 h-px" style:background-color={TOKEN.hairline}></span>
					<span class="font-extrabold" style:color={deficit ? TOKEN.overText : "var(--einnahme-strong)"}>=</span><span class="font-extrabold text-ink-900">{deficit ? "Fehlbetrag" : "Überschuss"}</span><span class="text-right text-[15px] font-extrabold tabular-nums" style:color={deficit ? TOKEN.overText : "var(--einnahme-strong)"}>{eurWhole(Math.abs(result))}</span>
				</div>
			</div>
			<div class="md:border-l md:border-(--hairline) md:pl-8">
				<p class="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-500">Summenvergleich · die {deficit ? "rote" : "grüne"} Lücke ist das Ergebnis</p>
				<svg viewBox={`0 0 ${comp.cvbW} ${comp.cvbH}`} class="mt-2 block h-auto w-full overflow-visible" role="img" aria-label={`Summenvergleich: Einnahmen ${eurWhole(incSum)}, Ausgaben ${eurWhole(expSum)}, Ergebnis ${eurWholeSigned(result)}`}>
					<rect x={r2(comp.a)} y={r2(comp.bandTop)} width={r2(comp.b - comp.a)} height={r2(comp.bandBot - comp.bandTop)} rx="4" style:fill={deficit ? "var(--crit-band, var(--dataviz-deficit-tint))" : "var(--ein-band, var(--type-einnahme-tint))"} />
					<path d={barRight(comp.x0, comp.y1, comp.xF(incSum) - comp.x0, comp.cbt, 4)} style:fill={TOKEN.einnahme} />
					<path d={barRight(comp.x0, comp.y2, comp.xF(expSum) - comp.x0, comp.cbt, 4)} style:fill={TOKEN.ausgabe} />
					<line x1={r2(comp.a)} y1={r2(comp.bandTop)} x2={r2(comp.a)} y2={r2(comp.bandBot + 5)} style:stroke={deficit ? TOKEN.over : TOKEN.einnahme} stroke-width="1.5" />
					<text x={r2(comp.x0 - 10)} y={r2(comp.y1 + comp.cbt / 2 + 3.4)} text-anchor="end" font-size="11.5" font-weight="700" style:fill={TOKEN.ink700}>Einnahmen</text>
					<text x={r2(comp.x0 - 10)} y={r2(comp.y2 + comp.cbt / 2 + 3.4)} text-anchor="end" font-size="11.5" font-weight="700" style:fill={TOKEN.ink700}>Ausgaben</text>
					<text x={r2(comp.mid)} y={r2(comp.ly)} text-anchor="middle" font-size="14" font-weight="800" class="tabular-nums" style:fill={deficit ? TOKEN.overText : "var(--einnahme-strong)"}>{eurWholeSigned(result)}</text>
					<text x={r2(comp.mid)} y={r2(comp.ly + 18)} text-anchor="middle" font-size="8.5" font-weight="750" letter-spacing="0.11em" style:fill={TOKEN.ink300}>{deficit ? "FEHLBETRAG" : "ÜBERSCHUSS"}</text>
				</svg>
			</div>
		</div>
	</div>

	<!-- two-block category chart -->
	<div class="relative rounded-2xl border border-(--hairline) bg-card p-5">
		<p class="mb-3 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-500">Nach Kategorie · Einnahmen − Ausgaben</p>
		<svg viewBox={`0 0 ${vbW} ${vbH}`} class="block h-auto w-full overflow-visible" role="img" aria-label={`Einnahmen ${eurWhole(incSum)} über ${einnahmen.length} Kategorien, Ausgaben ${eurWhole(expSum)} über ${ausgaben.length} Kategorien`}>
			{#each axis.ticks as t (t)}
				<line x1={r2(xFor(t))} y1={mtop} x2={r2(xFor(t))} y2={placed.bottom} style:stroke={TOKEN.hairline} stroke-width="1" />
				<text x={r2(xFor(t))} y={placed.bottom + 16} text-anchor="middle" font-size="10.5" class="tabular-nums" style:fill={TOKEN.ink500}>{eurWhole(t)}</text>
			{/each}
			<line x1={ml} y1={mtop} x2={ml} y2={placed.bottom} style:stroke={TOKEN.ink300} stroke-width="1" />

			{#each placed.headers as h (h.tag)}
				<text x="6" y={r2(h.y + headH - 9)} font-size="11.5" font-weight="800" letter-spacing="0.02em" style:fill={TOKEN.ink900}>{h.tag}</text>
				<text x={vbW - mr + 60} y={r2(h.y + headH - 9)} text-anchor="end" font-size="11.5" font-weight="800" class="tabular-nums" style:fill={h.key === "ein" ? "var(--einnahme-strong)" : "var(--ausgabe-text)"}>{eurWhole(h.sum)}</text>
				<line x1={ml} y1={r2(h.y + headH - 2)} x2={vbW - mr + 60} y2={r2(h.y + headH - 2)} style:stroke={TOKEN.hairline} stroke-width="1" />
			{/each}

			{#each placed.rows as row (row.group + row.name)}
				{@const cy = row.y + rh / 2}
				{@const bw = Math.max(xFor(row.cents) - ml, 2.5)}
				{#if activeName === row.group + row.name}
					<rect x="2" y={r2(row.y + 1)} width={vbW - 4} height={rh - 2} rx="5" style:fill={TOKEN.ink900} fill-opacity="0.04" />
				{/if}
				<text x={r2(ml - 10)} y={r2(cy + 3.6)} text-anchor="end" font-size="11.5" font-weight="600" style:fill={TOKEN.ink700}>{row.name}</text>
				<path d={barRight(ml, cy - bt / 2, bw, bt, 3)} style:fill={row.group === "ein" ? TOKEN.einnahme : TOKEN.ausgabe} />
				<text x={r2(ml + bw + 7)} y={r2(cy + 3.6)} font-size="11" font-weight="700" class="tabular-nums" style:fill={TOKEN.ink900}>{eurWhole(row.cents)}</text>
				<rect x="0" y={r2(row.y)} width={vbW} height={rh} fill="transparent" role="img" aria-label={`${row.name}: ${eurWhole(row.cents)}, ${pctWhole(Math.round((row.cents / (row.grpSum || 1)) * 100))} der ${row.grpLabel === "EINNAHMEN" ? "Einnahmen" : "Ausgaben"}`} onpointerenter={() => fineHover && (activeName = row.group + row.name)} onpointerleave={() => (activeName = null)} />
			{/each}
		</svg>
	</div>

	<table class="sr-only" data-testid="euer-table">
		<caption>EÜR-Struktur</caption>
		<thead><tr><th>Gruppe</th><th>Kategorie</th><th>Betrag</th></tr></thead>
		<tbody>
			{#each ein as r (r.name)}<tr><td>Einnahmen</td><td>{r.name}</td><td>{eurWhole(r.cents)}</td></tr>{/each}
			<tr><td>Einnahmen</td><td>Summe</td><td>{eurWhole(incSum)}</td></tr>
			{#each aus as r (r.name)}<tr><td>Ausgaben</td><td>{r.name}</td><td>{eurWhole(r.cents)}</td></tr>{/each}
			<tr><td>Ausgaben</td><td>Summe</td><td>{eurWhole(expSum)}</td></tr>
			<tr><td>Ergebnis</td><td>{deficit ? "Fehlbetrag" : "Überschuss"}</td><td>{eurWholeSigned(result)}</td></tr>
		</tbody>
	</table>
</div>
