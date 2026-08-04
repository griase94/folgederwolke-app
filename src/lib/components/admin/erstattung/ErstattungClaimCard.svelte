<!--
	ErstattungClaimCard — one reimbursement, in bank-form order
	(Aurora A-flow S3.1, kit Claim-Karte).

	The copy fields are ordered Empfängername → IBAN → Betrag → Verwendungszweck
	because that is the order of the fields in the bank's own form. The admin
	tabs straight down the card and pastes as they go; any other order makes
	them hunt back and forth between two windows.

	§7 without an IBAN: the card does NOT hide the field. It renders it disabled
	in its place, so the bank-form rhythm survives, and puts a ProblemFlag
	underneath that LINKS to where the IBAN can be added. The commit button is
	the one thing that goes away — there is nothing to commit.

	F4: a claim from a closed Buchungsjahr usually stays payable (ADR-0006
	carve-out) and says so quietly — a note, not a warning. But the carve-out
	only PRESERVES an existing Abfluss-Datum; a closed row that has none cannot
	be paid without moving its Buchungsjahr, and the server refuses it. That
	claim gets the same treatment as an IBAN-less one: no commit button, and the
	actual way out written next to it. The UI may promise less than the server
	allows — never more.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { CopyField } from '$lib/components/ui/copy-field/index.js';
	import ProblemFlag from '$lib/components/ui/ProblemFlag.svelte';
	import LockChip from '$lib/components/ui/LockChip.svelte';
	import { claimBetragText } from '$lib/domain/ueberweisung.js';

	export interface ErstattungClaim {
		id: string;
		/** AUS-Nr of the submission, or the expense number when booked directly. */
		ausNr: string | null;
		businessId: string;
		bezeichnung: string;
		betragCents: number;
		/** Bank field "Empfängername". */
		empfaenger: string;
		/** Resolved payout target (M4). null ⇒ not payable yet. */
		payoutIban: string | null;
		/** Same string the reimbursement mail quotes (Abnahme #14). */
		verwendungszweck: string;
		festgeschrieben: boolean;
		/** False ⇒ the server would refuse this claim today; see blockReason. */
		committable?: boolean;
		blockReason?: 'iban-fehlt' | 'festgeschrieben-ohne-abfluss' | null;
		/** Where a missing IBAN can be added. */
		ibanFixHref?: string | null;
		/** Where the Abfluss-Datum can be set. */
		ausgabeHref?: string | null;
	}

	export interface ErstattungClaimCardProps {
		claim: ErstattungClaim;
		/** Reports a successful copy to the page's single live region. */
		onCopied?: (label: string) => void;
		onCopyError?: (label: string) => void;
		/** Rendered in the commit row — the page owns the form/action. */
		commit?: import('svelte').Snippet;
		class?: string;
	}

	/** IBANs are read in groups of four; a 22-char run is unreadable. */
	function groupIban(iban: string): string {
		return iban.replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? iban;
	}
</script>

<script lang="ts">
	let { claim, onCopied, onCopyError, commit, class: className }: ErstattungClaimCardProps =
		$props();

	const payable = $derived(claim.payoutIban !== null);
	/**
	 * Defaults to `payable` so a caller that predates the gate (the gallery,
	 * older fixtures) still renders a payable claim as payable. The server stays
	 * the authority either way — this only decides what we OFFER.
	 */
	const committable = $derived(claim.committable ?? payable);
	const yearBlocked = $derived(claim.blockReason === 'festgeschrieben-ohne-abfluss');
	const ibanDisplay = $derived(
		claim.payoutIban ? groupIban(claim.payoutIban) : 'IBAN fehlt'
	);
	// The bank wants a plain number, no currency symbol.
	const betragForBank = $derived(claimBetragText(claim));
</script>

<article
	class={cn('rounded-2xl border border-hairline bg-card p-4 sm:p-5', className)}
	data-testid="erstattung-claim"
	data-claim-id={claim.id}
	data-payable={payable ? 'true' : 'false'}
>
	<header class="flex flex-wrap items-start gap-x-3 gap-y-1">
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-ink-900">{claim.empfaenger}</p>
			<p class="truncate text-xs text-ink-500">
				<span class="tabular-nums">{claim.ausNr ?? claim.businessId}</span>
				· {claim.bezeichnung}
			</p>
		</div>
		<p class="shrink-0 text-[17px] font-bold tabular-nums text-type-ausgabe">
			{formatMoney(claim.betragCents)}
		</p>
	</header>

	{#if claim.festgeschrieben}
		<!-- A note, not a warning, as long as the carve-out actually applies. -->
		<p class="mt-2 flex items-center gap-2 text-xs text-ink-500" data-testid="claim-festgeschrieben">
			<LockChip />
			{yearBlocked
				? 'aus einem abgeschlossenen Jahr — ohne Abfluss-Datum nicht erstattbar'
				: 'aus einem abgeschlossenen Jahr — Erstattung bleibt möglich'}
		</p>
	{/if}

	<p class="mt-3 text-[11px] font-medium text-ink-500">
		In Bank-Formular-Reihenfolge — zum Kopieren
	</p>
	<div class="mt-1.5 flex flex-wrap gap-2">
		<CopyField
			field="empfaenger"
			label="Empfängername"
			value={claim.empfaenger}
			{onCopied}
			onError={onCopyError}
		/>
		<CopyField
			field="iban"
			label={ibanDisplay}
			value={claim.payoutIban ?? ''}
			disabled={!payable}
			{onCopied}
			onError={onCopyError}
		/>
		<CopyField
			field="betrag"
			label={betragForBank}
			value={betragForBank}
			{onCopied}
			onError={onCopyError}
		/>
		<CopyField
			field="verwendungszweck"
			label="Verwendungszweck"
			value={claim.verwendungszweck}
			{onCopied}
			onError={onCopyError}
		/>
	</div>

	<div class="mt-4 flex flex-wrap items-center gap-3">
		{#if committable}
			{@render commit?.()}
		{:else if yearBlocked}
			<ProblemFlag href={claim.ausgabeHref ?? null} data-testid="claim-jahr-gesperrt">
				Abfluss-Datum fehlt — bei der Ausgabe nachtragen
			</ProblemFlag>
			<p class="text-xs text-ink-500">
				Das Buchungsjahr ist abgeschlossen. Erstattet werden kann erst, wenn ein
				Abfluss-Datum in diesem Jahr eingetragen ist.
			</p>
		{:else}
			<ProblemFlag href={claim.ibanFixHref ?? null} data-testid="claim-iban-fehlt">
				IBAN fehlt — bei der Ausgabe ergänzen
			</ProblemFlag>
			<p class="text-xs text-ink-500">
				Erstattung erst möglich, sobald die IBAN ergänzt ist.
			</p>
		{/if}
	</div>
</article>
