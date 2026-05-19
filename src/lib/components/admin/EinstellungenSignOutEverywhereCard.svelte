<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let confirmOpen = $state(false);
	let submitting = $state(false);
</script>

<div class="rounded-xl border border-border bg-card p-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex-1">
			<h3 class="text-base font-semibold text-foreground">Überall abmelden</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				Meldet dich auf allen Geräten und Browsern ab. Bestehende Sitzungen werden sofort
				ungültig — du wirst auch hier abgemeldet.
			</p>
		</div>
		<Button
			variant="outline"
			size="sm"
			class="shrink-0 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
			onclick={() => (confirmOpen = true)}
		>
			<svg
				class="mr-1.5 h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
				/>
			</svg>
			Überall abmelden
		</Button>
	</div>
</div>

<!-- Confirmation modal -->
<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="animate-in fade-in-0 fixed inset-0 z-50 bg-black/50 motion-reduce:animate-none" />
		<Dialog.Content
			class="animate-in fade-in-0 zoom-in-95 fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-lg motion-reduce:animate-none"
		>
			<Dialog.Header>
				<Dialog.Title class="text-base font-semibold text-foreground">
					Überall abmelden?
				</Dialog.Title>
				<Dialog.Description class="mt-1.5 text-sm text-muted-foreground">
					Alle aktiven Sitzungen — auch diese — werden sofort beendet. Du musst dich danach
					erneut mit einem Magic Link anmelden.
				</Dialog.Description>
			</Dialog.Header>

			<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					variant="outline"
					onclick={() => (confirmOpen = false)}
					disabled={submitting}
				>
					Abbrechen
				</Button>

				<form
					method="post"
					action="/sign-out?/everywhere"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
				>
					<Button
						type="submit"
						class="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
						disabled={submitting}
					>
						{#if submitting}
							<svg
								class="mr-1.5 h-4 w-4 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
							Abmelden…
						{:else}
							Ja, überall abmelden
						{/if}
					</Button>
				</form>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
