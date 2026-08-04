<script lang="ts">
	import { ArrowLeft, Mail } from '@lucide/svelte';
	import LockedIdentity from '$lib/components/portal/LockedIdentity.svelte';
	import IbanInlineEdit from '$lib/components/portal/IbanInlineEdit.svelte';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const member = $derived(data.member);
	// After a save the action answers with the fresh masked value; before that
	// the layout's copy is current.
	const maskedIban = $derived(
		form && 'maskedIban' in form
			? ((form.maskedIban as string | null) ?? null)
			: member.maskedIban
	);
	const ibanError = $derived(
		form && 'ibanError' in form ? ((form.ibanError as string) ?? null) : null
	);
	const mailto = $derived(
		`mailto:${data.kontaktEmail}?subject=${encodeURIComponent('Meine Daten im Mitglieder-Portal')}`
	);
</script>

<svelte:head><title>Mein Profil · Mein Portal</title></svelte:head>

<div class="mb-5 flex items-center gap-2">
	<!-- eslint-disable svelte/no-navigation-without-resolve -- static in-app portal routes -->
	<a
		href="/portal"
		class="inline-flex size-10 items-center justify-center rounded-[10px] text-ink-500 transition-colors hover:bg-secondary hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		aria-label="Zurück zur Übersicht"
		data-testid="profil-back"
	>
		<ArrowLeft class="size-[18px]" aria-hidden="true" />
	</a>
	<h1 class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Mein Profil</h1>
</div>

<LockedIdentity
	class="mb-4"
	vorname={member.vorname}
	nachname={member.nachname}
	email={member.email}
	profilHref={null}
/>

<section
	class="rounded-[16px] border border-hairline bg-secondary px-4 pb-1"
	aria-labelledby="profil-konto-heading"
>
	<div class="border-b border-hairline py-3">
		<h2 id="profil-konto-heading" class="text-[13px] font-semibold text-ink-700">
			Dein Konto für Erstattungen
		</h2>
	</div>
	<IbanInlineEdit {maskedIban} action="?/iban" error={ibanError} />
</section>

<p class="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
	<Mail class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
	<span>
		Name oder E-Mail stimmen nicht mehr? Die pflegt der Vorstand —
		<!-- eslint-disable svelte/no-navigation-without-resolve -- static in-app portal routes -->
		<a href={mailto} class="font-semibold text-primary-text underline">schreib uns kurz</a>, dann
		ändern wir das.
	</span>
</p>
