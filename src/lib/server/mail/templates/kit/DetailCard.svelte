<script lang="ts" module>
	/**
	 * One fact row of a mail detail card.
	 *
	 * `variant` drives the value cell only — the label ruler is identical for
	 * every row, which is what makes the block scannable (Abnahme #3: ALL values
	 * right-aligned on ONE ruler, numbers/codes/dates additionally tabular).
	 */
	export interface MailFactRow {
		label: string;
		value: string;
		/** text (default) · mono for codes/references · amount for the plum EUR digit · num for dates. */
		variant?: 'text' | 'mono' | 'amount' | 'num';
		/**
		 * A substring of `value` that must never break across lines — the AUS-Nr
		 * inside a Verwendungszweck, which is worthless to a reader if it wraps.
		 * Ignored when the value does not contain it.
		 */
		keepTogether?: string;
	}
</script>

<script lang="ts">
	/**
	 * DetailCard — the fact block shared by all three decision mails.
	 *
	 * `surface` picks the container: `plain` (quiet card, the default fact block),
	 * `tint` (lavender, when the block carries more weight) or `bare` (no
	 * container at all — for nesting inside PaidCard, so the emerald card keeps
	 * ONE row renderer instead of a second copy of the alignment rules).
	 */
	import {
		HAIRLINE,
		INK_500,
		INK_900,
		MONO_STACK,
		PAID_LABEL,
		PAID_VALUE,
		PLUM,
		ROW_K_CLASS,
		ROW_V_CLASS,
		SURFACE_PLAIN,
		SURFACE_TINT
	} from './tokens.js';

	let {
		rows,
		surface = 'plain',
		tone = 'default'
	}: {
		rows: MailFactRow[];
		surface?: 'plain' | 'tint' | 'bare';
		tone?: 'default' | 'paid';
	} = $props();

	const CONTAINER: Record<'plain' | 'tint' | 'bare', string> = {
		plain: `background:${SURFACE_PLAIN};border:1px solid ${HAIRLINE};border-radius:12px;padding:14px 20px;margin:0 0 16px;`,
		tint: `background:${SURFACE_TINT};border-radius:12px;padding:14px 20px;margin:0 0 16px;`,
		bare: ''
	};

	const labelColor = $derived(tone === 'paid' ? PAID_LABEL : INK_500);
	const valueColor = $derived(tone === 'paid' ? PAID_VALUE : INK_900);
	const labelWidth = $derived(tone === 'paid' ? 130 : 150);

	/** Split a value so `keepTogether` can be wrapped in a non-breaking span. */
	function split(row: MailFactRow): { pre: string; keep: string; post: string } {
		const needle = row.keepTogether;
		if (!needle) return { pre: row.value, keep: '', post: '' };
		const at = row.value.indexOf(needle);
		if (at === -1) return { pre: row.value, keep: '', post: '' };
		return {
			pre: row.value.slice(0, at),
			keep: needle,
			post: row.value.slice(at + needle.length)
		};
	}

	function valueStyle(row: MailFactRow): string {
		const variant = row.variant ?? 'text';
		const tabular =
			variant === 'text' ? '' : 'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;';
		const mono = variant === 'mono' ? `font-family:${MONO_STACK};letter-spacing:0.2px;` : '';
		const amount =
			variant === 'amount' ? `font-size:15px;font-weight:700;color:${PLUM};` : `color:${valueColor};`;
		// Fact blocks align all values on one right-hand ruler (Abnahme #3). The
		// paid card doesn't: its long mono Verwendungszweck is a reference string
		// to compare against a bank statement, and a right-aligned wrapped
		// reference is exactly the thing you cannot compare. One LABEL ruler is
		// what that card promises.
		const align = tone === 'paid' ? 'left' : 'right';
		return `padding:5px 0;font-size:13px;line-height:1.5;vertical-align:top;text-align:${align};overflow-wrap:break-word;${amount}${mono}${tabular}`;
	}
</script>

<table
	role="presentation"
	cellspacing="0"
	cellpadding="0"
	border="0"
	width="100%"
	lang="de"
	style="{CONTAINER[surface]}width:100%;border-collapse:separate;border-spacing:0;"
>
	<tbody>
		{#each rows as row (row.label)}
			{@const parts = split(row)}
			<tr>
				<td
					class={ROW_K_CLASS}
					style="color:{labelColor};width:{labelWidth}px;font-size:13px;line-height:1.5;padding:5px 12px 5px 0;vertical-align:top;text-align:left;font-weight:400;"
					>{row.label}</td
				>
				<td class={ROW_V_CLASS} style={valueStyle(row)}
					>{parts.pre}{#if parts.keep}<span style="white-space:nowrap;">{parts.keep}</span
						>{parts.post}{/if}</td
				>
			</tr>
		{/each}
	</tbody>
</table>
