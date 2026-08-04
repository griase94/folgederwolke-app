<script lang="ts">
	/**
	 * Member Auslage submit surface. The form is the SHARED AuslagenForm in
	 * `mode="member"` — same fields, same batch loop, same draft/offline
	 * mechanics as the public arm. This page owns only what is member-specific:
	 * the confirmed identity, the A/B/C payout block, and the in-shell receipt.
	 */
	import { ArrowLeft } from '@lucide/svelte';
	import AuslagenForm from '$lib/components/forms/AuslagenForm.svelte';
	import LockedIdentity from '$lib/components/portal/LockedIdentity.svelte';
	import PayoutBlock from '$lib/components/portal/PayoutBlock.svelte';
	import SubmitHandoff from '$lib/components/portal/SubmitHandoff.svelte';
	import { validateIban } from '$lib/domain/iban.js';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const member = $derived(data.member);
	const maskedIban = $derived(member.maskedIban);

	// Payout state lives here because the CTA gate needs it — PayoutBlock and
	// this page agree on validity through the SAME validateIban.
	let iban = $state('');
	// Initial default only: Fall B (nothing on file) pre-checks "save it", Fall
	// A/C do not. The member's stored IBAN cannot change while this page lives.
	// svelte-ignore state_referenced_locally
	let saveToProfile = $state(!member.maskedIban);
	let override = $state(false);

	// Fall A needs no input at all; B and C do.
	const payoutValid = $derived(
		maskedIban && !override ? true : validateIban(iban)
	);
	const payoutHint = $derived(
		maskedIban && override
			? 'Fehlt noch: eine gültige IBAN.'
			: 'Fehlt noch: IBAN fürs Zurücküberweisen.'
	);

	/**
	 * What the form has to TRANSPORT to the server. Fall A (stored IBAN, toggle
	 * closed) sends nothing — the server snapshots the stored one, and the full
	 * IBAN never leaves the server anyway. Fall B and C send the typed one.
	 */
	const erstattung = $derived(
		maskedIban && !override ? null : { iban, saveToProfile }
	);

	const handoff = $derived(form && 'handoff' in form ? form.handoff : null);
	const serverError = $derived(
		form && 'error' in form ? ((form.error as string) ?? null) : null
	);
	const itemErrors = $derived(
		form && 'itemErrors' in form
			? (form.itemErrors as Record<string, Record<string, string[]>>)
			: null
	);
	const formErrors = $derived(
		form && 'formErrors' in form ? (form.formErrors as string[]) : null
	);
	const erstattungError = $derived(
		form && 'erstattungErrors' in form
			? ((form.erstattungErrors as Record<string, string[]>)?.iban?.[0] ?? undefined)
			: undefined
	);
</script>

<svelte:head><title>Auslage einreichen · Mein Portal</title></svelte:head>

{#if handoff}
	<SubmitHandoff
		vorname={member.vorname}
		items={handoff.items}
		gesamtCents={handoff.gesamtCents}
		statusHref={handoff.statusHref}
	/>
{:else}
	<div class="mb-5 flex items-center gap-2">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- static in-app portal routes -->
		<a
			href="/portal"
			class="inline-flex size-10 items-center justify-center rounded-[10px] text-ink-500 transition-colors hover:bg-secondary hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			aria-label="Zurück zur Übersicht"
			data-testid="einreichen-back"
		>
			<ArrowLeft class="size-[18px]" aria-hidden="true" />
		</a>
		<h1 class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Auslage einreichen</h1>
	</div>

	<AuslagenForm
		mode="member"
		action=""
		projects={data.projects}
		maxBatchItems={data.maxBatchItems}
		{serverError}
		{formErrors}
		{itemErrors}
		{payoutValid}
		{payoutHint}
		{erstattung}
	>
		{#snippet identity()}
			<LockedIdentity
				vorname={member.vorname}
				nachname={member.nachname}
				email={member.email}
				confirm
			/>
		{/snippet}
		{#snippet payout()}
			<PayoutBlock
				{maskedIban}
				bind:iban
				bind:saveToProfile
				bind:override
				error={erstattungError}
			/>
			<!-- Aufwandsspende stays an honest "not yet", not a half-wired path. -->
			<p class="mt-3 flex items-center gap-2 text-xs leading-snug text-ink-500">
				<span
					class="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-ink-700"
					>In Vorbereitung</span
				>
				Auf die Erstattung verzichten (Aufwandsspende)? Richten wir bald mit dem Steuerberater ein.
			</p>
		{/snippet}
	</AuslagenForm>
{/if}
