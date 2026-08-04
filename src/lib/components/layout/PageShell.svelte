<!--
  PageShell — Aurora layout primitive (master §2.3 FROZEN contract, spec §4).

  EVERY /app route renders through it; enforcement is the shrinking-allowlist
  meta-test tests/unit/aurora-pageshell-allowlist.test.ts.

  Max-width by content type (spec §2 R6.1 — three widths, no in-betweens):
    form → 640px (create/edit forms) · list → 1100px (lists/tables)
    · wide → 1680px (dashboard, inbox detail, workspaces).
  There is no unbounded width: on an ultra-wide display an app screen must
  neither hang as a narrow channel in an empty plain nor stretch a text column
  past readability (Andys Regel 6).

  ONE horizontal padding scale per breakpoint on the 4px grid: 16 / 24 / 32.
  Bottom padding: AdminShell's <main> owns mobile tab-bar + home-indicator
  clearance uniformly (pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0).
  PageShell adds its own desktop bottom padding (md:pb-12) on top of that.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		width = 'list',
		rail = false,
		children
	}: {
		width?: 'form' | 'list' | 'wide';
		/**
		 * R6.3 — this list docks a 320px KPI rail beside it at the `rail`
		 * breakpoint, so the shell relaxes to the ratified `wide` cap from 2240px
		 * up; below that it stays an ordinary `list`. Only meaningful with
		 * width="list". StatCardStrip orientation="rail" is the other half.
		 */
		rail?: boolean;
		children: Snippet;
	} = $props();

	const WIDTH_CLASS: Record<'form' | 'list' | 'wide', string> = {
		form: 'max-w-[640px]',
		list: 'max-w-[1100px]',
		wide: 'max-w-[1680px]'
	};
</script>

<div
	data-page-shell
	data-width={width}
	data-rail={rail ? '' : undefined}
	class={[
		'mx-auto w-full px-4 pt-6 pb-6 sm:px-6 md:pt-8 md:pb-12 lg:px-8',
		WIDTH_CLASS[width],
		rail && 'rail:max-w-[1680px]'
	]}
>
	{@render children()}
</div>
