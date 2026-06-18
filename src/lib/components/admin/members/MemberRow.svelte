<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import BeitragsBadge from './BeitragsBadge.svelte';
	import MarkPaidControl from './MarkPaidControl.svelte';
	import type { MemberView } from '$lib/domain/members.js';
	import { currentBuchungsjahr, clampYearToAvailable } from '$lib/domain/year.js';

	let {
		member,
		years,
		onEdit,
		selectable = false,
		selected = false,
		bulkYear = null,
		satzByYear = {},
		onToggleSelect
	}: {
		member: MemberView;
		years: number[];
		onEdit: (m: MemberView) => void;
		/** Bulk-select mode — renders a leading checkbox + hides the kebab. */
		selectable?: boolean;
		selected?: boolean;
		/**
		 * The year the bulk "Als bezahlt" targets. The checkbox is enabled only
		 * for members the bulk action can sensibly touch in THIS year — must match
		 * +page.svelte's `selectableMembers` gate (open, non-exempt, active) so a
		 * row that's already paid (or exempt/ausgetreten) for the year can't be
		 * ticked and re-paid.
		 */
		bulkYear?: number | null;
		/** Per-year configured Beitragssatz (cents) — seeds the mark-paid popover. */
		satzByYear?: Record<number, number>;
		onToggleSelect?: (id: string, checked: boolean) => void;
	} = $props();

	// Package A: beitragStatusFor removed; inline cents check until Package D
	// migrates this component to resolveBeitragState.
	function simpleBeitragStatus(b: { betragCents: number; paidCents: number }): 'paid' | 'open' | 'waived' {
		const betrag = BigInt(b.betragCents);
		const paid = BigInt(b.paidCents);
		if (betrag === 0n) return 'waived';
		if (paid >= betrag) return 'paid';
		return 'open';
	}

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

	let dropdownOpen = $state(false);

	// The whole row is the anchor for the mark-paid popover (the kebab item that
	// opens it unmounts when the menu closes, so we can't anchor to the item).
	let rowEl = $state<HTMLElement | null>(null);

	// Controlled MarkPaidControl: the kebab "Beitrag {year} bezahlt" items open
	// the SAME rich popover the matrix uses (date + live EÜR line + undo toast)
	// instead of the old fire-and-forget hidden form with no date field
	// (markpaid-no-date-undo-toast-list-detail finding).
	let markPaidOpen = $state(false);
	let markPaidYear = $state<number | null>(null);
	let markPaidBetragCents = $state(0);
	let markPaidOverdue = $state(false);

	function openMarkPaid(year: number) {
		const b = member.beitrags[year];
		markPaidYear = year;
		// Seed with the recorded amount if a row exists, else the configured
		// Beitragssatz for the year — so the confirm heading matches the amount the
		// server books (never a misleading "0,00 €" for a row that doesn't exist yet).
		markPaidBetragCents = b?.betragCents ?? satzByYear[year] ?? 0;
		// Overdue isn't tracked per-year on MemberView; the matrix derives it from
		// dates. The popover only uses it to surface the "Erinnerung" shortcut, so
		// treating list rows as non-overdue here is safe.
		markPaidOverdue = false;
		dropdownOpen = false;
		// Open after the menu has closed so focus management doesn't fight.
		queueMicrotask(() => (markPaidOpen = true));
	}

	// Reminder target = current Buchungsjahr (ADR-0001), clamped to the visible
	// window. Only meaningful for an unpaid, non-exempt member with an email.
	const reminderYear = $derived(
		years.length > 0 ? clampYearToAvailable(currentBuchungsjahr(), years) : null,
	);
	const reminderStatus = $derived.by(() => {
		if (reminderYear === null) return 'open';
		const b = member.beitrags[reminderYear];
		return b ? simpleBeitragStatus(b) : 'open';
	});
	const canRemind = $derived(
		reminderYear !== null &&
			!!member.email &&
			!member.beitragExempt &&
			reminderStatus !== 'paid' &&
			reminderStatus !== 'waived',
	);

	async function sendReminder() {
		dropdownOpen = false;
		if (!canRemind || reminderYear === null) return;
		const fd = new FormData();
		fd.set('memberId', member.id);
		fd.set('year', String(reminderYear));
		try {
			const res = await fetch('?/send-reminder', { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				toast.success(`Erinnerung an ${member.vorname} ${member.nachname} gesendet`);
			} else if (result.type === 'failure') {
				toast.error(
					(result.data?.['error'] as string | undefined) ?? 'Erinnerung konnte nicht gesendet werden.',
				);
			} else {
				toast.error('Erinnerung konnte nicht gesendet werden.');
			}
		} catch {
			toast.error('Erinnerung konnte nicht gesendet werden.');
		}
	}

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
	bind:this={rowEl}
	class="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
	data-testid="member-row"
	data-member-id={member.id}
>
	<!-- Bulk-select checkbox (only in select mode). Disabled for members the
	     bulk "Als bezahlt" can't sensibly touch in the bulk year: befreite,
	     ausgetretene, OR already-not-open (paid/waived) for that year — mirrors
	     +page.svelte's selectableMembers gate so an already-paid member can't be
	     ticked and re-paid. -->
	{#if selectable}
		{@const bulkBeitrag = bulkYear !== null ? member.beitrags[bulkYear] : null}
		{@const bulkStatus = bulkBeitrag ? simpleBeitragStatus(bulkBeitrag) : 'open'}
		{@const selectDisabled =
			bulkYear === null ||
			member.beitragExempt ||
			!!member.austrittsDatum ||
			bulkStatus !== 'open'}
		<label
			class="flex shrink-0 items-center {selectDisabled ? 'opacity-40' : ''}"
			aria-label="{member.vorname} {member.nachname} auswählen"
		>
			<input
				type="checkbox"
				checked={selected}
				disabled={selectDisabled}
				data-testid="member-row-select"
				onchange={(e) => onToggleSelect?.(member.id, e.currentTarget.checked)}
				class="h-5 w-5 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
			/>
		</label>
	{/if}

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
		{#if member.beitragExempt}
			<!-- Night-2 C5-MEM-full: amber `befreit` badge surfaces the exempt
			     flag inline; the reason (if any) shows on hover via `title`. -->
			<span
				class="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100"
				title={member.beitragExemptReason ?? ''}
				data-testid="member-row-befreit-badge"
			>befreit</span>
		{/if}
	</div>

	<!-- Beitrag year chips -->
	<div class="hidden items-center gap-1.5 sm:flex">
		{#each years as year (year)}
			{@const b = member.beitrags[year]}
			{@const status = b ? simpleBeitragStatus(b) : 'open'}
			{@const cellState = status === 'waived' ? 'exempt' : status}
			<BeitragsBadge
				{year}
				state={cellState}
				betragCents={b?.betragCents ?? 0}
				paidCents={b?.paidCents ?? 0}
				gezahltAm={b?.gezahltAm ?? null}
				exemptReason={member.beitragExemptReason}
				compact
			/>
		{/each}
	</div>

	<!-- Actions kebab — shadcn DropdownMenu (focus trap + Esc + arrow nav built-in).
	     Hidden in bulk-select mode where the only interaction is the checkbox. -->
	{#if !selectable}
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

			<!-- Mark beitrag paid (one item per unpaid year). Opens the shared
			     MarkPaidControl popover (date + live EÜR line + undo toast) rather
			     than firing a hidden form with no date field. -->
			{#each years as year (year)}
				{@const b = member.beitrags[year]}
				{@const status = b ? simpleBeitragStatus(b) : 'open'}
				{#if status !== 'paid' && status !== 'waived' && !member.beitragExempt}
					<DropdownMenu.Item
						onSelect={(e) => {
							e.preventDefault();
							openMarkPaid(year);
						}}
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
						Beitrag {year} bezahlt…
					</DropdownMenu.Item>
				{/if}
			{/each}

			<DropdownMenu.Separator />

			<!-- Send reminder — wired to the real ?/send-reminder action (mirrors the
			     matrix path). Disabled when there's nothing to remind about. -->
			<DropdownMenu.Item
				data-testid="member-row-erinnerung"
				disabled={!canRemind}
				onSelect={(e) => {
					e.preventDefault();
					sendReminder();
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
	{/if}

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

	<!-- Shared mark-paid surface, anchored to the row. Controlled (no trigger
	     snippet) because the kebab item that opens it unmounts on menu close.
	     Re-keyed by year so the popover's internal date/EÜR state resets per year. -->
	{#if markPaidYear !== null}
		{#key markPaidYear}
			<MarkPaidControl
				bind:open={markPaidOpen}
				anchor={rowEl}
				memberId={member.id}
				year={markPaidYear}
				memberName="{member.vorname} {member.nachname}"
				betragCents={markPaidBetragCents}
				isOverdue={markPaidOverdue}
				allowExempt={false}
			/>
		{/key}
	{/if}
</div>
