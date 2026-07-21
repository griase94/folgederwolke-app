<!--
	DocSheet — a paper-white document preview panel (F1 shared primitive).

	Shows, near-verbatim, what a PDF will say (Zuwendungsbestätigung / GoBD /
	Jahresabschluss exports). Document density, not app chrome. WYSIWYG: the
	sheet is *physical paper* and deliberately does NOT invert in dark mode —
	like the Beleg photo (kit ext doc-sheet.css, abnahme #30). It therefore pins
	a fixed light palette (--dp-*) and color-scheme:light rather than the theme
	tokens, so body text inherits dark ink on white paper in BOTH modes.

	Callers compose the body inside the default snippet. For on-paper secondary
	text use the exposed vars, e.g. `style="color: var(--dp-faint)"`; do NOT use
	theme text tokens (text-ink-*) inside — those invert and would vanish.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	export interface DocSheetProps {
		/** Small uppercase kicker above the title. */
		eyebrow?: string;
		title?: string;
		subtitle?: string;
		class?: string;
		'data-testid'?: string;
		children?: Snippet;
	}
</script>

<script lang="ts">
	let {
		eyebrow,
		title,
		subtitle,
		class: className,
		'data-testid': testId = 'doc-sheet',
		children
	}: DocSheetProps = $props();
</script>

<div
	class={cn('doc-sheet rounded-[14px] shadow-card', className)}
	data-testid={testId}
	data-slot="doc-sheet"
	data-paper="fixed-light"
>
	{#if eyebrow}<span class="doc-eyebrow">{eyebrow}</span>{/if}
	{#if title}<p class="doc-title">{title}</p>{/if}
	{#if subtitle}<p class="doc-subtitle">{subtitle}</p>{/if}
	{@render children?.()}
</div>

<style>
	/* Physical paper: fixed light literals so the sheet never inverts in dark
	   (sanctioned non-token hexes — a document is a document, spec ext doc-sheet).
	   Body text inherits --dp-ink via `color`. */
	.doc-sheet {
		--dp-paper: #ffffff;
		--dp-ink: #1a1126;
		--dp-ink2: #3a3050;
		--dp-faint: #6d6481;
		--dp-line: rgb(36 24 48 / 0.06);
		--dp-line2: rgb(36 24 48 / 0.1);
		--dp-accent: #7c3aed; /* Spende violet — the Zuwendungsbestätigung accent */
		--dp-accent-tint: #efeafb;
		color-scheme: light;
		background: var(--dp-paper);
		color: var(--dp-ink);
		border: 1px solid var(--dp-line2);
		padding: 30px 34px 26px;
		font-variant-numeric: tabular-nums;
		/* A pathological ultra-long token (e.g. a spaceless spender name or IBAN)
		   must wrap onto the paper, never overflow the sheet. */
		overflow-wrap: break-word;
	}
	.doc-eyebrow {
		display: block;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dp-faint);
		margin-bottom: 10px;
	}
	.doc-title {
		font-size: 15px;
		font-weight: 800;
		line-height: 1.4;
		letter-spacing: -0.005em;
		color: var(--dp-ink);
		margin: 0;
	}
	.doc-subtitle {
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--dp-faint);
		margin-top: 5px;
	}
</style>
