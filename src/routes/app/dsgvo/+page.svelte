<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types.js';
	import AuskunftPreview from '$lib/components/admin/dsgvo/AuskunftPreview.svelte';
	import PseudonymiseConfirm from '$lib/components/admin/dsgvo/PseudonymiseConfirm.svelte';

	let { form }: { form: ActionData } = $props();

	let email = $state('');
	let submittingAuskunft = $state(false);
	let submittingPseudo = $state(false);

	let confirmModal: PseudonymiseConfirm | undefined = $state();

	// When the auskunft action returns successfully, keep the email in sync
	$effect(() => {
		if (form?.action === 'auskunft' && form?.success && form.summary?.email) {
			email = form.summary.email;
		}
		if (form?.action === 'pseudonymise' && form?.success) {
			// Reset email field after successful pseudonymisation
			email = '';
		}
	});
</script>

<svelte:head>
	<title>DSGVO – {page.data.vereinName}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8 lg:px-8">
	<h1 class="text-2xl font-bold text-foreground">DSGVO-Verwaltung</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		Datenschutz-Auskunft (Art. 15) und Pseudonymisierung (Art. 17) für eine E-Mail-Adresse.
	</p>

	<!-- Search / Email input -->
	<div class="mt-8 rounded-xl border border-border bg-card px-6 py-5 shadow-sm">
		<h2 class="text-base font-semibold text-foreground">E-Mail-Adresse</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			Gib die E-Mail-Adresse der betroffenen Person ein, dann wähle eine Aktion.
		</p>

		<div class="mt-4">
			<label for="dsgvo-email" class="text-xs font-medium text-foreground">E-Mail</label>
			<input
				id="dsgvo-email"
				type="email"
				name="email"
				bind:value={email}
				required
				autocomplete="off"
				placeholder="person@example.com"
				data-testid="dsgvo-email-input"
				class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
			/>
		</div>

		<!-- Error display -->
		{#if form?.error}
			<div
				class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
				role="alert"
				data-testid="dsgvo-error"
			>
				{form.error}
			</div>
		{/if}

		<!-- CTA buttons -->
		<div class="mt-5 flex flex-col gap-3 sm:flex-row">
			<!-- Auskunft generieren -->
			<form
				method="POST"
				action="?/auskunft"
				class="flex-1"
				use:enhance={() => {
					submittingAuskunft = true;
					return async ({ update }) => {
						await update();
						submittingAuskunft = false;
					};
				}}
			>
				<input type="hidden" name="email" value={email} />
				<button
					type="submit"
					disabled={submittingAuskunft || !email.includes('@')}
					data-testid="auskunft-btn"
					class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
				>
					{#if submittingAuskunft}
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
						Wird gesammelt…
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<circle cx="11" cy="11" r="8" />
							<line x1="21" y1="21" x2="16.65" y2="16.65" />
						</svg>
						Auskunft generieren
					{/if}
				</button>
			</form>

			<!-- Pseudonymisieren -->
			<button
				type="button"
				disabled={submittingPseudo || !email.includes('@')}
				onclick={() => confirmModal?.open(email)}
				data-testid="pseudonymise-btn"
				class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900 shadow-sm transition-colors hover:bg-red-100 disabled:opacity-50"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
					<polyline points="16 17 21 12 16 7" />
					<line x1="21" y1="12" x2="9" y2="12" />
				</svg>
				Pseudonymisieren
			</button>
		</div>
	</div>

	<!-- Auskunft result / preview -->
	{#if form?.action === 'auskunft' && form?.success && form?.summary}
		<div class="mt-6" data-testid="auskunft-result">
			<AuskunftPreview
				summary={{
					email: form.summary.email,
					members: form.summary.members,
					donations: form.summary.donations,
					auslagenSubmissions: form.summary.auslagenSubmissions,
					sentMails: form.summary.sentMails,
					auditLogEntries: form.summary.auditLogEntries,
					filename: form.filename,
					pdfBase64: form.pdfBase64
				}}
			/>
		</div>
	{/if}

	<!-- Pseudonymise success confirmation -->
	{#if form?.action === 'pseudonymise' && form?.success}
		<div
			class="mt-6 rounded-xl border border-green-200 bg-green-50 px-6 py-5"
			data-testid="pseudonymise-success"
		>
			<h3 class="text-base font-semibold text-green-900">Pseudonymisierung abgeschlossen</h3>
			<p class="mt-1 text-sm text-green-800">
				Personenbezogene Daten für <strong>{form.email}</strong> wurden gelöscht bzw. pseudonymisiert.
				Gesetzlich aufzubewahrende Buchungsnachweise (Beträge, Daten, Buchungsjahr) sowie der
				manipulationssichere Audit-Log (ADR-0004, § 257 HGB / § 147 AO) bleiben erhalten.
			</p>
			{#if form?.result}
				<dl class="mt-3 grid grid-cols-2 gap-2 text-xs text-green-800 sm:grid-cols-3">
					<div>
						<dt class="text-green-600">Mitglieder</dt>
						<dd class="font-semibold">{form.result.membersPseudonymised}</dd>
					</div>
					<div>
						<dt class="text-green-600">Benutzer gelöscht</dt>
						<dd class="font-semibold">{form.result.usersDeleted}</dd>
					</div>
					<div>
						<dt class="text-green-600">Sessions</dt>
						<dd class="font-semibold">{form.result.sessionsDeleted}</dd>
					</div>
					<div>
						<dt class="text-green-600">Magic Links</dt>
						<dd class="font-semibold">{form.result.magicLinksDeleted}</dd>
					</div>
					<div>
						<dt class="text-green-600">Spenden geschwärzt</dt>
						<dd class="font-semibold">{form.result.donationsRedacted}</dd>
					</div>
					{#if form.result.donationsSkipped > 0}
						<div>
							<dt class="text-amber-600">Spenden übersprungen (festgeschrieben)</dt>
							<dd class="font-semibold">{form.result.donationsSkipped}</dd>
						</div>
					{/if}
					<div>
						<dt class="text-green-600">E-Mails geschwärzt</dt>
						<dd class="font-semibold">{form.result.sentMailsRedacted}</dd>
					</div>
					<div>
						<dt class="text-amber-600">Audit-Log</dt>
						<dd class="font-semibold">
							{#if form.result.auditLogPayloadsRedacted > 0}
								{form.result.auditLogPayloadsRedacted} geschwärzt
							{:else}
								aufbewahrt (Manipulationsschutz)
							{/if}
						</dd>
					</div>
				</dl>
			{/if}
		</div>
	{/if}
</div>

<!-- Destructive confirm modal -->
<PseudonymiseConfirm bind:this={confirmModal} bind:submitting={submittingPseudo} onclose={() => {}} />
