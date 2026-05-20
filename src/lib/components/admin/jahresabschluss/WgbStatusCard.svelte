<script lang="ts" module>
	import type { WgbStatus } from '$lib/server/eur/index.js';
	import { formatMoney } from '$lib/components/ui/money/index.js';

	export interface WgbStatusCardProps {
		wgb: WgbStatus;
	}
</script>

<script lang="ts">
	let { wgb }: WgbStatusCardProps = $props();

	const ratio = $derived(
		Math.min(100, Math.round((wgb.einnahmenCents / wgb.thresholdCents) * 100))
	);

	const variant = $derived(
		wgb.bucket === 'over'
			? {
					border: 'border-rose-200 dark:border-rose-900/40',
					bg: 'bg-rose-50/40 dark:bg-rose-950/20',
					bar: 'bg-rose-500',
					title: 'text-rose-700 dark:text-rose-400',
					label: 'Freigrenze überschritten'
				}
			: wgb.bucket === 'warning'
				? {
						border: 'border-amber-200 dark:border-amber-900/40',
						bg: 'bg-amber-50/40 dark:bg-amber-950/20',
						bar: 'bg-amber-500',
						title: 'text-amber-800 dark:text-amber-400',
						label: 'Freigrenze fast erreicht'
					}
				: {
						border: 'border-emerald-200 dark:border-emerald-900/40',
						bg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
						bar: 'bg-emerald-500',
						title: 'text-emerald-800 dark:text-emerald-400',
						label: 'Im sicheren Bereich'
					}
	);
</script>

<div
	data-testid="wgb-status-card"
	data-bucket={wgb.bucket}
	class={`rounded-xl border ${variant.border} ${variant.bg} p-5 shadow-sm`}
>
	<div class="flex items-start justify-between gap-3">
		<div>
			<h3 class={`text-sm font-semibold ${variant.title}`}>
				WGB-Freigrenze · {variant.label}
			</h3>
			<p class="mt-1 text-xs text-muted-foreground">
				Wirtschaftlicher Geschäftsbetrieb · § 64 Abs. 3 AO
			</p>
		</div>
		<div class="text-right">
			<div class="text-xs text-muted-foreground">Schwellenwert</div>
			<div class="font-medium tabular-nums text-foreground">
				{formatMoney(wgb.thresholdCents)}
			</div>
		</div>
	</div>

	<div class="mt-3.5">
		<div class="flex items-baseline justify-between text-sm">
			<span class="font-medium text-foreground tabular-nums" data-testid="wgb-current">
				{formatMoney(wgb.einnahmenCents)}
			</span>
			<span
				class={wgb.remainingCents < 0
					? 'text-rose-700 dark:text-rose-400 tabular-nums font-medium'
					: 'text-muted-foreground tabular-nums'}
				data-testid="wgb-remaining"
			>
				{wgb.remainingCents >= 0
					? `noch ${formatMoney(wgb.remainingCents)}`
					: `${formatMoney(Math.abs(wgb.remainingCents))} über Grenze`}
			</span>
		</div>

		<!-- Progress bar -->
		<div
			class="mt-2 h-2 w-full overflow-hidden rounded-full bg-border/60"
			role="progressbar"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={ratio}
			aria-label="WGB-Freigrenze-Auslastung"
		>
			<div class={`h-full transition-all ${variant.bar}`} style:width={`${ratio}%`}></div>
		</div>
	</div>
</div>
