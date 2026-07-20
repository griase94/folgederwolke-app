<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CustomerFormFields from './CustomerFormFields.svelte';
	import { cn } from '$lib/utils.js';

	let {
		open = $bindable(false),
		onSuccess
	}: {
		open: boolean;
		/** Fired after a successful add — the list refreshes, the invoice form
		 *  selects the new customer (quick-add context). */
		onSuccess?: (customerId: string) => void;
	} = $props();

	let loading = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let name = $state('');

	function reset() {
		errors = {};
		loading = false;
		name = '';
	}

	const canSubmit = $derived(name.trim().length > 0 && !loading);
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) reset();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		class="gap-0 overflow-hidden p-0 sm:max-w-[460px] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none"
	>
		<!-- brand accent bar -->
		<div class="h-1 w-full bg-gradient-brand" aria-hidden="true"></div>
		<!-- mobile grab handle -->
		<div class="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-ink-300/60 sm:hidden" aria-hidden="true"></div>

		<!-- header -->
		<div class="flex items-center gap-3 border-b border-hairline px-5 py-4">
			<div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-brand-soft text-primary-text" aria-hidden="true">
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 21V5a2 2 0 012-2h8a2 2 0 012 2v16M6 10H4a2 2 0 00-2 2v7a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-2M10 8h4m-4 4h4m-4 9v-3a2 2 0 014 0v3" />
				</svg>
			</div>
			<div class="min-w-0">
				<Dialog.Title class="text-lg font-bold tracking-tight text-ink-900">Kunde anlegen</Dialog.Title>
				<Dialog.Description class="text-xs text-ink-500">Pflicht ist nur der Name.</Dialog.Description>
			</div>
			<Dialog.Close
				class="ml-auto grid h-9 w-9 shrink-0 place-items-center self-start rounded-lg border border-border text-ink-500 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Schließen"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
			</Dialog.Close>
		</div>

		<form
			method="POST"
			action="?/add"
			use:enhance={() => {
				loading = true;
				errors = {};
				const submitted = name.trim();
				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'failure') {
						errors = (result.data?.errors as Record<string, string[]>) ?? {};
					} else if (result.type === 'success') {
						const customerId = (result.data?.customerId as string | undefined) ?? '';
						toast.success(`${submitted} angelegt`);
						open = false;
						reset();
						onSuccess?.(customerId);
						await update();
					} else {
						await update();
					}
				};
			}}
		>
			<div class="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto px-5 py-5 max-sm:max-h-[62vh]">
				<CustomerFormFields idPrefix="add-cust" {errors} bind:name />

				{#if errors['_']}
					<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors['_']?.[0]}</p>
				{/if}
			</div>

			<div class="flex flex-col-reverse gap-2 border-t border-hairline px-5 py-4 sm:flex-row sm:justify-end">
				<Dialog.Close>
					{#snippet child({ props })}
						<Button variant="outline" type="button" {...props} disabled={loading} class="sm:w-auto">Abbrechen</Button>
					{/snippet}
				</Dialog.Close>
				<Button
					type="submit"
					disabled={!canSubmit}
					data-testid="add-customer-submit"
					class={cn(
						'sm:w-auto',
						'disabled:bg-secondary disabled:text-ink-400 disabled:opacity-100'
					)}
				>
					{#if loading}
						<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
						</svg>
						Wird angelegt …
					{:else}
						Kunde anlegen
					{/if}
				</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
