<!--
  MemberCardMobile — compact card variant of MemberRow for use below the md
  breakpoint (PM-009). The desktop row hides year beitrag chips already at
  sm; on a 390px screen we want a dedicated card that:

  - drops the kebab actions menu (no thumb-reach hover affordance on touch)
  - shows a single "Beitrag YYYY" summary instead of N year chips
  - whole card is a tap-target → /app/mitglieder/{id}

  Editing / marking a beitrag paid still works on mobile via the detail
  page; the card just gets users there in one tap.
-->
<script lang="ts">
	import { beitragStatusFor, type MemberView } from '$lib/domain/members.js';

	let {
		member,
		years,
	}: {
		member: MemberView;
		years: number[];
	} = $props();

	function nameHash(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
		}
		return Math.abs(h);
	}

	const avatarColors = [
		'bg-rose-100 text-rose-900',
		'bg-pink-100 text-pink-900',
		'bg-fuchsia-100 text-fuchsia-900',
		'bg-purple-100 text-purple-900',
		'bg-violet-100 text-violet-900',
		'bg-indigo-100 text-indigo-900',
		'bg-sky-100 text-sky-900',
		'bg-teal-100 text-teal-900',
		'bg-emerald-100 text-emerald-900',
		'bg-amber-100 text-amber-900',
	];

	function avatarColor(name: string): string {
		return avatarColors[nameHash(name) % avatarColors.length] ?? avatarColors[0]!;
	}

	function initials(vorname: string, nachname: string): string {
		return (vorname.charAt(0) ?? '') + (nachname.charAt(0) ?? '');
	}

	// Current year is the most-recent year in the supplied list.
	const currentYear = $derived(years.length > 0 ? Math.max(...years) : null);
	const currentBeitrag = $derived(currentYear !== null ? member.beitrags[currentYear] : null);
	const currentStatus = $derived(
		currentBeitrag ? beitragStatusFor(currentBeitrag) : 'open',
	);
	const statusLabel: Record<string, string> = {
		paid: 'Bezahlt',
		open: 'Offen',
		waived: 'Erlassen',
	};
	const statusColor: Record<string, string> = {
		paid: 'bg-green-50 text-green-700',
		open: 'bg-amber-50 text-amber-700',
		waived: 'bg-muted text-muted-foreground',
	};
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href="/app/mitglieder/{member.id}"
	data-testid="member-card"
	class="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
	<div
		class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold {avatarColor(member.vorname + member.nachname)}"
		aria-hidden="true"
	>
		{initials(member.vorname, member.nachname).toUpperCase()}
	</div>

	<div class="min-w-0 flex-1">
		<p class="truncate font-medium text-foreground">{member.nachname}, {member.vorname}</p>
		{#if member.email}
			<p class="truncate text-xs text-muted-foreground">{member.email}</p>
		{/if}
		{#if member.austrittsDatum}
			<p class="text-xs text-destructive">(ausgetreten)</p>
		{/if}
	</div>

	{#if currentYear !== null}
		<span
			class={[
				'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
				statusColor[currentStatus],
			].join(' ')}
			aria-label="Beitrag {currentYear}: {statusLabel[currentStatus]}"
		>
			{currentYear} · {statusLabel[currentStatus]}
		</span>
	{/if}
</a>
