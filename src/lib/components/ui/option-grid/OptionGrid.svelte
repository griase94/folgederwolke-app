<script lang="ts" module>
	export interface OptionGridItem {
		value: string;
		label: string;
		/**
		 * Spans the full row. For a trailing catch-all ("Sonstiges") that is not a
		 * peer of the paired options — giving it half a row would claim it is.
		 */
		full?: boolean;
	}
</script>

<script lang="ts">
	/**
	 * OptionGrid — a compact radio grid of mutually exclusive presets.
	 *
	 * Native `<input type="radio">` under the hood, deliberately: arrow-key
	 * navigation, the roving tab stop and screen-reader group semantics all come
	 * for free and none of them are re-implementable to the same quality. The
	 * input is visually hidden but focusable; the card reacts through `peer-*`.
	 *
	 * For choosing a VALUE from a small set. Switching between views of the same
	 * data is a SegmentedControl (variant="lens") — different question, different
	 * semantics (tablist).
	 */
	let {
		options,
		value = $bindable(''),
		name,
		legend,
		testid = 'option-grid',
		onselect
	}: {
		options: OptionGridItem[];
		value?: string;
		/** Form field name — set it when the grid submits with a form. */
		name?: string;
		legend: string;
		testid?: string;
		/** Fires only on a real user pick, never on a programmatic `value` change. */
		onselect?: (value: string) => void;
	} = $props();

	function pick(next: string): void {
		value = next;
		onselect?.(next);
	}
</script>

<fieldset data-testid={testid}>
	<legend class="mb-2 text-[12.5px] font-bold text-ink-700">{legend}</legend>
	<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
		{#each options as option (option.value)}
			<label
				data-testid="{testid}-{option.value}"
				data-selected={value === option.value ? '' : undefined}
				class={[
					'flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-hairline bg-card px-3 py-2 transition-colors md:min-h-10',
					'hover:bg-secondary has-[:checked]:border-primary has-[:checked]:bg-primary/5',
					'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
					option.full && 'sm:col-span-2'
				]}
			>
				<input
					type="radio"
					{name}
					value={option.value}
					checked={value === option.value}
					onchange={() => pick(option.value)}
					class="peer sr-only"
				/>
				<span
					class="grid size-5 shrink-0 place-items-center rounded-full border-2 border-input bg-card transition-colors peer-checked:border-primary"
				>
					<span
						class="size-2.5 rounded-full bg-primary opacity-0 transition-opacity peer-checked:opacity-100"
					></span>
				</span>
				<span class="text-[13px] leading-tight font-semibold text-ink-700">{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>
