<script lang="ts">
	import { enhance } from '$app/forms';
	import BeitragsBadge from './BeitragsBadge.svelte';
	import { beitragStatusFor, type MemberView } from '$lib/domain/members.js';

	let {
		member,
		years,
		onEdit
	}: { member: MemberView; years: number[]; onEdit: (m: MemberView) => void } = $props();

	// Deterministic avatar color from name hash
	function nameHash(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
		}
		return Math.abs(h);
	}

	const avatarColors = [
		'bg-rose-200 text-rose-800',
		'bg-pink-200 text-pink-800',
		'bg-fuchsia-200 text-fuchsia-800',
		'bg-purple-200 text-purple-800',
		'bg-violet-200 text-violet-800',
		'bg-indigo-200 text-indigo-800',
		'bg-sky-200 text-sky-800',
		'bg-teal-200 text-teal-800',
		'bg-emerald-200 text-emerald-800',
		'bg-amber-200 text-amber-800'
	];

	function avatarColor(name: string): string {
		return avatarColors[nameHash(name) % avatarColors.length] ?? avatarColors[0]!;
	}

	function initials(vorname: string, nachname: string): string {
		return (vorname.charAt(0) ?? '') + (nachname.charAt(0) ?? '');
	}

	let dropdownOpen = $state(false);
	let markingYear = $state<number | null>(null);
</script>

<div
	class="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
>
	<!-- Avatar -->
	<div
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold {avatarColor(member.vorname + member.nachname)}"
		aria-hidden="true"
	>
		{initials(member.vorname, member.nachname).toUpperCase()}
	</div>

	<!-- Name + email -->
	<div class="min-w-0 flex-1">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/mitglieder/{member.id}" class="block truncate font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{member.nachname}, {member.vorname}</a>
		{#if member.email}
			<span class="truncate text-xs text-muted-foreground">{member.email}</span>
		{/if}
		{#if member.austrittsDatum}
			<span class="ml-1 text-xs text-destructive">(ausgetreten)</span>
		{/if}
	</div>

	<!-- Beitrag year chips -->
	<div class="hidden items-center gap-1.5 sm:flex">
		{#each years as year (year)}
			{@const b = member.beitrags[year]}
			{@const status = b ? beitragStatusFor(b) : 'open'}
			<BeitragsBadge {year} {status} />
		{/each}
	</div>

	<!-- Actions kebab -->
	<div class="relative">
		<button
			type="button"
			onclick={() => (dropdownOpen = !dropdownOpen)}
			aria-label="Aktionen für {member.vorname} {member.nachname}"
			class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
				<circle cx="12" cy="5" r="1.5" />
				<circle cx="12" cy="12" r="1.5" />
				<circle cx="12" cy="19" r="1.5" />
			</svg>
		</button>

		{#if dropdownOpen}
			<!-- Backdrop -->
			<button
				class="fixed inset-0 z-10 cursor-default"
				aria-label="Menü schließen"
				onclick={() => (dropdownOpen = false)}
				tabindex="-1"
			></button>

			<div
				class="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
				role="menu"
			>
				<button
					type="button"
					role="menuitem"
					class="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
					onclick={() => {
						dropdownOpen = false;
						onEdit(member);
					}}
				>
					<svg
						class="h-4 w-4 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
						/>
					</svg>
					Bearbeiten
				</button>

				{#each years as year (year)}
					{@const b = member.beitrags[year]}
					{@const status = b ? beitragStatusFor(b) : 'open'}
					{#if status !== 'paid'}
						<form
							method="POST"
							action="?/mark-beitrag-paid"
							use:enhance={() => {
								markingYear = year;
								return async ({ update }) => {
									await update();
									markingYear = null;
									dropdownOpen = false;
								};
							}}
						>
							<input type="hidden" name="member_id" value={member.id} />
							<input type="hidden" name="year" value={year} />
							<button
								type="submit"
								role="menuitem"
								disabled={markingYear === year}
								class="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50"
							>
								<svg
									class="h-4 w-4 text-green-600"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								Beitrag {year} bezahlt
							</button>
						</form>
					{/if}
				{/each}

				<div class="my-1 border-t border-border"></div>
				<button
					type="button"
					role="menuitem"
					class="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
					onclick={() => (dropdownOpen = false)}
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
					Erinnerung senden
				</button>
			</div>
		{/if}
	</div>
</div>
