<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
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
		'bg-rose-100 text-rose-900',
		'bg-pink-100 text-pink-900',
		'bg-fuchsia-100 text-fuchsia-900',
		'bg-purple-100 text-purple-900',
		'bg-violet-100 text-violet-900',
		'bg-indigo-100 text-indigo-900',
		'bg-sky-100 text-sky-900',
		'bg-teal-100 text-teal-900',
		'bg-emerald-100 text-emerald-900',
		'bg-amber-100 text-amber-900'
	];

	function avatarColor(name: string): string {
		return avatarColors[nameHash(name) % avatarColors.length] ?? avatarColors[0]!;
	}

	function initials(vorname: string, nachname: string): string {
		return (vorname.charAt(0) ?? '') + (nachname.charAt(0) ?? '');
	}

	let markingYear = $state<number | null>(null);
	let dropdownOpen = $state(false);

	// C3-DISC: the soft-delete form lives OUTSIDE the DropdownMenu.Content so
	// it survives the menu's unmount-on-close. The menu item just confirms +
	// flips this flag; an $effect submits the form right after the menu
	// closes (and the form is still mounted).
	let deleteFormEl = $state<HTMLFormElement | null>(null);
	function confirmDelete() {
		dropdownOpen = false;
		const ok = window.confirm(
			`Mitglied "${member.vorname} ${member.nachname}" wirklich archivieren?`,
		);
		if (!ok) return;
		queueMicrotask(() => deleteFormEl?.requestSubmit());
	}
</script>

<div
	class="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
	data-testid="member-row"
	data-member-id={member.id}
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

	<!-- Actions kebab — shadcn DropdownMenu (focus trap + Esc + arrow nav built-in) -->
	<DropdownMenu.Root bind:open={dropdownOpen}>
		<DropdownMenu.Trigger
			aria-label="Aktionen für {member.vorname} {member.nachname}"
			class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="12" cy="5" r="1.5" />
				<circle cx="12" cy="12" r="1.5" />
				<circle cx="12" cy="19" r="1.5" />
			</svg>
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="end" class="w-52">
			<!-- Edit -->
			<DropdownMenu.Item
				onSelect={() => {
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
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
					/>
				</svg>
				Bearbeiten
			</DropdownMenu.Item>

			<!-- Mark beitrag paid (one item per unpaid year) -->
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
						<DropdownMenu.Item
							onSelect={(e) => {
								// Let form submit naturally; prevent menu from closing early
								e.preventDefault();
								(e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
							}}
							disabled={markingYear === year}
						>
							<svg
								class="h-4 w-4 text-green-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							Beitrag {year} bezahlt
						</DropdownMenu.Item>
					</form>
				{/if}
			{/each}

			<DropdownMenu.Separator />

			<!-- Send reminder (placeholder) -->
			<DropdownMenu.Item class="text-muted-foreground" onSelect={() => (dropdownOpen = false)}>
				<svg
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
					/>
				</svg>
				Erinnerung senden
			</DropdownMenu.Item>

			<!-- C3-DISC: Löschen confirms via native dialog and submits the
				 sibling form (kept outside Content so menu close doesn't unmount
				 the form before the submission fires). -->
			<DropdownMenu.Item
				data-testid="member-row-loeschen"
				class="text-destructive focus:text-destructive"
				onSelect={(e) => {
					e.preventDefault();
					confirmDelete();
				}}
			>
				<svg
					class="h-4 w-4 text-destructive"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
					/>
				</svg>
				Löschen
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- Soft-delete form lives outside DropdownMenu.Content so the menu's
		 unmount-on-close doesn't tear the form out of the DOM mid-submit. -->
	<form
		bind:this={deleteFormEl}
		method="POST"
		action="?/delete"
		class="hidden"
		use:enhance={() => {
			const memberId = member.id;
			return async ({ result }) => {
				if (result.type === 'success') {
					const toastId = toast.success('Mitglied archiviert', {
						action: {
							label: 'Rückgängig',
							onClick: async () => {
								const fd = new FormData();
								fd.set('id', memberId);
								await fetch('?/restore', { method: 'POST', body: fd });
								await invalidateAll();
								toast.dismiss(toastId);
								toast.info('Wiederhergestellt');
							},
						},
						duration: 8000,
					});
					await invalidateAll();
				} else if (result.type === 'failure') {
					toast.error(
						(result.data?.['error'] as string | undefined) ?? 'Löschen fehlgeschlagen',
					);
				}
			};
		}}
	>
		<input type="hidden" name="id" value={member.id} />
	</form>
</div>
