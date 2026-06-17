<script lang="ts">
	/**
	 * ConfirmDialog — consequence confirm (master §2.6, spec §9.3).
	 * States WHAT HAPPENS (consequence) before any destructive action;
	 * irreversible actions (Jahresabschluss) pass typedConfirm — the confirm
	 * button stays disabled until the user types the exact phrase.
	 */
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let {
		open = $bindable(false),
		title,
		consequence,
		typedConfirm,
		confirmLabel = 'Bestätigen',
		onConfirm
	}: {
		open?: boolean;
		title: string;
		consequence: string;
		typedConfirm?: string;
		confirmLabel?: string;
		onConfirm: () => void;
	} = $props();

	let typed = $state('');
	const confirmEnabled = $derived(!typedConfirm || typed === typedConfirm);

	function cancel(): void {
		open = false;
		typed = '';
	}
	function confirm(): void {
		if (!confirmEnabled) return;
		open = false;
		typed = '';
		onConfirm();
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) typed = ''; }}>
	<Dialog.Content data-testid="confirm-dialog">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{consequence}</Dialog.Description>
		</Dialog.Header>

		{#if typedConfirm}
			<label class="flex flex-col gap-1.5 text-sm">
				<span class="text-ink-700">
					Zum Bestätigen <strong class="font-semibold text-ink-900">{typedConfirm}</strong> eingeben:
				</span>
				<input
					data-testid="confirm-dialog-input"
					bind:value={typed}
					type="text"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					class="h-11 rounded-[10px] border border-hairline bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring md:h-10 sm:text-sm"
				/>
			</label>
		{/if}

		<Dialog.Footer class="gap-2">
			<button
				type="button"
				onclick={cancel}
				class="flex h-11 items-center justify-center rounded-[10px] border border-hairline bg-background px-4 text-sm font-medium text-ink-700 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10"
			>
				Abbrechen
			</button>
			<button
				type="button"
				data-testid="confirm-dialog-confirm"
				disabled={!confirmEnabled}
				onclick={confirm}
				class="flex h-11 items-center justify-center rounded-[10px] bg-severity-critical px-4 text-sm font-semibold text-white hover:bg-severity-critical/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
			>
				{confirmLabel}
			</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
