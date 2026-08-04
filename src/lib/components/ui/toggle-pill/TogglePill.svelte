<script lang="ts" module>
	export interface TogglePillProps {
		label: string;
		/** Current on/off state — rendered as aria-pressed. */
		pressed: boolean;
		onToggle: () => void;
		class?: string;
		[key: `data-${string}`]: string | undefined;
	}
</script>

<script lang="ts">
	/**
	 * TogglePill — a multi-select filter toggle in the FilterChips visual grammar
	 * (28px pill on desktop / 32px on mobile inside a ≥44px hit area, 13px/600,
	 * active = solid primary-strong on white).
	 *
	 * It exists next to `FilterChips` because the two are different controls:
	 * FilterChips is a FROZEN single-select URL segment control (one active value,
	 * writes ?param=, aria-current), while a filter popover needs independent
	 * multi-select toggles driven by callbacks (aria-pressed). Sharing the visual
	 * grammar keeps them one family without bending the frozen contract.
	 *
	 * The container decides the arrangement: a `flex flex-wrap` parent gives the
	 * wrap-pill row (Sphäre, Status, …), a `grid grid-cols-4` parent gives the
	 * month picker — one primitive, two layouts, no second component.
	 */
	let { label, pressed, onToggle, class: className, ...rest }: TogglePillProps = $props();
</script>

<button
	type="button"
	aria-pressed={pressed}
	onclick={onToggle}
	class={[
		'flex min-h-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 md:min-h-10',
		className
	]}
	{...rest}
>
	<span
		class={[
			'flex h-8 w-full items-center justify-center rounded-full px-3 text-[13px] font-semibold transition-colors md:h-7',
			pressed
				? 'bg-primary-strong text-white'
				: 'border border-hairline bg-background text-ink-700 hover:bg-secondary'
		]}>{label}</span
	>
</button>
