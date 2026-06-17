<!--
  InboxList — Aurora triage rows (spec §2.1). Each submission is a frozen
  TransactionRow (master §2.4, NOT forked): type="ausgabe", title=Bezeichnung,
  metaLine="{AUS-id} · Bezahlt von {Name} · {relativ}", signed amount, href to
  the review route. NO inline decision controls — the only decision path is the
  review route (view-before-decide by topology, spec §3).

  ↑/↓/Home/End move focus across the txn-row anchors; Enter follows the link
  (native <a> behaviour). Window-level keydown short-circuits unless one of OUR
  rows has focus.
-->
<script lang="ts">
	import TransactionRow from '$lib/components/ui/TransactionRow.svelte';
	import type { InboxSubmissionView } from '$lib/domain/inbox.js';

	type StatusLabel = 'Offen' | 'Geprüft' | 'Abgelehnt';

	let {
		submissions,
		activeStatus
	}: { submissions: InboxSubmissionView[]; activeStatus: StatusLabel } = $props();

	let rootEl = $state<HTMLDivElement | null>(null);

	function hasBeleg(s: InboxSubmissionView): boolean {
		return s.belegDriveFileId !== null || s.belegFileId !== null;
	}

	function relativeTime(iso: string): string {
		const deltaSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
		if (deltaSec < 60) return 'gerade eben';
		const min = Math.round(deltaSec / 60);
		if (min < 60) return `vor ${min} Min`;
		const h = Math.round(min / 60);
		if (h < 24) return `vor ${h} h`;
		const d = Math.round(h / 24);
		if (d < 30) return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
		return new Date(iso).toLocaleDateString('de-DE');
	}

	function metaLine(s: InboxSubmissionView): string {
		const payer = s.bezahltVonMemberDisplay ?? s.bezahltVonDisplay;
		return `${s.ausId} · Bezahlt von ${payer} · ${relativeTime(s.submittedAt)}`;
	}

	// Status chips per spec §2.1: warn "Beleg fehlt" only on Offen rows without a
	// Beleg; neutral Genehmigt/Abgelehnt on the decided tabs.
	function chipsFor(s: InboxSubmissionView): { label: string; kind?: 'warn' | 'neutral' }[] {
		if (activeStatus === 'Offen') {
			return hasBeleg(s) ? [] : [{ label: 'Beleg fehlt', kind: 'warn' }];
		}
		if (s.decision === 'approved') return [{ label: 'Genehmigt', kind: 'neutral' }];
		if (s.decision === 'rejected') return [{ label: 'Abgelehnt', kind: 'neutral' }];
		return [];
	}

	function focusRow(index: number): void {
		const rows = rootEl?.querySelectorAll<HTMLAnchorElement>('[data-testid="txn-row"]');
		rows?.[index]?.focus();
	}

	function onKeydown(e: KeyboardEvent): void {
		if (!rootEl) return;
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
		const active = document.activeElement;
		if (!(active instanceof HTMLAnchorElement) || !rootEl.contains(active)) return;
		const rows = [...rootEl.querySelectorAll<HTMLAnchorElement>('[data-testid="txn-row"]')];
		const idx = rows.indexOf(active);
		if (idx < 0) return;
		e.preventDefault();
		const last = rows.length - 1;
		if (e.key === 'ArrowDown') focusRow(Math.min(last, idx + 1));
		else if (e.key === 'ArrowUp') focusRow(Math.max(0, idx - 1));
		else if (e.key === 'Home') focusRow(0);
		else if (e.key === 'End') focusRow(last);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div bind:this={rootEl} role="list" aria-label="Einreichungen" class="divide-y divide-hairline">
	{#each submissions as s (s.id)}
		<div role="listitem">
			<TransactionRow
				type="ausgabe"
				title={s.bezeichnung}
				metaLine={metaLine(s)}
				statusChips={chipsFor(s)}
				amountCents={-s.betragCents}
				href={`/app/inbox/${s.ausId}`}
			/>
		</div>
	{/each}
</div>
