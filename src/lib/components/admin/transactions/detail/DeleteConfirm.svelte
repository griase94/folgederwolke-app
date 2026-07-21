<script lang="ts">
	/**
	 * DeleteConfirm — the staged delete dialog (detail-views-v4 §6). Three variants,
	 * ONE wording desktop↔mobile:
	 *   - simple: a harmless delete (nothing settled) with a green reassurance.
	 *   - warn:   a consequential delete (erstattet Ausgabe). „Nicht rückgängig
	 *             machbar" is the visual peak, the Kasse-Delta is a NEUTRAL ledger
	 *             fact (never einnahme-green), an audit note, and a ConfirmCheck
	 *             friction that gates the red button.
	 *   - blocked: the row is coupled to another entity (e.g. an income row that
	 *             backs a paid Rechnung) and CANNOT be deleted here. We never
	 *             promise „wird dauerhaft entfernt" (M6): the dialog explains the
	 *             coupling up front, links to the coupled entity, and offers NO
	 *             active red button — only „Schließen". The server RESTRICT stays
	 *             the real guard; this is the honest pre-flight.
	 * Centered dialog on desktop, bottom-sheet on mobile (checkbox + red button
	 * co-visible without scrolling). Submits `action` (?/delete) via enhance;
	 * the server redirects to the list on success.
	 */
	import { applyAction, enhance } from "$app/forms";
	import { toast } from "svelte-sonner";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import X from "@lucide/svelte/icons/x";
	import Check from "@lucide/svelte/icons/check";
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import LinkIcon from "@lucide/svelte/icons/link";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import ConfirmCheck from "$lib/components/ui/confirm-check/ConfirmCheck.svelte";
	import { focusTrap } from "$lib/actions/focus-trap.js";

	interface Props {
		open?: boolean;
		variant: "simple" | "warn" | "blocked";
		title: string;
		subtitle: string;
		/** simple: the reassurance line. */
		reassurance?: string;
		/** warn: the honest consequence sentence. */
		warnLine?: string;
		/** warn: the Kasse delta as a signed de-DE string (e.g. „+12,00 €"). */
		deltaValue?: string;
		/** blocked: why this row is coupled and can't be deleted here. */
		blockedExplanation?: string;
		/** blocked: link to the coupled entity (e.g. the Rechnung). */
		blockedHref?: string;
		/** blocked: label for the link to the coupled entity. */
		blockedLinkLabel?: string;
		confirmLabel?: string;
		action?: string;
		onClose: () => void;
	}

	let {
		open = $bindable(false),
		variant,
		title,
		subtitle,
		reassurance,
		warnLine,
		deltaValue,
		blockedExplanation,
		blockedHref,
		blockedLinkLabel,
		confirmLabel = "Löschen",
		action = "?/delete",
		onClose,
	}: Props = $props();

	let confirmed = $state(false);
	let deleting = $state(false);

	const canDelete = $derived(variant === "simple" || confirmed);
</script>

