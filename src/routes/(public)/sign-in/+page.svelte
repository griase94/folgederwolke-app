<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageData } from './$types.js';

	// B-2 — `data.reason` is whitelist-validated on the server (load fn);
	// the page only renders banner copy for values it knows about, and
	// never echoes raw querystring into HTML.
	let {
		form,
		data
	}: {
		form: { ok?: boolean; message?: string; error?: string } | null;
		data: PageData;
	} = $props();

	const REASON_BANNERS = {
		'signed-out': { kind: 'info' as const, text: 'Du wurdest abgemeldet.' },
		'signed-out-everywhere': {
			kind: 'info' as const,
			text: 'Du wurdest auf allen Geräten abgemeldet.'
		},
		'public-form-coming-soon': {
			kind: 'info' as const,
			text: 'Das öffentliche Formular ist momentan nicht aktiv.'
		},
		'not-authorised': {
			kind: 'warn' as const,
			text: 'Dein Account hat keinen Zugriff auf diese Seite.'
		}
	} as const;

	const banner = $derived(data.reason ? REASON_BANNERS[data.reason] : null);

	let pending = $state(false);
	let emailValue = $state('');
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

			{#if banner}
				<div
					class="rounded-[10px] border px-4 py-3 text-sm {banner.kind === 'warn'
						? 'border-severity-warn/40 bg-severity-warn/10 text-severity-warn-text'
						: 'border-severity-info/40 bg-severity-info/10 text-ink-700'}"
					role={banner.kind === 'warn' ? 'alert' : 'status'}
					data-testid="sign-in-reason-banner"
					data-reason={data.reason}
				>
					{banner.text}
				</div>
			{/if}

			{#if form?.ok}
				<div
					class="rounded-[10px] border border-[var(--hairline)] bg-card px-4 py-3 text-sm font-medium text-primary-text"
					role="status"
				>
					{form.message}
				</div>
			{:else}
				<form
					method="POST"
					use:enhance={() => {
						pending = true;
						return async ({ update }) => {
							pending = false;
							await update();
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
