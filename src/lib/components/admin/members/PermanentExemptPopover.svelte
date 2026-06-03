<script lang="ts">
	/**
	 * PermanentExemptPopover — read-only Ehrenmitglied cell (spec §7.8a).
	 *
	 * Shows the permanent Befreiungs-Grund (from members.beitrag_exempt_reason)
	 * and a link to the member-edit screen where the permanent exemption is
	 * managed. No mutation happens here — permanent exemption is global, not
	 * per-year.
	 */
	import { Button } from '$lib/components/ui/button/index.js';
	import Ban from '@lucide/svelte/icons/ban';
	import Lock from '@lucide/svelte/icons/lock';

	let {
		memberId,
		year,
		memberName,
		exemptReason = null
	}: {
		memberId: string;
		year: number;
		memberName: string;
		exemptReason?: string | null;
	} = $props();

	const titleId = $derived(`perm-exempt-title-${memberId}-${year}`);
	const editHref = $derived(`/app/mitglieder/${memberId}/bearbeiten`);
</script>

<div
	role="dialog"
	aria-labelledby={titleId}
	class="flex max-w-[280px] flex-col gap-2 p-1"
	data-popover="permanently-exempt"
>
	<h2
		id={titleId}
		class="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400"
	>
		<Ban size={14} class="shrink-0" aria-hidden="true" />
		<Lock size={12} class="shrink-0 text-slate-500" aria-hidden="true" />
		{memberName} · DAUERHAFT BEFREIT
	</h2>
	<p class="text-sm text-foreground">Grund: {exemptReason ?? '—'}</p>

	<div class="flex justify-end">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<Button variant="outline" size="sm" href={editHref}>Mitglied bearbeiten →</Button>
	</div>
</div>
