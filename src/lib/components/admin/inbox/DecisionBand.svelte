<!--
  DecisionBand — INTERIM STUB (replaced in full by Task D.1). Renders the
  minimal approve/reject controls so the review route typechecks and the open
  state is functional before the shared-edge grid + FormFooter land.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import type { KategorieOption } from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import RejectDialog from '$lib/components/admin/inbox/RejectDialog.svelte';

	let {
		submissionId,
		ausId,
		kategorieOptions,
		festgeschriebenBis = null,
		currentYear
	}: {
		submissionId: string;
		ausId: string;
		kategorieOptions: KategorieOption[];
		festgeschriebenBis?: number | null;
		currentYear: number;
	} = $props();

	let kategorieName = $state('');
	let rejectOpen = $state(false);
	let approving = $state(false);
</script>

<div class="flex flex-col gap-3">
	<form
		method="POST"
		action="?/approve"
		use:enhance={() => {
			approving = true;
			return async ({ result, update }) => {
				approving = false;
				if (result.type === 'success') {
					toast.success('Freigegeben');
					await update();
				} else if (result.type === 'failure') {
					const d = result.data as { error?: string } | null;
					toast.error(d?.error ?? 'Freigabe fehlgeschlagen.');
				} else {
					toast.error('Freigabe fehlgeschlagen.');
				}
			};
		}}
	>
		<input type="hidden" name="submissionId" value={submissionId} />
		<KategoriePicker
			id="approve-kategorie"
			name="kategorieName"
			options={kategorieOptions}
			value={kategorieName}
			onChange={(n) => (kategorieName = n)}
			onSphere={() => {}}
			required
		/>
		<button
			type="submit"
			disabled={approving || !kategorieName}
			class="mt-3 flex h-11 w-full items-center justify-center rounded-[10px] bg-primary-strong px-5 text-sm font-semibold text-white disabled:opacity-50"
			>Freigeben</button
		>
	</form>
	<button
		type="button"
		onclick={() => (rejectOpen = true)}
		class="flex h-11 items-center justify-center rounded-[10px] border border-hairline bg-white px-4 text-sm font-medium text-severity-critical-text"
		>Ablehnen</button
	>
</div>

<RejectDialog bind:open={rejectOpen} {submissionId} {ausId} formAction="?/reject" />
