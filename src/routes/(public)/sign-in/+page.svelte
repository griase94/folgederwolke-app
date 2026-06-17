<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import InlineAlert from '$lib/components/public/InlineAlert.svelte';
	import AuslageBridgeCard from '$lib/components/public/AuslageBridgeCard.svelte';
	import type { PageData } from './$types.js';
	import type { SignInReason } from './+page.server.js';

	// B-2 — `data.reason` is whitelist-validated on the server (load fn);
	// the page only renders banner copy for values it knows about, and
	// never echoes raw querystring into HTML.
	let {
		form,
		data
	}: {
		form: { ok?: boolean; email?: string; message?: string; error?: string } | null;
		data: PageData;
	} = $props();

	type ReasonAlert = {
		severity: 'info' | 'warn';
		text: string;
		linkHref?: string;
		linkLabel?: string;
	};

	const REASON_ALERTS: Record<SignInReason, ReasonAlert> = {
		'signed-out': { severity: 'info', text: 'Du wurdest abgemeldet.' },
		'signed-out-everywhere': {
			severity: 'info',
			text: 'Du wurdest auf allen Geräten abgemeldet.'
		},
		'public-form-coming-soon': {
			severity: 'info',
			text: 'Das öffentliche Formular ist momentan nicht aktiv.'
		},
		'not-authorised': {
			severity: 'warn',
			text: 'Dein Account hat keinen Zugriff auf diese Seite.',
			linkHref: '/auslage-einreichen',
			linkLabel: 'Auslage ohne Anmeldung einreichen →'
		}
	};

	const reasonAlert = $derived(data.reason ? REASON_ALERTS[data.reason] : null);

	let pending = $state(false);
	let emailValue = $state('');

	// Submit-state machine (spec §6). The server answers every POST with the
	// identical success message (anti-enumeration — see +page.server.ts) plus
	// an echo of the caller's OWN email, so 'sent' is purely client view state.
	// Without JS the page still degrades to the sent panel via form.ok on the
	// full-page response — and form.email seeds sentTo so the panel shows the
	// right address and an ENABLED resend (the use:enhance callback that would
	// otherwise set sentTo never runs without JS).
	// Initialize from the server response (no-JS full-page path); the $effect
	// below also catches JS-enhanced transitions and resends.
	// untrack: intentionally capturing the initial `form` value only — the
	// $effect below handles all reactive updates.
	let view = $state<'form' | 'sent'>(untrack(() => (form?.ok ? 'sent' : 'form')));
	let sentTo = $state(untrack(() => form?.email ?? ''));
	let cooldown = $state(0);
	let sentHeading = $state<HTMLHeadingElement | null>(null);
	let emailInputEl = $state<HTMLInputElement | null>(null);

	// Client-side visible cooldown only: the real guard is the Postgres
	// sliding-window rate limit (3 per 5 min per email) inside issueMagicLink,
	// which deliberately never reveals itself to the caller.
	const COOLDOWN_SECONDS = 60;

	$effect(() => {
		// A confirmed send (initial or resend) swaps the panel + arms the cooldown.
		// Re-seed sentTo from the server echo so the no-JS full-page response (and
		// the no-JS resend) always carries the right address into the panel + the
		// hidden resend field.
		if (form?.ok) {
			view = 'sent';
			if (form.email) sentTo = form.email;
			cooldown = COOLDOWN_SECONDS;
		}
	});

	$effect(() => {
		if (view === 'sent') {
			// Focus contract (spec §5 keyboard/SR): focus moves to the new heading.
			sentHeading?.focus();
		}
	});

	$effect(() => {
		if (cooldown <= 0) return;
		const t = setInterval(() => {
			cooldown -= 1;
		}, 1000);
		return () => clearInterval(t);
	});

	function backToForm() {
		view = 'form';
		// Defer focus until the form has re-rendered.
		setTimeout(() => emailInputEl?.focus(), 0);
	}
</script>

<svelte:head>
	<title>Vereins-Login – {page.data.vereinName}</title>
</svelte:head>

