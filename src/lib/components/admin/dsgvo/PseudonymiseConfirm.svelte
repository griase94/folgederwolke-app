<script lang="ts">
	import { enhance } from '$app/forms';

	interface Props {
		onclose: () => void;
		submitting?: boolean;
	}

	let { onclose, submitting = $bindable(false) }: Props = $props();

	let confirmEmail = $state('');
	let targetEmail = $state('');
	let showModal = $state(false);

	export function open(email: string) {
		targetEmail = email;
		confirmEmail = '';
		showModal = true;
	}

	export function close() {
		showModal = false;
		confirmEmail = '';
		targetEmail = '';
	}

	const canSubmit = $derived(confirmEmail.trim() === targetEmail.trim() && targetEmail.length > 0);
</script>

{#if showModal}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="pseudonymise-title"
		data-testid="pseudonymise-modal"
	>
		<div class="w-full max-w-md rounded-xl bg-background shadow-xl">
			<div class="px-6 py-5">
				<h2 id="pseudonymise-title" class="text-lg font-semibold text-foreground">
					Pseudonymisierung bestätigen
				</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					Alle personenbezogenen Daten der E-Mail-Adresse
					<strong class="font-semibold text-foreground">{targetEmail}</strong>
					werden <strong>unwiderruflich pseudonymisiert</strong>. Buchungsdaten (§147 AO) werden
					beibehalten, aber PII-Felder geschwärzt. Der Benutzeraccount wird gelöscht.
				</p>

				<div class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
					<strong>Achtung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. Stelle sicher,
					dass eine Auskunft (Art. 15 DSGVO) exportiert wurde, bevor du fortfährst.
				</div>

				<div class="mt-4">
					<label for="pseudonymise-confirm-email" class="text-xs font-medium text-foreground">
						E-Mail-Adresse zur Bestätigung eingeben:
					</label>
					<input
						id="pseudonymise-confirm-email"
						type="email"
						bind:value={confirmEmail}
						placeholder={targetEmail}
						autocomplete="off"
						data-testid="confirm-email-input"
						class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
					/>
				</div>
			</div>

			<div class="flex justify-end gap-3 border-t border-border px-6 py-4">
				<button
					type="button"
					onclick={close}
					disabled={submitting}
					class="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
				>
					Abbrechen
				</button>

				<form
					method="POST"
					action="?/pseudonymise"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
							close();
							onclose();
						};
					}}
				>
					<input type="hidden" name="email" value={targetEmail} />
					<input type="hidden" name="confirm" value={confirmEmail} />
					<button
						type="submit"
						disabled={submitting || !canSubmit}
						data-testid="pseudonymise-submit-btn"
						class="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
					>
						{#if submitting}
							<svg
								class="h-4 w-4 animate-spin"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								></path>
							</svg>
							Wird pseudonymisiert…
						{:else}
							Ja, Daten pseudonymisieren
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
