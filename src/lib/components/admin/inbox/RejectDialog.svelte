<!--
  RejectDialog — pick a reason template, edit it, reject (modal-reject.md).

  The reason typed here IS the mail: it travels verbatim into the Grund-Box of
  the RejectionMail, so the dialog says so under the textarea instead of hoping
  the treasurer remembers. Templates are sober and concrete on purpose — the
  warmth of the rejection lives in the mail's framing, not in this modal.

  Deliberate frictions, all from the brief:
    · the scrim does NOT dismiss — a typed reason is too easy to lose,
    · no optimistic close: the dialog waits for the server and shows failures
      inline WITH the text intact, because rejecting sends a mail,
    · switching templates never silently discards a hand-edited reason (the
      edit moves the selection to "Sonstiges" instead).

  Submits `{ submissionId, grund }` to the route's ?/reject action, which
  enforces the same 3-character minimum server-side.
-->
<script lang="ts" module>
	/**
	 * The five canned reasons. The TEXT is the payload — the server knows nothing
	 * about templates, and the member never sees a label.
	 */
	export const REJECT_TEMPLATES: { key: string; label: string; text: string }[] = [
		{
			key: 'beleg_unleserlich',
			label: 'Beleg unleserlich',
			text: 'Der eingereichte Beleg ist nicht ausreichend lesbar. Bitte reiche die Auslage erneut ein und prüfe, dass alle Pflichtangaben (Datum, Betrag, Aussteller) erkennbar sind.'
		},
		{
			key: 'doppelte_einreichung',
			label: 'Doppelte Einreichung',
			text: 'Diese Auslage wurde bereits über eine frühere Einreichung erfasst. Bitte schau in deinem Postfach nach der ersten Bestätigung; eine erneute Erstattung ist nicht möglich.'
		},
		{
			key: 'betrag_falsch',
			label: 'Betrag stimmt nicht',
			text: 'Der angegebene Betrag stimmt nicht mit dem auf dem Beleg ausgewiesenen Betrag überein. Bitte reiche die Auslage mit dem korrekten Betrag erneut ein.'
		},
		{
			key: 'nicht_satzungszweck',
			label: 'Nicht im Satzungszweck',
			text: 'Die Auslage fällt nicht unter den Satzungszweck des Vereins und kann daher nicht erstattet werden.'
		},
		{ key: 'sonstiges', label: 'Sonstiges — frei formulieren', text: '' }
	];

	/** Server-side minimum too (rejectSubmission) — this is only the UX half. */
	export const GRUND_MIN = 3;
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import MailIcon from '@lucide/svelte/icons/mail';
	import XIcon from '@lucide/svelte/icons/x';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { OptionGrid, type OptionGridItem } from '$lib/components/ui/option-grid/index.js';

	let {
		open = $bindable(false),
		submissionId,
		ausId,
		empfaengerDisplay = '',
		hasEmail = true,
		formAction = '?/reject'
	}: {
		open: boolean;
		submissionId: string;
		ausId: string;
		/** "Vorname Nachname" for the sub-line — who receives the rejection. */
		empfaengerDisplay?: string;
		/** No address on file → the rejection is only recorded internally. */
		hasEmail?: boolean;
		/**
		 * Form action target. Defaults to the review-page `?/reject` action.
		 * The DecisionBand passes it explicitly. (The old list-row
		 * `inline-reject` override was deleted in the Aurora inbox redesign —
		 * the list no longer decides.)
		 */
		formAction?: string;
	} = $props();

	const OPTIONS: OptionGridItem[] = REJECT_TEMPLATES.map((t) => ({
		value: t.key,
		label: t.label,
		full: t.key === 'sonstiges'
	}));

	let loading = $state(false);
	let selectedKey = $state(REJECT_TEMPLATES[0]!.key);
	let grund = $state(REJECT_TEMPLATES[0]!.text);
	let error = $state<string | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let firstTemplateEl = $state<HTMLElement | null>(null);

	const tooShort = $derived(grund.trim().length < GRUND_MIN);
	const canSubmit = $derived(!loading && !tooShort);

	function selectTemplate(key: string): void {
		selectedKey = key;
		grund = REJECT_TEMPLATES.find((t) => t.key === key)?.text ?? '';
		if (key === 'sonstiges') textareaEl?.focus();
	}

	/**
	 * A hand-edited reason is no longer "the template" — moving the selection to
	 * Sonstiges keeps the radio honest AND removes the trap where picking another
	 * template would silently overwrite what was just typed.
	 */
	function onGrundInput(): void {
		if (selectedKey === 'sonstiges') return;
		if (grund !== REJECT_TEMPLATES.find((t) => t.key === selectedKey)?.text) {
			selectedKey = 'sonstiges';
		}
	}

	function reset(): void {
		loading = false;
		error = null;
		selectedKey = REJECT_TEMPLATES[0]!.key;
		grund = REJECT_TEMPLATES[0]!.text;
	}

	/** Cmd/Ctrl+Enter submits from inside the textarea when the reason is valid. */
	function onTextareaKeydown(e: KeyboardEvent): void {
		if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
		if (!canSubmit) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
	}

	const subText = $derived(
		loading
			? 'Ablehnung wird verschickt …'
			: hasEmail
				? `Die Ablehnung wird als Mail an ${empfaengerDisplay || 'die einreichende Person'} verschickt.`
				: 'Es ist keine E-Mail hinterlegt — die Ablehnung wird nur intern vermerkt.'
	);
	const hintText = $derived(
		tooShort
			? `Mindestens ${GRUND_MIN} Zeichen — dann wird „Ablehnen“ aktiv.`
			: 'Dieser Text landet 1:1 in der Ablehnungs-Mail.'
	);

	/**
	 * Grow the textarea to its content. Three rows is the right resting size, but
	 * a fixed box clips the fourth line in half on a phone — and a half-line of
	 * your own text reads as "something is broken", not as "scroll me".
	 */
	$effect(() => {
		const el = textareaEl;
		if (!el) return;
		void grund; // re-run on every edit AND on template switches
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
	});

	// Below Tailwind `sm` the modal is a bottom sheet, not a centered card —
	// same body, different chrome (the CellPopover pattern). matchMedia is
	// SSR-guarded and kept in sync via its change event.
	let isMobile = $state(false);
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mql = window.matchMedia('(max-width: 639px)');
		isMobile = mql.matches;
		const onChange = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	});

	function focusStart(): void {
		queueMicrotask(() => {
			if (selectedKey === 'sonstiges') textareaEl?.focus();
			else firstTemplateEl?.querySelector<HTMLElement>('input:checked')?.focus();
		});
	}