{#if open}
	<div
		class="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
		data-slot="delete-confirm"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget && !deleting) onClose();
		}}
	>
		<div
			class="w-full max-w-[480px] overflow-hidden rounded-t-2xl border border-hairline bg-card shadow-xl sm:rounded-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-confirm-title"
			tabindex="-1"
			use:focusTrap
			onkeydown={(e) => {
				if (e.key === "Escape" && !deleting) {
					e.preventDefault();
					onClose();
				}
			}}
		>
			{#if variant === "warn"}
				<div class="h-[3px] bg-[color:var(--sev-critical)]" aria-hidden="true"></div>
			{/if}
			<div class="p-5 sm:p-6">
				<div class="mb-4 flex items-start gap-3">
					<span
						class="grid size-11 shrink-0 place-items-center rounded-xl {variant ===
						'warn'
							? 'bg-[color:var(--sev-critical-tint)] text-[color:var(--sev-critical-text)]'
							: variant === 'blocked'
								? 'bg-[color:var(--sev-info)]/12 text-[color:var(--sev-info)]'
								: 'bg-secondary text-ink-500'}"
						aria-hidden="true"
					>
						{#if variant === "warn"}
							<TriangleAlert class="size-6" />
						{:else if variant === "blocked"}
							<LinkIcon class="size-5" />
						{:else}
							<Trash2 class="size-5" />
						{/if}
					</span>
					<div class="min-w-0">
						<h2 id="delete-confirm-title" class="text-[17px] font-bold text-ink-900">
							{title}
						</h2>
						<p class="mt-0.5 text-[12.5px] tabular-nums text-ink-500">{subtitle}</p>
					</div>
				</div>

				{#if variant === "simple"}
					{#if reassurance}
						<div
							class="flex items-start gap-2 rounded-xl border border-[color:var(--type-einnahme)]/25 bg-[color:var(--type-einnahme)]/8 px-3.5 py-2.5 text-[13px] text-ink-700"
						>
							<Check
								class="mt-0.5 size-4 shrink-0 text-[color:var(--type-einnahme)]"
								aria-hidden="true"
							/>
							<span>{reassurance}</span>
						</div>
					{/if}
				{:else if variant === "blocked"}
					<div
						class="rounded-xl border border-[color:var(--sev-info)]/25 bg-[color:var(--sev-info)]/8 px-4 py-3 text-[13px] text-ink-700"
					>
						{#if blockedExplanation}
							<p>{blockedExplanation}</p>
						{/if}
						{#if blockedHref}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- caller passes a static same-origin route -->
							<a
								href={blockedHref}
								class="mt-3 inline-flex items-center gap-1.5 font-semibold text-[color:var(--sev-info)] hover:underline"
								data-slot="delete-blocked-link"
							>
								{blockedLinkLabel ?? "Zur verknüpften Buchung"}
								<ArrowRight class="size-3.5" aria-hidden="true" />
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
					</div>
				{:else}
					<div
						class="flex items-start gap-3 rounded-xl border border-[color:var(--sev-critical)]/25 bg-[color:var(--sev-critical-tint)] px-4 py-3"
					>
						<span
							class="grid size-8 shrink-0 place-items-center rounded-lg bg-[color:var(--sev-critical)]/15 text-[color:var(--sev-critical-text)]"
							aria-hidden="true"><X class="size-4" /></span
						>
						<div class="min-w-0 text-[13px]">
							<div class="font-bold text-[color:var(--sev-critical-text)]">
								Nicht rückgängig machbar.
							</div>
							{#if warnLine}
								<p class="mt-1 text-ink-700">{warnLine}</p>
							{/if}
							{#if deltaValue}
								<dl class="mt-2 flex items-baseline justify-between gap-3">
									<dt class="text-ink-500">Kasse ändert sich um</dt>
									<dd class="font-bold tabular-nums text-ink-900">{deltaValue}</dd>
								</dl>
							{/if}
						</div>
					</div>
					<div
						class="my-3 flex items-center gap-2 text-[11.5px] font-semibold text-[color:var(--sev-info)]"
					>
						<ShieldCheck class="size-4" aria-hidden="true" />
						Der Löschvorgang wird im Audit-Log protokolliert.
					</div>
					<ConfirmCheck bind:checked={confirmed}>
						Ich verstehe die Folgen und möchte diese Buchung löschen.
					</ConfirmCheck>
				{/if}

				{#if variant === "blocked"}
					<div class="mt-5 flex justify-end">
						<button
							type="button"
							onclick={onClose}
							class="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted sm:flex-none"
							data-slot="delete-blocked-close"
						>
							<X class="size-4" aria-hidden="true" />Schließen
						</button>
					</div>
				{:else}
					<form
						method="POST"
						{action}
						use:enhance={() => {
							deleting = true;
							return async ({ result }) => {
								deleting = false;
								if (result.type === "failure") {
									const err = (result.data as { error?: string } | undefined)
										?.error;
									toast.error(err ?? "Löschen fehlgeschlagen");
								}
								await applyAction(result);
							};
						}}
						class="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end"
					>
						<button
							type="button"
							onclick={onClose}
							class="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted sm:flex-none"
						>
							<X class="size-4" aria-hidden="true" />Abbrechen
						</button>
						<button
							type="submit"
							disabled={!canDelete || deleting}
							class="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[color:var(--sev-critical)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
							data-slot="delete-confirm-submit"
						>
							<Trash2 class="size-4" aria-hidden="true" />{confirmLabel}
						</button>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}
