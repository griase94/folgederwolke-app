<script lang="ts">
	/**
	 * MarkPaidControl — the ONE shared Beitrag mark-paid surface for the list
	 * (MemberRow kebab), the mobile card (MemberCardMobile), and the detail-page
	 * timeline (MemberBeitragsTimeline).
	 *
	 * Before this, those three entry points had divergent flows: a hidden form
	 * with no date picker (MemberRow), a green button on the timeline, and NO
	 * mark-paid affordance at all on mobile. Only the Beitragsmatrix had the rich
	 * MarkPaidPopover ("Bezahlt am" date + live EÜR-Buchungsjahr line + Befreien +
	 * undo toast). This component lifts the matrix's popover content + POST/undo
	 * logic into a reusable trigger so all four paths behave identically.
	 *
	 * Presentation mirrors MemberMatrix: an anchored bits-ui Popover on >= sm,
	 * a full-width bottom Sheet on < sm (the ~280px popover escapes a 390px
	 * viewport). The caller supplies the trigger via the `trigger` snippet and
	 * gets `{ props, open }` so it can render its own button/menu-item and wire
	 * the open state.
	 *
	 * The server actions (?/mark-beitrag-paid, ?/set-beitrag-exempt,
	 * ?/send-reminder) are the single source of truth and stay untouched; this is
	 * a client wrapper that posts to them and reconciles via invalidateAll().
	 */
	import type { Snippet } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Popover } from 'bits-ui';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import MarkPaidPopover from './MarkPaidPopover.svelte';

	let {
		memberId,
		year,
		memberName,
		betragCents,
		isOverdue = false,
		isLocked = false,
		open = $bindable(false),
		anchor = null,
		actionBase = '',
		onClose,
		trigger
	}: {
		memberId: string;
		year: number;
		memberName: string;
		betragCents: number;
		isOverdue?: boolean;
		isLocked?: boolean;
		/**
		 * Route prefix for the form-action POSTs. Defaults to '' (the current
		 * route). The member DETAIL route only implements `mark-beitrag-paid` +
		 * `send-reminder`, so the timeline passes `actionBase="/app/mitglieder"`
		 * to reach the list route's full action set (incl. mark-beitrag-unpaid +
		 * set-beitrag-exempt) for the Befreien / undo paths. invalidateAll() then
		 * refreshes whichever page is showing.
		 */
		actionBase?: string;
		/**
		 * Controlled open state. Used by callers (e.g. MemberRow's kebab) that
		 * open the surface programmatically rather than via the `trigger` snippet.
		 */
		open?: boolean;
		/**
		 * Element to anchor the desktop popover to in controlled mode (mirrors
		 * MemberMatrix's `customAnchor`). Ignored when a `trigger` snippet is given.
		 */
		anchor?: HTMLElement | null;
		/** Fired after the surface closes (e.g. to restore focus to the kebab). */
		onClose?: () => void;
		/**
		 * Optional render-prop for the trigger element. When provided, `props`
		 * MUST be spread onto a focusable element so bits-ui can anchor + toggle;
		 * `open` reflects the current state. Omit it for controlled (anchor) mode.
		 */
		trigger?: Snippet<[{ props: Record<string, unknown>; open: boolean }]>;
	} = $props();

	let submitting = $state(false);

	// Mobile detection — below Tailwind `sm` (640px) we present a bottom Sheet
	// instead of the anchored popover (mirrors MemberMatrix). SSR-guarded.
	let isMobile = $state(false);
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mql = window.matchMedia('(max-width: 639px)');
		isMobile = mql.matches;
		const onChange = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	});

	// Canonical POST → SvelteKit form action. A form-action fetch ALWAYS returns
	// HTTP 200 with a devalue-encoded ActionResult body, so `result.data.error`
	// must be decoded via `deserialize()` — hand-parsing res.json() silently
	// drops the server's message (the treasurer would never see the real
	// Festschreibung / 422-missing-Satz reason). Mirrors MemberMatrix.post.
	async function post(
		action: string,
		fields: Record<string, string>
	): Promise<{ ok: boolean; error?: string }> {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
		try {
			const res = await fetch(`${actionBase}?/${action}`, { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type === 'success') return { ok: true };
			if (result.type === 'failure') {
				return { ok: false, error: (result.data?.['error'] as string | undefined) ?? undefined };
			}
			return { ok: false };
		} catch {
			return { ok: false };
		}
	}

	function hapticSuccess() {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
	}
	function hapticError() {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([10, 40, 10]);
	}

	async function undoMarkPaid() {
		const result = await post('mark-beitrag-unpaid', { memberId, year: String(year) });
		if (!result.ok) {
			hapticError();
			toast.error(result.error ?? 'Rückgängig fehlgeschlagen.');
		}
		await invalidateAll();
	}

	async function undoExempt() {
		const result = await post('set-beitrag-exempt', {
			memberId,
			year: String(year),
			exempt: 'false'
		});
		if (!result.ok) {
			hapticError();
			toast.error(result.error ?? 'Rückgängig fehlgeschlagen.');
		}
		await invalidateAll();
	}

	async function handlePaid(detail: { memberId: string; year: number; gezahltAm: string }) {
		if (submitting) return;
		submitting = true;
		open = false;
		try {
			const result = await post('mark-beitrag-paid', {
				memberId: detail.memberId,
				year: String(detail.year),
				gezahltAm: detail.gezahltAm
			});
			if (!result.ok) {
				hapticError();
				toast.error(result.error ?? 'Fehler — Zahlung nicht gespeichert.');
				return;
			}
			hapticSuccess();
			await invalidateAll();
			toast.success(`${memberName} ${detail.year} als bezahlt markiert`, {
				duration: 10000,
				action: { label: 'Rückgängig', onClick: () => undoMarkPaid() }
			});
		} finally {
			submitting = false;
		}
	}

	async function handleExempt(detail: { memberId: string; year: number; reason: string }) {
		if (submitting) return;
		submitting = true;
		open = false;
		try {
			const result = await post('set-beitrag-exempt', {
				memberId: detail.memberId,
				year: String(detail.year),
				exempt: 'true',
				reason: detail.reason
			});
			if (!result.ok) {
				hapticError();
				toast.error(result.error ?? 'Fehler — Befreiung nicht gespeichert.');
				return;
			}
			hapticSuccess();
			await invalidateAll();
			toast.success(`${memberName} für ${detail.year} befreit (Grund: ${detail.reason})`, {
				duration: 10000,
				action: { label: 'Rückgängig', onClick: () => undoExempt() }
			});
		} finally {
			submitting = false;
		}
	}

	async function handleReminder(detail: { memberId: string; year: number }) {
		open = false;
		const result = await post('send-reminder', {
			memberId: detail.memberId,
			year: String(detail.year)
		});
		if (!result.ok) {
			toast.error(result.error ?? 'Erinnerung konnte nicht gesendet werden.');
			return;
		}
		toast.success(`Erinnerung an ${memberName} gesendet`);
	}

	const sheetTitle = $derived(`${memberName} · ${year} · Beitrag bearbeiten`);
</script>

{#snippet body()}
	<MarkPaidPopover
		{memberId}
		{year}
		{memberName}
		{betragCents}
		{isOverdue}
		{isLocked}
		{submitting}
		onPaid={handlePaid}
		onExempt={handleExempt}
		onReminder={handleReminder}
		onCancel={() => (open = false)}
	/>
{/snippet}

{#if isMobile}
	<!-- Mobile (< sm): bottom Sheet. Trigger (if any) renders inline. -->
	{#if trigger}
		{@render trigger({ props: { onclick: () => (open = true) }, open })}
	{/if}
	<Sheet.Root bind:open onOpenChangeComplete={(o) => { if (!o) onClose?.(); }}>
		<Sheet.Content
			side="bottom"
			class="rounded-t-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
			data-testid="markpaid-sheet"
		>
			<Sheet.Title class="sr-only">{sheetTitle}</Sheet.Title>
			<div class="mx-auto w-full max-w-md py-2">
				{@render body()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else if trigger}
	<!-- Desktop, self-triggering: bits-ui anchors the popover to the trigger. -->
	<Popover.Root bind:open onOpenChangeComplete={(o) => { if (!o) onClose?.(); }}>
		<Popover.Trigger>
			{#snippet child({ props })}
				{@render trigger!({ props, open })}
			{/snippet}
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content
				side="bottom"
				align="end"
				sideOffset={6}
				class="z-50 rounded-lg border border-border bg-popover p-3 shadow-lg outline-none"
				data-testid="markpaid-popover"
			>
				{@render body()}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{:else}
	<!-- Desktop, controlled: anchored to a caller-supplied element (kebab). -->
	<Popover.Root bind:open onOpenChangeComplete={(o) => { if (!o) onClose?.(); }}>
		<Popover.Portal>
			<Popover.Content
				customAnchor={anchor}
				side="bottom"
				align="end"
				sideOffset={6}
				class="z-50 rounded-lg border border-border bg-popover p-3 shadow-lg outline-none"
				data-testid="markpaid-popover"
			>
				{@render body()}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{/if}