<main class="flex flex-1 flex-col lg:grid lg:grid-cols-[40fr_60fr]">
	<!-- Left gradient panel (desktop ≥1024px). Decorative: the Verein name is
	     also in the public header, so the whole panel is aria-hidden. -->
	<aside
		class="relative hidden overflow-hidden [background-image:var(--gradient-brand)] lg:flex lg:flex-col lg:items-center lg:justify-center"
		data-testid="login-hero-panel"
		aria-hidden="true"
	>
		<div class="orb orb-1"></div>
		<div class="orb orb-2"></div>
		<div class="orb orb-3"></div>
		<img src="/logo-lineart-white.svg" alt="" class="relative h-28 w-28" />
		<p class="relative mt-6 px-8 text-center text-2xl font-bold tracking-tight text-white">
			{page.data.vereinName}
		</p>
	</aside>

	<!-- Compact gradient band (mobile <1024px) — renders BELOW the public
	     header (layout) so the "Auslage einreichen" context action stays
	     visible above it without scrolling (spec §6). -->
	<div
		class="relative flex items-center gap-3 overflow-hidden [background-image:var(--gradient-brand)] px-4 py-5 lg:hidden"
		data-testid="login-mobile-band"
	>
		<img src="/logo-lineart-white.svg" alt="" class="h-9 w-9" />
		<p class="text-base font-bold tracking-tight text-white">{page.data.vereinName}</p>
	</div>

	<!-- Right panel: heading, status banner, form. NO autofocus anywhere —
	     on mobile the keyboard would hide the Auslage bridge (spec §6). -->
	<section class="flex flex-1 flex-col px-4 py-8 lg:justify-center lg:px-12 lg:py-12">
		<div class="mx-auto w-full max-w-sm space-y-6">
			<div class="space-y-1">
				<h1 class="text-2xl font-bold tracking-tight text-ink-900">Vereins-Login</h1>
				<p class="text-sm text-ink-500">Anmelde-Link per E-Mail — kein Passwort nötig.</p>
			</div>

			{#if reasonAlert}
				<InlineAlert
					severity={reasonAlert.severity}
					text={reasonAlert.text}
					linkHref={reasonAlert.linkHref}
					linkLabel={reasonAlert.linkLabel}
					testid="sign-in-reason-banner"
					reason={data.reason ?? undefined}
				/>
			{/if}

			{#if view === 'sent'}
				<div
					class="space-y-4 rounded-2xl border border-[var(--hairline)] bg-card p-6 shadow-[var(--shadow-card)]"
					role="status"
					data-testid="link-sent-panel"
				>
					<h2
						bind:this={sentHeading}
						tabindex="-1"
						class="text-xl font-bold tracking-tight text-ink-900 outline-none"
					>
						Link gesendet
					</h2>
					<p class="text-sm leading-relaxed text-ink-700">
						Schau in dein Postfach — dein Anmelde-Link ist unterwegs an
						<span class="font-semibold text-ink-900" data-testid="link-sent-email"
							>{sentTo || 'deine E-Mail-Adresse'}</span
						>.
					</p>
					<form
						method="POST"
						use:enhance={() => {
							pending = true;
							return async ({ update }) => {
								pending = false;
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="email" value={sentTo} />
						<button
							type="submit"
							disabled={pending || cooldown > 0 || !sentTo}
							data-testid="resend-button"
							class="h-11 w-full rounded-[10px] border border-[var(--hairline)] bg-card text-sm font-semibold text-primary-text transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none lg:h-10"
						>
							{cooldown > 0 ? `Erneut senden (${cooldown} s)` : 'Erneut senden'}
						</button>
					</form>
					<button
						type="button"
						onclick={backToForm}
						data-testid="wrong-address-button"
						class="text-sm font-medium text-primary-text underline underline-offset-2 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						Falsche Adresse?
					</button>
				</div>
			{:else}
				<form
					method="POST"
					use:enhance={({ formData }) => {
						pending = true;
						const submitted = String(formData.get('email') ?? '').trim();
						return async ({ update, result }) => {
							pending = false;
							if (result.type === 'success' && result.data?.['ok']) {
								sentTo = submitted;
							}
							await update({ reset: false });
						};
					}}
					class="space-y-4"
				>
					<div class="space-y-1.5">
						<Label for="email">E-Mail-Adresse</Label>
						<Input
							id="email"
							name="email"
							type="email"
							bind:value={emailValue}
							bind:ref={emailInputEl}
							autocomplete="email"
							inputmode="email"
							autocapitalize="none"
							spellcheck={false}
							enterkeyhint="send"
							placeholder="du@beispiel.de"
							required
							class="h-11 rounded-[10px] lg:h-10"
						/>
						{#if form?.error}
							<p class="text-xs text-severity-critical-text">{form.error}</p>
						{/if}
					</div>

					<button
						type="submit"
						disabled={pending}
						data-testid="login-submit"
						class="flex h-11 w-full items-center justify-center rounded-[10px] [background-image:var(--gradient-brand)] text-sm font-semibold text-white shadow-[var(--glow-brand)] transition-opacity disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none lg:h-10"
					>
						{pending ? 'Wird gesendet…' : 'Anmelde-Link anfordern'}
					</button>
				</form>
			{/if}

			{#if data.publicFormEnabled}
				<AuslageBridgeCard />
			{/if}
		</div>
	</section>
</main>

<style>
	/* Ambient tier (spec §2): transform-only, slow (≥20s), static under
	   prefers-reduced-motion. White-alpha radial decoration on the brand
	   gradient — no hex, no backdrop-filter. */
	.orb {
		position: absolute;
		border-radius: 9999px;
		will-change: transform;
	}
	.orb-1 {
		top: -70px;
		left: -90px;
		width: 280px;
		height: 280px;
		background: radial-gradient(circle, rgb(255 255 255 / 0.22), transparent 70%);
		animation: orb-drift-1 26s ease-in-out infinite;
	}
	.orb-2 {
		right: -100px;
		bottom: -120px;
		width: 360px;
		height: 360px;
		background: radial-gradient(circle, rgb(255 255 255 / 0.16), transparent 70%);
		animation: orb-drift-2 34s ease-in-out infinite;
	}
	.orb-3 {
		top: 38%;
		right: 12%;
		width: 180px;
		height: 180px;
		background: radial-gradient(circle, rgb(255 255 255 / 0.12), transparent 70%);
		animation: orb-drift-3 42s ease-in-out infinite;
	}
	@keyframes orb-drift-1 {
		0%,
		100% {
			transform: translate3d(0, 0, 0);
		}
		50% {
			transform: translate3d(44px, 60px, 0);
		}
	}
	@keyframes orb-drift-2 {
		0%,
		100% {
			transform: translate3d(0, 0, 0);
		}
		50% {
			transform: translate3d(-52px, -40px, 0);
		}
	}
	@keyframes orb-drift-3 {
		0%,
		100% {
			transform: translate3d(0, 0, 0);
		}
		50% {
			transform: translate3d(-28px, 36px, 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.orb {
			animation: none;
		}
	}
</style>
