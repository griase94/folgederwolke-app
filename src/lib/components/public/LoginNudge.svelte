<!--
	LoginNudge — the "Mitglied? Melde dich an" bridge on the public Auslage form
	(Aurora A-flow S1, plate `.callout.tone-brand.login-nudge`). A brand-tinted
	link to /sign-in: members get name/e-mail/IBAN pre-filled in the portal, so
	the nudge points them there before they type. Outcome-first copy, no insider
	vocabulary. Distinct from `public/AuslageBridgeCard` (the reverse door on the
	sign-in page).
-->
<script lang="ts">
	import { cn } from '$lib/utils.js';
	import User from '@lucide/svelte/icons/user';
	import Lock from '@lucide/svelte/icons/lock';

	let {
		href = '/sign-in',
		class: className,
		'data-testid': testId = 'login-nudge'
	}: { href?: string; class?: string; 'data-testid'?: string } = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	{href}
	class={cn(
		'flex items-center gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))] px-4 py-3.5 no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
		className
	)}
	data-testid={testId}
	data-slot="login-nudge"
>
	<span
		class="grid size-9 flex-none place-items-center rounded-[11px] [background-image:var(--gradient-brand)] text-primary-foreground shadow-[var(--glow-brand)] [&_svg]:size-5"
		aria-hidden="true"
	>
		<User />
	</span>
	<div class="min-w-0 flex-1">
		<div class="text-[13px] font-bold text-ink-900">Mitglied? Melde dich an.</div>
		<div class="mt-0.5 text-[12.5px] leading-snug text-ink-700">
			Dann sind Name, E-Mail und IBAN schon vorausgefüllt.
		</div>
	</div>
	<span
		class="hidden flex-none items-center gap-1.5 rounded-[10px] border border-[color-mix(in_srgb,var(--primary)_28%,transparent)] bg-card px-3 py-1.5 text-xs font-semibold text-primary-text [&_svg]:size-3.5 sm:inline-flex"
		aria-hidden="true"
	>
		<Lock />Zum Login
	</span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
