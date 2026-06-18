<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import BeitragStatusPill from './BeitragStatusPill.svelte';
	import MarkPaidControl from './MarkPaidControl.svelte';
	import type { MemberView } from '$lib/domain/members.js';
	import { currentBuchungsjahr, clampYearToAvailable, berlinYear } from '$lib/domain/year.js';
	import {
		resolveBeitragState,
		projectForList,
	} from '$lib/domain/beitrag-state.js';
	import type { CellState } from '$lib/domain/beitrag-cell.js';

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

	// Controlled MarkPaidControl: the one-tap pay pill opens the rich popover
	// (date + live EÜR line + undo toast) instead of a hidden form.
	let markPaidOpen = $state(false);
	let markPaidYear = $state<number | null>(null);
	let markPaidBetragCents = $state(0);
	let markPaidPaidCents = $state(0);

	// Package D: canonical current-year resolver via resolveBeitragState.
	// Single source of truth — replaces simpleBeitragStatus inline checks.
	const currentYear = $derived(
		years.length > 0 ? clampYearToAvailable(currentBuchungsjahr(), years) : null,
	);

	const eintrittsJahr = $derived(
		member.eintrittsDatum ? Number(member.eintrittsDatum.slice(0, 4)) : berlinYear(),
	);
	const austrittsJahr = $derived(
		member.austrittsDatum ? Number(member.austrittsDatum.slice(0, 4)) : null,
	);

	const currentYearState = $derived.by(() => {
		if (currentYear === null) return null;
		const row = member.beitrags[currentYear] ?? null;
		const result = resolveBeitragState({
			year: currentYear,
			eintrittsJahr: eintrittsJahr,
			austrittsJahr: austrittsJahr,
			beitragExempt: member.beitragExempt,
			row: row
				? {
						betragCents: row.betragCents,
						paidCents: row.paidCents,
						isExempt: false,
						gezahltAm: row.gezahltAm,
					}
				: null,
			satzCents: satzByYear[currentYear] ?? null,
			festBis: null,
		});
		return result;
	});

	// Projected state for the list: overdue→open (list shows single "Offen")
	const currentYearDisplayState = $derived<CellState | null>(
		currentYearState !== null ? projectForList(currentYearState.state) : null,
	);

	// One-tap pay: show for open or partial states on non-exempt, active members
	const showPayTrigger = $derived(
		currentYear !== null &&
			currentYearDisplayState !== null &&
			(currentYearDisplayState === 'open' || currentYearDisplayState === 'partial') &&
			!member.beitragExempt &&
			!member.austrittsDatum,
	);

	function openMarkPaid(year: number) {
		const b = member.beitrags[year];
		markPaidYear = year;
		markPaidBetragCents = b?.betragCents ?? satzByYear[year] ?? 0;
		markPaidPaidCents = b?.paidCents ?? 0;
		dropdownOpen = false;
		queueMicrotask(() => (markPaidOpen = true));
	}

	// Reminder: current Buchungsjahr clamped to visible window.
	// Only for unpaid, non-exempt members with email. Use the resolver.
	const canRemind = $derived(
		currentYear !== null &&
			!!member.email &&
			!member.beitragExempt &&
			currentYearDisplayState !== null &&
			currentYearDisplayState !== 'paid' &&
			currentYearDisplayState !== 'exempt' &&
			currentYearDisplayState !== 'permanently_exempt' &&
			currentYearDisplayState !== 'not_applicable_pre_join' &&
			currentYearDisplayState !== 'not_applicable_post_austritt',
	);

	async function sendReminder() {
		dropdownOpen = false;
		if (!canRemind || currentYear === null) return;
		const fd = new FormData();
		fd.set('memberId', member.id);
		fd.set('year', String(currentYear));
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
	// it survives the menu's unmount-on-close.
	let deleteFormEl = $state<HTMLFormElement | null>(null);
	function confirmDelete() {
		dropdownOpen = false;
		const ok = window.confirm(
			`Mitglied "${member.vorname} ${member.nachname}" wirklich archivieren?`,
		);
		if (!ok) return;
		queueMicrotask(() => deleteFormEl?.requestSubmit());
	}

	// Bulk-select helper: mirror the gate logic without simpleBeitragStatus
	function isSelectDisabledForBulk(): boolean {
		if (bulkYear === null) return true;
		if (member.beitragExempt || !!member.austrittsDatum) return true;
		const row = member.beitrags[bulkYear] ?? null;
		const result = resolveBeitragState({
			year: bulkYear,
			eintrittsJahr: eintrittsJahr,
			austrittsJahr: austrittsJahr,
			beitragExempt: member.beitragExempt,
			row: row
				? { betragCents: row.betragCents, paidCents: row.paidCents, isExempt: false, gezahltAm: row.gezahltAm }
				: null,
			satzCents: satzByYear[bulkYear] ?? null,
			festBis: null,
		});
		const projected = projectForList(result.state);
		return projected !== 'open';
	}
</script>

<div
	bind:this={rowEl}
	class="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
	data-testid="member-row"
	data-member-id={member.id}
>
	<!-- Bulk-select checkbox (only in select mode) -->
	{#if selectable}
		{@const selectDisabled = isSelectDisabledForBulk()}
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
	</div>

	<!-- Single current-year BeitragStatusPill (Package D: one pill, not N year chips).
	     Hidden in bulk-select mode where the checkbox drives the whole row. -->
	{#if !selectable && currentYear !== null && currentYearState !== null && currentYearDisplayState !== null}
		<div class="hidden sm:flex items-center">
			<BeitragStatusPill
				state={currentYearDisplayState}
				year={currentYear}
				paidCents={currentYearState.paidCents}
				betragCents={currentYearState.betragCents}
				compact
				exemptReason={member.beitragExemptReason}
			/>
		</div>
	{/if}

	<!-- One-tap pay trigger: appears for open/partial state only.
	     Opens the MarkPaidControl directly (no kebab intermediary).
	     min-h-11 (44px) for mobile touch target. -->
	{#if showPayTrigger && currentYear !== null && !selectable}
		<button
			type="button"
			data-testid="member-row-pay"
			aria-label="Beitrag {currentYear} erfassen für {member.vorname} {member.nachname}"
			onclick={() => openMarkPaid(currentYear!)}
			class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/8 text-primary-text transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<svg
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
		</button>
	{/if}

	<!-- Actions kebab — secondary overflow (edit, reminder, delete).
	     Hidden in bulk-select mode. -->
	{#if !selectable}
		<DropdownMenu.Root bind:open={dropdownOpen}>
			<DropdownMenu.Trigger
				aria-label="Aktionen für {member.vorname} {member.nachname}"
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

				<!-- Send reminder — only when a real open balance exists. -->
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

				<DropdownMenu.Separator />

				<!-- Delete -->
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

	<!-- Soft-delete form lives outside DropdownMenu.Content. -->
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

	<!-- Shared mark-paid surface, anchored to the row. Re-keyed by year so
	     the popover's internal state resets per year. -->
	{#if markPaidYear !== null}
		{#key markPaidYear}
			<MarkPaidControl
				bind:open={markPaidOpen}
				anchor={rowEl}
				memberId={member.id}
				year={markPaidYear}
				memberName="{member.vorname} {member.nachname}"
				betragCents={markPaidBetragCents}
				paidCents={markPaidPaidCents}
				isOverdue={false}
				allowExempt={false}
			/>
		{/key}
	{/if}
</div>
