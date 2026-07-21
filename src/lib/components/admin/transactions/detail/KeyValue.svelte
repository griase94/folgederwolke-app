<script lang="ts">
	/**
	 * KeyValue — one `.kv` row inside a FactsList: label left (on the shared
	 * `--facts-lbl` ruler), value right. A `sub` renders a quiet second line under
	 * the value. Rich values (sphere tag, payer avatar, project tag) come via the
	 * `children` snippet, which overrides the plain `value`.
	 *
	 * `fullWidth` drops the ruler for a long text value (e.g. a Kommentar or an
	 * IBAN) so it wraps as a full-width sub-line instead of being crushed/elided
	 * on the right rail (ANDY-LENS Präzisierung: „lange Texte als Vollbreiten-
	 * Subzeile; IBAN nie mittig elliptieren").
	 */
	import type { Snippet } from "svelte";

	interface Props {
		label: string;
		value?: string;
		sub?: string;
		/** Right value uses tabular figures (Beträge, Daten, Jahre). */
		tabular?: boolean;
		/** Value in the quiet ink-500 tone (e.g. „Kein Kommentar hinterlegt."). */
		muted?: boolean;
		/** Long text → value wraps full-width below the label. */
		fullWidth?: boolean;
		children?: Snippet;
	}

	let {
		label,
		value,
		sub,
		tabular = false,
		muted = false,
		fullWidth = false,
		children,
	}: Props = $props();
</script>

{#if fullWidth}
	<div
		class="border-b border-hairline py-2.5 last:border-0"
		data-slot="kv"
	>
		<dt class="mb-1 text-[13px] font-medium text-ink-500">{label}</dt>
		<dd class="text-sm {muted ? 'text-ink-500' : 'text-ink-900'}">
			{#if children}{@render children()}{:else}{value}{/if}
		</dd>
	</div>
{:else}
	<div
		class="grid grid-cols-[var(--facts-lbl)_1fr] items-baseline gap-3 border-b border-hairline py-2.5 last:border-0"
		data-slot="kv"
	>
		<dt class="text-[13px] font-medium text-ink-500">{label}</dt>
		<dd class="min-w-0 text-right text-sm {muted ? 'text-ink-500' : 'text-ink-900'}">
			{#if children}
				{@render children()}
			{:else}
				<span class={tabular ? "tabular-nums" : ""}>{value}</span>
			{/if}
			{#if sub}
				<span class="mt-0.5 block text-[11.5px] font-medium text-ink-500"
					>{sub}</span
				>
			{/if}
		</dd>
	</div>
{/if}
