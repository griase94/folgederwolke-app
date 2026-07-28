<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import BeitragCell from './BeitragCell.svelte';
	import MarkPaidControl from './MarkPaidControl.svelte';
	import type { MemberView } from '$lib/domain/members.js';
	import { currentBuchungsjahr, clampYearToAvailable } from '$lib/domain/year.js';
	import { projectForList } from '$lib/domain/beitrag-state.js';
	import type { CellState, MatrixCell } from '$lib/domain/beitrag-cell.js';

	let {
		member,
		years,
		cells,
		onEdit,
		selectable = false,
		selected = false,
		bulkYear = null,
		onToggleSelect,
		onRemind
	}: {
		member: MemberView;
		years: number[];
		/**
		 * Pre-resolved matrix cells keyed `${memberId}:${year}` — the single source
		 * of beitrag state (replaces the client-side resolveBeitragState re-derivation,
		 * which passed festBis=null and so never reflected Festschreibung).
		 */
		cells: ReadonlyMap<string, MatrixCell>;
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
		onToggleSelect?: (id: string, checked: boolean) => void;
		/**
		 * C2/S3b: the kebab "Erinnerung senden" asks the screen to open the
		 * consolidated Bulk-Reminder sheet pre-filtered to this member (single =
		 * n=1) instead of POSTing — one reminder surface.
		 */
		onRemind?: (memberId: string) => void;
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
	let markPaidNotes = $state<string | null>(null);

	const currentYear = $derived(
		years.length > 0 ? clampYearToAvailable(currentBuchungsjahr(), years) : null,
	);

	// Single source of beitrag state — the pre-resolved matrix cell for the current
	// Buchungsjahr (no client-side re-derivation; carries the real festBis lock).
	const currentCell = $derived<MatrixCell | null>(
		currentYear !== null ? (cells.get(`${member.id}:${currentYear}`) ?? null) : null,
	);

	// Projected state for the list: overdue→open (list shows a single "Offen").
	const currentYearDisplayState = $derived<CellState | null>(
		currentCell !== null ? projectForList(currentCell.state) : null,
	);

	// One-tap pay: show for open or partial states on non-exempt, active members.
	const showPayTrigger = $derived(
		currentYear !== null &&
			currentYearDisplayState !== null &&
			(currentYearDisplayState === 'open' || currentYearDisplayState === 'partial') &&
			// Festgeschriebenes Jahr → read-only; don't invite a write the server 409s
			// (the Matrix already gates on isLocked). M3.
			!currentCell?.isLocked &&
			!member.beitragExempt &&
			!member.austrittsDatum,
	);

	function openMarkPaid(year: number) {
		const cell = cells.get(`${member.id}:${year}`);
		markPaidYear = year;
		markPaidBetragCents = cell?.betragCents ?? 0;
		markPaidPaidCents = cell?.paidCents ?? 0;
		markPaidNotes = cell?.notes ?? null;
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

	function requestReminder() {
		dropdownOpen = false;
		if (!canRemind) return;
		// Hand off to the screen's consolidated Bulk-Reminder sheet (pre-filtered
		// to this member) — no inline POST (C2/S3b).
		onRemind?.(member.id);
	}

	// C3-DISC: the soft-delete form lives OUTSIDE the DropdownMenu.Content so
	// it survives the menu's unmount-on-close.
	let deleteFormEl = $state<HTMLFormElement | null>(null);
	// C2/S3c: two-step "austragen" replaces the jarring native window.confirm.
	// First kebab click arms (label → "Wirklich austragen?"), the second commits —
	// a deliberate second gesture, no nested dialog. Disarms when the menu closes.
	let austragenArmed = $state(false);
	function handleAustragen() {
		if (!austragenArmed) {
			austragenArmed = true;
			return;
		}
		austragenArmed = false;
		dropdownOpen = false;
		queueMicrotask(() => deleteFormEl?.requestSubmit());
	}
	$effect(() => {
		if (!dropdownOpen) austragenArmed = false;
	});

	// Bulk-select gate: enabled only when the bulk-year cell projects to "open".
	function isSelectDisabledForBulk(): boolean {
		if (bulkYear === null) return true;
		if (member.beitragExempt || !!member.austrittsDatum) return true;
		const cell = cells.get(`${member.id}:${bulkYear}`);
		// Festgeschriebene Jahre are read-only. Owing cells are selectable: the
		// brief wants "offene/teilbezahlte wählbar", so allow open/overdue (folded
		// to 'open' by the list projection) AND partial — not open-only.
		if (!cell || cell.isLocked) return true;
		const proj = projectForList(cell.state);
		return proj !== 'open' && proj !== 'partial';
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
		<Checkbox
			checked={selected}
			disabled={selectDisabled}
			label="{member.vorname} {member.nachname} auswählen"
			labelClass="shrink-0"
			data-testid="member-row-select"
			onchange={(e) => onToggleSelect?.(member.id, e.currentTarget.checked)}
		/>
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

	<!-- Single current-year Beitrag pill (one pill, not N year chips).
	     Hidden in bulk-select mode where the checkbox drives the whole row. -->
	{#if !selectable && currentYear !== null && currentCell !== null && currentYearDisplayState !== null}
		<div class="hidden w-28 shrink-0 items-center justify-end sm:flex">
			<BeitragCell
				variant="pill"
				state={currentYearDisplayState}
				memberName="{member.vorname} {member.nachname}"
				year={currentYear}
				paidCents={currentCell.paidCents}
				betragCents={currentCell.betragCents}
				isLocked={currentCell.isLocked}
				compact
				exemptReason={member.beitragExemptReason}
			/>
		</div>
	{/if}

	<!-- One-tap pay trigger: appears for open/partial state only.
	     Opens the MarkPaidControl directly (no kebab intermediary).
	     min-h-11 (44px) for mobile touch target. -->
	<!-- Reserve the pay-trigger track even when the button is absent (paid rows)
	     so the Beitrag pill column stays put row-to-row (M2 — no column flight). -->
	{#if !selectable}
		<div class="hidden w-11 shrink-0 items-center justify-center sm:flex">
			{#if showPayTrigger && currentYear !== null}
				<button
					type="button"
					data-testid="member-row-pay"
					aria-label="Beitrag {currentYear} erfassen für {member.vorname} {member.nachname}"
					onclick={() => openMarkPaid(currentYear!)}
					class="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-primary/30 bg-primary/8 text-primary-text transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
		</div>
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

				<!-- Send reminder — only when a real open balance exists. Opens the
				     consolidated Bulk-Reminder sheet pre-filtered to this member. -->
				<DropdownMenu.Item
					data-testid="member-row-erinnerung"
					disabled={!canRemind}
					onSelect={(e) => {
						e.preventDefault();
						requestReminder();
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

				<!-- Austragen (two-step; no window.confirm, no hard delete) -->
				<DropdownMenu.Item
					data-testid="member-row-loeschen"
					data-armed={austragenArmed ? 'true' : undefined}
					class="text-destructive focus:text-destructive {austragenArmed
						? 'font-semibold'
						: ''}"
					onSelect={(e) => {
						e.preventDefault();
						handleAustragen();
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
					{austragenArmed ? 'Wirklich austragen?' : 'Austragen'}
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
					const toastId = toast.success(
						`${member.vorname} ${member.nachname} ausgetragen`,
						{
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
						(result.data?.['error'] as string | undefined) ?? 'Austragen fehlgeschlagen',
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
				notes={markPaidNotes}
				isOverdue={false}
				allowExempt={false}
			/>
		{/key}
	{/if}
</div>
