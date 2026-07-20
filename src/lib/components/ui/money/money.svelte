<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	export type MoneyForceSign = "always" | "never" | "auto";

	export type MoneyProps = WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		/** Integer cents (per ADR-0003). 12345 → 123,45 €. */
		valueInCents: number;
		/** Sign rendering policy. Default 'auto' (minus on negative only). */
		forceSign?: MoneyForceSign;
	};

	const fmtCache = new Map<string, Intl.NumberFormat>();
	function getFormatter(signDisplay: "auto" | "always" | "never"): Intl.NumberFormat {
		const key = signDisplay;
		let fmt = fmtCache.get(key);
		if (!fmt) {
			fmt = new Intl.NumberFormat("de-DE", {
				style: "currency",
				currency: "EUR",
				signDisplay,
			});
			fmtCache.set(key, fmt);
		}
		return fmt;
	}

	export function formatMoney(valueInCents: number, forceSign: MoneyForceSign = "auto"): string {
		const euros = valueInCents / 100;
		// Intl de-DE emits an ASCII hyphen-minus (U+002D) for negatives; normalise
		// to the real MINUS SIGN (U+2212) so every money string across the app reads
		// typographically correct and column-aligns with the plus (ANDY-LENS §4).
		return getFormatter(forceSign).format(euros).replace(/[-‐]/g, "−");
	}
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		class: className,
		valueInCents,
		forceSign = "auto",
		...restProps
	}: MoneyProps = $props();

	const formatted = $derived(formatMoney(valueInCents, forceSign));
	const tone = $derived(
		valueInCents > 0
			? "text-emerald-600 dark:text-emerald-500"
			: valueInCents < 0
				? "text-rose-600 dark:text-rose-500"
				: "text-muted-foreground"
	);
</script>

<span
	bind:this={ref}
	data-slot="money"
	data-testid="money"
	class={cn("tabular-nums font-medium", tone, className)}
	{...restProps}
>
	{formatted}
</span>
