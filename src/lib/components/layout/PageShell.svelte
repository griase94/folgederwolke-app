<!--
  PageShell — Aurora layout primitive (master §2.3 FROZEN contract, spec §4).

  EVERY /app route renders through it; enforcement is the shrinking-allowlist
  meta-test tests/unit/aurora-pageshell-allowlist.test.ts.

  Max-width by content type (spec §4 dimension table):
    form → 640px (create/edit forms) · list → 1100px (lists/tables)
    · full → no max (dashboard 12-col grid).
  ONE horizontal padding scale per breakpoint on the 4px grid: 16 / 24 / 32.
  Bottom padding: AdminShell's <main> owns mobile tab-bar + home-indicator
  clearance uniformly (pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0).
  PageShell adds its own desktop bottom padding (md:pb-12) on top of that.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		width = 'list',
		children
	}: { width?: 'form' | 'list' | 'full'; children: Snippet } = $props();

	const WIDTH_CLASS: Record<'form' | 'list' | 'full', string> = {
		form: 'max-w-[640px]',
		list: 'max-w-[1100px]',
		full: 'max-w-none'
	};
</script>

<div
	data-page-shell
	data-width={width}
	class="mx-auto w-full px-4 pt-6 pb-6 sm:px-6 md:pt-8 md:pb-12 lg:px-8 {WIDTH_CLASS[width]}"
>
	{@render children()}
</div>
