<script lang="ts">
	/**
	 * Auslagen-kit gallery body (dev-only) — every A-flow S1 composition primitive
	 * with demo data in its key states. DEV-gated dynamic import (see +page.svelte)
	 * so nothing here ships in the production client bundle.
	 */
	import type { Snippet } from 'svelte';
	import StatusMedallion from '$lib/components/ui/StatusMedallion.svelte';
	import AuslageStatusChip from '$lib/components/ui/AuslageStatusChip.svelte';
	import Callout from '$lib/components/public/Callout.svelte';
	import TrustJourney from '$lib/components/public/TrustJourney.svelte';
	import LoginNudge from '$lib/components/public/LoginNudge.svelte';
	import SplitCardShell from '$lib/components/public/SplitCardShell.svelte';
	import StatusSplitShell from '$lib/components/public/StatusSplitShell.svelte';
	import AusIdCard from '$lib/components/public/AusIdCard.svelte';
	import BatchConfirmGroup from '$lib/components/public/BatchConfirmGroup.svelte';
	import BelegLine from '$lib/components/public/BelegLine.svelte';
	import ReasonBox from '$lib/components/public/ReasonBox.svelte';
	import AusIdSearch from '$lib/components/public/AusIdSearch.svelte';
	import AuslageStatusDetail from '$lib/components/public/AuslageStatusDetail.svelte';
	import BatchStatusGroup from '$lib/components/public/BatchStatusGroup.svelte';
	import AuslageBlock from '$lib/components/forms/AuslageBlock.svelte';
	import BatchReviewList from '$lib/components/forms/BatchReviewList.svelte';
	import BelegUpload from '$lib/components/forms/BelegUpload.svelte';
	import LockedIdentity from '$lib/components/portal/LockedIdentity.svelte';
	import PayoutBlock from '$lib/components/portal/PayoutBlock.svelte';
	import IbanInlineEdit from '$lib/components/portal/IbanInlineEdit.svelte';
	import WelcomeCard from '$lib/components/portal/WelcomeCard.svelte';
	import SubmitHandoff from '$lib/components/portal/SubmitHandoff.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { CopyField, CopyAnnouncer } from '$lib/components/ui/copy-field/index.js';
	import ProblemFlag from '$lib/components/ui/ProblemFlag.svelte';
	import MoneyStrip from '$lib/components/ui/MoneyStrip.svelte';
	import ErstattungClaimCard from '$lib/components/admin/erstattung/ErstattungClaimCard.svelte';
	import { SegmentedControl } from '$lib/components/ui/segmented-control/index.js';
	import { buildBulkResult } from '$lib/components/admin/erstattung/bulk-result.js';
	import { OptionGrid } from '$lib/components/ui/option-grid/index.js';
	import RejectDialog, {
		REJECT_TEMPLATES
	} from '$lib/components/admin/inbox/RejectDialog.svelte';

	import Clock from '@lucide/svelte/icons/clock';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import Search from '@lucide/svelte/icons/search';
	import Info from '@lucide/svelte/icons/info';
	import Send from '@lucide/svelte/icons/send';

	// ── demo data ────────────────────────────────────────────────────────────
	const journeyEinreichen = [
		{ title: 'Du reichst ein', subtitle: 'Beleg, Betrag, was es war — in zwei Minuten.' },
		{ title: 'Julia prüft', subtitle: 'Der Vorstand schaut kurz drüber.' },
		{ title: 'Geld kommt zurück', subtitle: 'Erstattung aufs Konto, meist 1–2 Wochen.' }
	];

	const detailPruef = {
		factsRows: [
			{ label: 'Zweck', value: 'Getränke fürs Sommerfest' },
			{ label: 'Betrag', value: '24,90 €', variant: 'amount' as const, tone: 'ausgabe' as const },
			{ label: 'Rechnungsdatum', value: '04.07.2026', variant: 'num' as const },
			{ label: 'IBAN', value: 'DE12 •••• 4321', variant: 'iban' as const }
		],
		beleg: { fileName: 'Beleg_Sommerfest.jpg', meta: 'JPG' },
		nextStep: {
			tone: 'brand' as const,
			title: 'Du musst nichts tun',
			subtitle: 'Julia schaut sich das gerade an. Wir melden uns per Mail, sobald es weitergeht.'
		},
		timeline: [
			{ title: 'Eingereicht', timestamp: '04.07. · 11:04', state: 'done' as const, detail: 'Beleg & Betrag angekommen.' },
			{ title: 'In Prüfung', timestamp: 'jetzt', state: 'now' as const, detail: 'Julia prüft Betrag und Beleg.' },
			{ title: 'Erstattung', timestamp: 'bald', state: 'pending' as const, detail: 'Kommt nach der Freigabe aufs Konto.' }
		]
	};

	const detailReject = {
		factsRows: [
			{ label: 'Zweck', value: 'Parkgebühren Auswärtsspiel' },
			{ label: 'Betrag', value: '8,90 €', variant: 'amount' as const, tone: 'ausgabe' as const },
			{ label: 'Rechnungsdatum', value: '05.06.2026', variant: 'num' as const }
		],
		beleg: { fileName: 'Beleg_Parkschein.jpg', meta: 'JPG · unscharf' },
		reject: {
			reason:
				'Der Beleg war leider nicht lesbar — Datum und Betrag ließen sich auf dem Foto nicht erkennen. Mach bitte ein schärferes Bild und reich die Auslage einfach nochmal ein.',
			by: 'Julia',
			when: '08.06.2026'
		},
		recoveryHref: '/auslage-einreichen',
		timeline: [
			{ title: 'Eingereicht', timestamp: '05.06.', state: 'done' as const },
			{ title: 'Abgelehnt', timestamp: '08.06.', state: 'reject' as const, detail: 'Grund oben — leicht zu korrigieren.' }
		]
	};

	const batchNodes = [
		{
			ausId: 'AUS-2026-0077',
			bezeichnung: 'Kuchen fürs Sommerfest',
			betragCents: 2490,
			chip: { variant: 'ok' as const, label: 'Erstattet' },
			detail: {
				factsRows: [
					{ label: 'Betrag', value: '24,90 €', variant: 'amount' as const, tone: 'ausgabe' as const },
					{ label: 'Überwiesen am', value: '11.07.2026', variant: 'num' as const }
				],
				timeline: [{ title: 'Erstattet', timestamp: '11.07.', state: 'done' as const }]
			}
		},
		{
			ausId: 'AUS-2026-0078',
			bezeichnung: 'Standmiete Flohmarkt',
			betragCents: 1490,
			chip: { variant: 'open' as const, label: 'In Prüfung' },
			detail: detailPruef
		},
		{
			ausId: 'AUS-2026-0079',
			bezeichnung: 'Deko & Lichterketten',
			betragCents: 2390,
			chip: { variant: 'crit' as const, label: 'Abgelehnt' },
			detail: detailReject
		}
	];

	const reviewItems = [
		{ clientKey: 'a1', title: 'Kuchen fürs Sommerfest', dateLabel: '04.07.2026', betragCents: 2490, belegOk: true },
		{ clientKey: 'a2', title: 'Standmiete Flohmarkt', dateLabel: '06.07.2026', betragCents: 1490, belegOk: true },
		{ clientKey: 'a3', title: 'Auslage 3', betragCents: null, incomplete: true }
	];
	// ── A-flow S2b · portal kit demo state ───────────────────────────────────
	const DEMO_MASKED = 'DE12 •••• 4321';
	// Live bindings so the gallery exercises the real interactive states.
	let payoutEntryIban = $state('');
	let payoutEntrySave = $state(true);
	let payoutOverrideIban = $state('DE21 7015 0000 0123 4567 89');
	let payoutOverrideSave = $state(false);
	let payoutOverrideOpen = $state(true);
	let payoutErrorIban = $state('DE44 5001 0517 5407 3249 9');
	let payoutErrorSave = $state(true);
	let belegKein = $state(false);
	let belegGrund = $state('');

	const handoffSingle = [
		{ ausId: 'AUS-2026-0071', bezeichnung: 'Getränke fürs Sommerfest', betragCents: 2490, belegOk: true, belegName: 'bon_sommerfest.jpg' }
	];
	const handoffBatch = [
		{ ausId: 'AUS-2026-0071', bezeichnung: 'Getränke fürs Sommerfest', betragCents: 2490, belegOk: true },
		{ ausId: 'AUS-2026-0072', bezeichnung: 'Standmiete Flohmarkt', betragCents: 1490, belegOk: true },
		{ ausId: 'AUS-2026-0073', bezeichnung: 'Kuchenzutaten', betragCents: 2390, belegOk: false }
	];
	// ── A-flow S3.1 · Erstattung-Kit demo state ──────────────────────────────
	let announcer = $state<{ announce: (l: string) => void } | null>(null);
	let lens = $state('vorbereiten');

	// ── A-flow S3.3 · Ablehnen-Kit demo state ────────────────────────────────
	let galleryTemplate = $state(REJECT_TEMPLATES[0]!.key);
	let rejectDemoOpen = $state(false);

	const claimPayable = {
		id: 'c1',
		ausNr: 'AUS-2026-0071',
		businessId: 'A-2026-0043',
		bezeichnung: 'Getränke fürs Sommerfest',
		betragCents: 2490,
		empfaenger: 'Anna Müller',
		payoutIban: 'DE89370400440532013000',
		verwendungszweck: 'Erstattung AUS-2026-0071 Folge der Wolke e.V.',
		festgeschrieben: false,
		ibanFixHref: null
	};
	const claimNoIban = {
		...claimPayable,
		id: 'c2',
		ausNr: 'AUS-2026-0072',
		empfaenger: 'Tobias Kern',
		bezeichnung: 'Standmiete Flohmarkt',
		betragCents: 1490,
		payoutIban: null,
		ibanFixHref: '/app/mitglieder/demo'
	};
	const claimClosedYear = {
		...claimPayable,
		id: 'c3',
		ausNr: 'AUS-2025-0180',
		bezeichnung: 'Deko-Material (Vorjahr)',
		betragCents: 1890,
		festgeschrieben: true
	};

	const bulkClean = buildBulkResult({
		erstattet: ['a', 'b', 'c'],
		ibanFehlt: [], festgeschrieben: [], bereitsBezahlt: [], notFound: [], fehler: []
	});
	const bulkMixed = buildBulkResult({
		erstattet: ['a'], ibanFehlt: ['b'], festgeschrieben: ['c'],
		bereitsBezahlt: ['d'], notFound: [], fehler: [{ id: 'e', error: 'boom' }]
	});