</script>

{#snippet body()}
	<form
			method="POST"
			action={formAction}
			use:enhance={() => {
				loading = true;
				error = null;
				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'failure') {
						const data = result.data as { error?: string } | null;
						error = data?.error ?? 'Ablehnung fehlgeschlagen.';
						return; // keep the dialog + the typed reason
					}
					if (result.type === 'success' || result.type === 'redirect') {
						// The action returns alreadyDecided when another tab won the race;
						// saying "Abgelehnt" there would claim an act we did not perform.
						const data = result.type === 'success' ? (result.data as { alreadyDecided?: boolean } | null) : null;
						if (data?.alreadyDecided) toast.info('Diese Einreichung war schon entschieden');
						else toast.success('Abgelehnt');
						open = false;
						reset();
					}
					await update();
				};
			}}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="submissionId" value={submissionId} />

			<div bind:this={firstTemplateEl}>
				<OptionGrid
					options={OPTIONS}
					value={selectedKey}
					legend="Grund-Vorlage"
					testid="reject-template"
					onselect={selectTemplate}
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="reject-grund" class="text-[12.5px] font-bold text-ink-700">
					Grund für die Ablehnung <span class="text-severity-critical-text">*</span>
				</label>
				<textarea
					id="reject-grund"
					name="grund"
					bind:this={textareaEl}
					bind:value={grund}
					oninput={onGrundInput}
					onkeydown={onTextareaKeydown}
					rows={3}
					required
					minlength={GRUND_MIN}
					maxlength={2000}
					data-testid="reject-grund"
					class="w-full rounded-[10px] border border-input bg-background px-3 py-2 text-base leading-relaxed placeholder:text-ink-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-sm"
					placeholder="In eigenen Worten — freundlich, aber klar …"
				></textarea>
				<p
					class="flex items-start gap-1.5 text-xs text-ink-500"
					data-testid="reject-hint"
					aria-live="polite"
				>
					<MailIcon class="mt-px size-3.5 shrink-0 text-ink-300" aria-hidden="true" />
					{hintText}
				</p>
			</div>

			{#if error}
				<p
					role="alert"
					data-testid="reject-error"
					class="rounded-[10px] border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-sm font-medium text-severity-critical-text"
				>
					{error}
				</p>
			{/if}

			<Dialog.Footer equal>
				<Dialog.Close disabled={loading}>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-hairline bg-card px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 md:h-10"
						>
							<XIcon class="size-4" aria-hidden="true" />
							Abbrechen
						</button>
					{/snippet}
				</Dialog.Close>
				<button
					type="submit"
					disabled={!canSubmit}
					data-testid="reject-submit"
					class="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-transparent bg-severity-critical px-4 text-sm font-semibold text-white transition-colors hover:bg-severity-critical/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:h-10"
				>
					{#if loading}
						<svg
							class="size-4 animate-spin"
							fill="none"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
						</svg>
						Wird abgelehnt …
					{:else}
						<CircleXIcon class="size-4" aria-hidden="true" />
						{error ? 'Nochmal ablehnen' : 'Ablehnen'}
					{/if}
				</button>
			</Dialog.Footer>
		</form>
{/snippet}

{#if isMobile}
	<!-- Phone: a bottom sheet with a grab handle. The footer's column-reverse
	     puts the destructive action on top, right above the thumb — with the
	     cancel underneath, so reaching for the primary spot never rejects. -->
	<Sheet.Root
		bind:open
		onOpenChange={(v) => {
			if (!v) reset();
		}}
	>
		<Sheet.Content
			side="bottom"
			data-testid="reject-dialog"
			showCloseButton={false}
			interactOutsideBehavior="ignore"
			escapeKeydownBehavior={loading ? 'ignore' : 'close'}
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				focusStart();
			}}
			class="max-h-[92dvh] gap-3 overflow-y-auto rounded-t-[24px] p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
		>
			<div class="mx-auto h-1 w-10 shrink-0 rounded-full bg-hairline" aria-hidden="true"></div>
			<Sheet.Header class="gap-1 p-0 text-left">
				<Sheet.Title class="text-base font-bold text-ink-900"
					>Einreichung {ausId} ablehnen</Sheet.Title
				>
				<Sheet.Description data-testid="reject-sub" class="text-[12.5px] text-ink-500"
					>{subText}</Sheet.Description
				>
			</Sheet.Header>
			{@render body()}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Dialog.Root
		bind:open
		onOpenChange={(v) => {
			if (!v) reset();
		}}
	>
		<Dialog.Content
			class="sm:max-w-[460px]"
			data-testid="reject-dialog"
			showCloseButton={false}
			interactOutsideBehavior="ignore"
			escapeKeydownBehavior={loading ? 'ignore' : 'close'}
			onOpenAutoFocus={(e) => {
				// Default focus would land on the close X. Start on the preselected
				// template instead (or straight in the textarea when there is nothing
				// to pick from), so the first keystroke does something useful.
				e.preventDefault();
				focusStart();
			}}
		>
			<Dialog.Header class="pr-10">
				<Dialog.Title>Einreichung {ausId} ablehnen</Dialog.Title>
				<Dialog.Description data-testid="reject-sub">{subText}</Dialog.Description>
			</Dialog.Header>

			<!-- Own close button (not the kit default) so it can be locked while the
			     request is in flight — a half-sent rejection must not lose its dialog. -->
			<Dialog.Close>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						disabled={loading}
						aria-label="Schließen"
						class="absolute top-3 right-3 grid size-9 place-items-center rounded-[10px] border border-hairline bg-card text-ink-500 transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
					>
						<XIcon class="size-4" />
					</button>
				{/snippet}
			</Dialog.Close>

			{@render body()}
		</Dialog.Content>
	</Dialog.Root>
{/if}