</script>

{#snippet frame(label: string, body: Snippet)}
	<section class="mb-10">
		<h3 class="mb-3 text-xs font-bold tracking-wide text-ink-500 uppercase">{label}</h3>
		<div class="flex flex-wrap items-start gap-6">{@render body()}</div>
	</section>
{/snippet}

<div class="mx-auto max-w-6xl px-4 py-8">
	<h1 class="mb-8 text-2xl font-bold tracking-tight text-ink-900">Auslagen-Kit · A-flow S1</h1>

	{#snippet medallions()}
		<StatusMedallion tone="pruef" size="lg">{#snippet icon()}<Clock />{/snippet}</StatusMedallion>
		<StatusMedallion tone="frei" size="lg">{#snippet icon()}<ShieldCheck />{/snippet}</StatusMedallion>
		<StatusMedallion tone="done" size="lg">{#snippet icon()}<CircleCheck />{/snippet}</StatusMedallion>
		<StatusMedallion tone="reject" size="lg">{#snippet icon()}<CircleX />{/snippet}</StatusMedallion>
		<StatusMedallion tone="s404" size="lg">{#snippet icon()}<Search />{/snippet}</StatusMedallion>
		<StatusMedallion tone="pruef" size="md">{#snippet icon()}<Clock />{/snippet}</StatusMedallion>
	{/snippet}
	{@render frame('StatusMedallion — pruef · frei · done · reject · s404 · (md)', medallions)}

	{#snippet chips()}
		<AuslageStatusChip variant="ok" label="Erstattet">{#snippet icon()}<CircleCheck />{/snippet}</AuslageStatusChip>
		<AuslageStatusChip variant="open" label="In Prüfung" />
		<AuslageStatusChip variant="crit" label="Abgelehnt">{#snippet icon()}<CircleX />{/snippet}</AuslageStatusChip>
		<AuslageStatusChip variant="ok" label="1 erstattet" />
		<AuslageStatusChip variant="open" label="1 in Prüfung" />
		<AuslageStatusChip variant="crit" label="1 abgelehnt" />
	{/snippet}
	{@render frame('AuslageStatusChip — ok · open · crit (icon + dot)', chips)}

	{#snippet callouts()}
		<div class="flex w-full max-w-md flex-col gap-3">
			<Callout tone="brand" title="Als Nächstes: Julia prüft" subtitle="Sobald sie freigibt, kommt das Geld zurück.">{#snippet icon()}<Clock />{/snippet}</Callout>
			<Callout tone="info" title="Julia überweist als Nächstes" subtitle="Deine Auslage steht auf der Überweisungsliste.">{#snippet icon()}<Send />{/snippet}</Callout>
			<Callout tone="ok" title="Alles erledigt" subtitle="Das Geld ist auf dem Weg zu dir.">{#snippet icon()}<CircleCheck />{/snippet}</Callout>
			<Callout tone="warn" title="Keine Internetverbindung." subtitle="Dein Entwurf ist gespeichert.">{#snippet icon()}<Info />{/snippet}</Callout>
			<Callout tone="crit" title="Senden hat gerade nicht geklappt." subtitle="Dein Entwurf ist gespeichert — es geht nichts verloren.">{#snippet icon()}<Info />{/snippet}</Callout>
		</div>
	{/snippet}
	{@render frame('Callout — brand · info · ok · warn · crit', callouts)}

	{#snippet journeys()}
		<div class="w-72"><TrustJourney steps={journeyEinreichen} doneUntil={0} trust="Verschlüsselt direkt an den Vorstand." /></div>
		<div class="w-72"><TrustJourney steps={journeyEinreichen} doneUntil={1} trust="Wir melden uns per E-Mail bei jedem Schritt." /></div>
		<div class="w-64"><TrustJourney steps={journeyEinreichen} doneUntil={0} compact /></div>
	{/snippet}
	{@render frame('TrustJourney — pending · step-1-done · compact', journeys)}

	{#snippet nudge()}<div class="w-full max-w-md"><LoginNudge /></div>{/snippet}
	{@render frame('LoginNudge', nudge)}

	{#snippet receipts()}
		<div class="w-80"><AusIdCard ausId="AUS-2026-0071" betragCents={2490} belegName="bon_sommerfest.jpg" /></div>
		<div class="w-96"><BatchConfirmGroup items={batchNodes.map((n) => ({ ausId: n.ausId, bezeichnung: n.bezeichnung, betragCents: n.betragCents, belegOk: true }))} gesamtCents={6370} /></div>
	{/snippet}
	{@render frame('AusIdCard · BatchConfirmGroup', receipts)}

	{#snippet belegs()}
		<div class="w-80"><BelegLine fileName="Beleg_Sommerfest.jpg" meta="JPG" /></div>
		<div class="w-80"><BelegLine fileName="Beleg_Sommerfest.jpg" meta="JPG · 1,2 MB" viewHref="#" /></div>
	{/snippet}
	{@render frame('BelegLine — public (thumb-less) · portal (Ansehen)', belegs)}

	{#snippet reason()}<div class="w-full max-w-md"><ReasonBox reason={detailReject.reject.reason} by="Julia" when="08.06.2026" /></div>{/snippet}
	{@render frame('ReasonBox', reason)}

	{#snippet search()}<div class="w-full max-w-lg"><AusIdSearch value="AUS-2026-9999" contactEmail="folgederwolke@gmail.com" /></div>{/snippet}
	{@render frame('AusIdSearch (404)', search)}

	{#snippet details()}
		<div class="w-full max-w-lg rounded-2xl border border-border p-5"><AuslageStatusDetail {...detailPruef} /></div>
		<div class="w-full max-w-lg rounded-2xl border border-border p-5"><AuslageStatusDetail {...detailReject} /></div>
	{/snippet}
	{@render frame('AuslageStatusDetail — in Prüfung · abgelehnt', details)}

	{#snippet batch()}
		<div class="w-full max-w-2xl rounded-2xl border border-border p-5">
			<BatchStatusGroup submittedLabel="04.07.2026" gesamtCents={6370} focusAusId="AUS-2026-0078" nodes={batchNodes} tally={[{ variant: 'ok', label: '1 erstattet' }, { variant: 'open', label: '1 in Prüfung' }, { variant: 'crit', label: '1 abgelehnt' }]} />
		</div>
	{/snippet}
	{@render frame('BatchStatusGroup — mixed fates, node 2 focused', batch)}

	{#snippet blocks()}
		<div class="flex w-full max-w-md flex-col gap-2.5">
			<AuslageBlock index={1} open={false} valid={true} removable summary={{ title: 'Kuchen fürs Sommerfest', amountLabel: '24,90 €', belegOk: true, dateLabel: '04.07.2026' }} onToggle={() => {}} onRemove={() => {}}>
				{#snippet body()}<div class="text-sm text-ink-500">Felder…</div>{/snippet}
			</AuslageBlock>
			<AuslageBlock index={2} open={true} valid={false} removable onToggle={() => {}} onRemove={() => {}}>
				{#snippet body()}<div class="text-sm text-ink-500">Was war's · Betrag · Datum · Beleg…</div>{/snippet}
			</AuslageBlock>
		</div>
		<div class="w-full max-w-md"><BatchReviewList items={reviewItems} gesamtCents={3980} /></div>
	{/snippet}
	{@render frame('AuslageBlock (collapsed valid · open) · BatchReviewList', blocks)}

	{#snippet splitShell()}
		<div class="w-full">
			<SplitCardShell center>
				{#snippet aside()}
					<div>
						<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">Auslage eingereicht</span>
						<h1 class="mt-2 text-[26px] font-extrabold tracking-tight text-ink-900">Danke, dass du in Vorkasse gegangen bist.</h1>
						<p class="mt-3 max-w-xs text-[14px] leading-relaxed text-ink-500">Wir haben deine Auslage — jetzt übernehmen wir.</p>
					</div>
					<div class="mt-auto"><TrustJourney steps={journeyEinreichen} doneUntil={1} trust="Wir melden uns per E-Mail bei jedem Schritt." /></div>
				{/snippet}
				{#snippet main()}
					<div class="flex flex-col items-center text-center">
						<StatusMedallion class="mb-5" tone="done" size="lg">{#snippet icon()}<CircleCheck />{/snippet}</StatusMedallion>
						<h2 class="text-[24px] font-extrabold tracking-tight text-ink-900">Hat geklappt, Anna!</h2>
						<AusIdCard class="mt-6" ausId="AUS-2026-0071" betragCents={2490} belegName="bon_sommerfest.jpg" />
					</div>
				{/snippet}
			</SplitCardShell>
		</div>
	{/snippet}
	{@render frame('SplitCardShell (confirmation, centered)', splitShell)}

	{#snippet shells()}
		<div class="w-full">
			<StatusSplitShell tone="done">
				{#snippet aside()}
					<div class="flex flex-col items-start">
						<StatusMedallion class="mb-4" tone="done" size="lg">{#snippet icon()}<CircleCheck />{/snippet}</StatusMedallion>
						<span class="text-[11px] font-bold tracking-wide text-type-einnahme uppercase">Erstattet</span>
						<h1 class="mt-2 text-[24px] font-extrabold tracking-tight text-ink-900">Erledigt — Geld ist raus.</h1>
					</div>
				{/snippet}
				{#snippet main()}<AuslageStatusDetail factsRows={detailPruef.factsRows} beleg={detailPruef.beleg} timeline={detailPruef.timeline} />{/snippet}
			</StatusSplitShell>
		</div>
	{/snippet}
	{@render frame('StatusSplitShell (done tone)', shells)}
	<h2 class="mt-14 mb-8 border-t border-hairline pt-8 text-2xl font-bold tracking-tight text-ink-900">
		Portal-Kit · A-flow S2b
	</h2>

	{#snippet lockedIdentity()}
		<div class="w-full max-w-md">
			<LockedIdentity vorname="Anna" nachname="Müller" email="anna.mueller@web.de" confirm />
		</div>
	{/snippet}
	{@render frame('LockedIdentity (confirm mode)', lockedIdentity)}

	{#snippet payoutA()}
		<div class="w-full max-w-md">
			<PayoutBlock maskedIban={DEMO_MASKED} />
		</div>
	{/snippet}
	{@render frame('PayoutBlock · Fall A — hinterlegtes Konto bestätigt', payoutA)}

	{#snippet payoutB()}
		<div class="w-full max-w-md">
			<PayoutBlock maskedIban={null} bind:iban={payoutEntryIban} bind:saveToProfile={payoutEntrySave} />
		</div>
	{/snippet}
	{@render frame('PayoutBlock · Fall B — keine Profil-IBAN (Speichern default an)', payoutB)}

	{#snippet payoutC()}
		<div class="w-full max-w-md">
			<PayoutBlock
				maskedIban={DEMO_MASKED}
				bind:iban={payoutOverrideIban}
				bind:saveToProfile={payoutOverrideSave}
				bind:override={payoutOverrideOpen}
			/>
		</div>
	{/snippet}
	{@render frame('PayoutBlock · Fall C — abweichende IBAN für diese Einreichung', payoutC)}

	{#snippet payoutErr()}
		<div class="w-full max-w-md">
			<PayoutBlock maskedIban={null} bind:iban={payoutErrorIban} bind:saveToProfile={payoutErrorSave} />
		</div>
	{/snippet}
	{@render frame('PayoutBlock · IBAN-Format ungültig (live)', payoutErr)}

	{#snippet welcome()}
		<div class="w-full max-w-md"><WelcomeCard vorname="Anna" maskedIban={null} /></div>
		<div class="w-full max-w-md"><WelcomeCard vorname="Anna" maskedIban={DEMO_MASKED} /></div>
	{/snippet}
	{@render frame('WelcomeCard · W1 (IBAN fehlt) + W2 (passt dein Konto noch?)', welcome)}

	{#snippet ibanEdit()}
		<div class="w-full max-w-md rounded-2xl border border-hairline bg-secondary px-4">
			<IbanInlineEdit maskedIban={DEMO_MASKED} action="?/iban" />
		</div>
		<div class="w-full max-w-md rounded-2xl border border-hairline bg-secondary px-4">
			<IbanInlineEdit maskedIban={null} action="?/iban" error="Das ist keine gültige IBAN — prüf Ländercode und Länge." />
		</div>
	{/snippet}
	{@render frame('IbanInlineEdit · view / keine hinterlegt + Fehler', ibanEdit)}

	{#snippet belegCanonical()}
		<div class="w-full max-w-md">
			<BelegUpload idPrefix="gal-a" bind:keinBeleg={belegKein} bind:begruendung={belegGrund} />
		</div>
		<div class="w-full max-w-md">
			<BelegUpload idPrefix="gal-b" variant="segment" />
		</div>
		<div class="w-full max-w-md">
			<BelegUpload idPrefix="gal-c" allowVerzicht={false} hint="Public: Beleg ist Pflicht, kein Verzicht-Arm." />
		</div>
	{/snippet}
	{@render frame('BelegUpload (F3, kanonisch) · checkbox / segment / public', belegCanonical)}

	{#snippet handoff()}
		<div class="w-full max-w-md">
			<SubmitHandoff vorname="Anna" items={handoffSingle} gesamtCents={2490} statusHref="#" />
		</div>
		<div class="w-full max-w-md">
			<SubmitHandoff vorname="Anna" items={handoffBatch} gesamtCents={6370} statusHref="#" />
		</div>
	{/snippet}
	{@render frame('SubmitHandoff · einzeln + Batch', handoff)}
	<h2 class="mt-14 mb-8 border-t border-hairline pt-8 text-2xl font-bold tracking-tight text-ink-900">
		Erstattung-Kit · A-flow S3.1
	</h2>

	<CopyAnnouncer bind:this={announcer} />

	{#snippet copyFields()}
		<div class="flex flex-wrap gap-2">
			<CopyField field="g-empf" label="Empfängername" value="Anna Müller" onCopied={(l) => announcer?.announce(l)} />
			<CopyField field="g-iban" label="DE89 3704 0044 0532 0130 00" value="DE89370400440532013000" onCopied={(l) => announcer?.announce(l)} />
			<CopyField field="g-betrag" label="24,90" value="24,90" onCopied={(l) => announcer?.announce(l)} />
			<CopyField field="g-vwz" label="Verwendungszweck" value="Erstattung AUS-2026-0071" onCopied={(l) => announcer?.announce(l)} />
			<CopyField field="g-none" label="IBAN fehlt" value="" disabled />
		</div>
	{/snippet}
	{@render frame('CopyField · Bank-Reihenfolge + disabled-Zustand', copyFields)}

	{#snippet flags()}
		<ProblemFlag href="/app/mitglieder/demo">IBAN fehlt — bei der Ausgabe ergänzen</ProblemFlag>
		<ProblemFlag tone="warn">Beleg unleserlich</ProblemFlag>
		<ProblemFlag>Kein Ziel hinterlegt</ProblemFlag>
	{/snippet}
	{@render frame('ProblemFlag · crit (verlinkt) / warn / ohne Ziel', flags)}

	{#snippet strip()}
		<div class="w-full max-w-md">
			<MoneyStrip
				eyebrow="Offen · wartet auf Überweisung"
				totalCents={27370}
				chips={[
					{ label: 'Erstattungen', count: 4 },
					{ label: 'IBAN fehlt', count: 1, tone: 'crit' }
				]}
			/>
		</div>
	{/snippet}
	{@render frame('MoneyStrip · Summe + gleich breite Chips', strip)}

	{#snippet lensSwitch()}
		<SegmentedControl
			variant="lens"
			ariaLabel="Ansicht"
			value={lens}
			onChange={(v) => (lens = v)}
			options={[
				{ value: 'vorbereiten', label: 'Vorzubereiten · 4' },
				{ value: 'liste', label: 'Auf der Liste · 4' }
			]}
		/>
	{/snippet}
	{@render frame('SegmentedControl · variant="lens" (recessed, role=tablist)', lensSwitch)}

	{#snippet claims()}
		<div class="w-full max-w-lg"><ErstattungClaimCard claim={claimPayable} onCopied={(l) => announcer?.announce(l)}>
			{#snippet commit()}<Button size="cta">Als erstattet markieren</Button>{/snippet}
		</ErstattungClaimCard></div>
		<div class="w-full max-w-lg"><ErstattungClaimCard claim={claimNoIban} /></div>
		<div class="w-full max-w-lg"><ErstattungClaimCard claim={claimClosedYear} onCopied={(l) => announcer?.announce(l)}>
			{#snippet commit()}<Button size="cta">Als erstattet markieren</Button>{/snippet}
		</ErstattungClaimCard></div>
	{/snippet}
	{@render frame('ErstattungClaimCard · zahlbar / IBAN fehlt / abgeschlossenes Jahr', claims)}

	{#snippet bulkResults()}
		{#each [bulkClean, bulkMixed] as r (r.headline)}
			<div class="w-full max-w-sm rounded-2xl border border-hairline bg-card p-4">
				<p class="text-sm font-semibold text-ink-900">{r.headline}</p>
				<ul class="mt-2 space-y-0.5 text-xs text-ink-500">
					{#each r.tally as t (t)}<li>{t}</li>{/each}
				</ul>
				<p class="mt-2 text-[11px] text-ink-300">Ton: {r.tone}</p>
			</div>
		{/each}
	{/snippet}
	{@render frame('Bulk-Ergebnis · sauber vs. gemischt (Tally)', bulkResults)}
</div>

<div class="mt-14 space-y-8">
	<h2 class="text-lg font-bold tracking-tight text-ink-900">
		Ablehnen-Kit · A-flow S3.3
	</h2>

	{#snippet optionGrid()}
		<div class="w-full max-w-lg">
			<OptionGrid
				legend="Grund-Vorlage"
				testid="g-tpl"
				options={REJECT_TEMPLATES.map((t) => ({
					value: t.key,
					label: t.label,
					full: t.key === 'sonstiges'
				}))}
				value={galleryTemplate}
				onselect={(v) => (galleryTemplate = v)}
			/>
		</div>
	{/snippet}
	{@render frame('OptionGrid · 2-spaltig, „Sonstiges" volle Breite (native Radios)', optionGrid)}

	{#snippet rejectDialog()}
		<Button variant="outline" onclick={() => (rejectDemoOpen = true)}>
			Ablehnen-Dialog öffnen
		</Button>
		<RejectDialog
			bind:open={rejectDemoOpen}
			submissionId="demo"
			ausId="AUS-2026-0040"
			empfaengerDisplay="Lena Huber"
			formAction="?/noop"
		/>
	{/snippet}
	{@render frame('RejectDialog · Vorlagen + Grund + 1:1-Hinweis + gleich breite Buttons', rejectDialog)}
</div>
