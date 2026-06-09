<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';

	let {
		open = $bindable(false),
		member,
		defaultYear,
		defaultBetragCents,
		reminderSentRecently,
		onSuccess
	}: {
		open: boolean;
		member: {
			id: string;
			vorname: string;
			nachname: string;
			email: string | null;
		};
		defaultYear: number;
		defaultBetragCents: number;
		reminderSentRecently: boolean;
		onSuccess?: () => void;
	} = $props();

	let loading = $state(false);
	// selectedYear is user-controlled (bound to <select>) AND synced from the defaultYear prop.
	// The $state + $effect combo is intentional: this is a writable prop-synced value.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let selectedYear = $state(0);

	$effect(() => {
		selectedYear = defaultYear;
	});

	const currentYear = new Date().getFullYear();
	const yearOptions = $derived(
		Array.from({ length: 5 }, (_, i) => currentYear - i)
	);

	const betragFmt = $derived(
		(defaultBetragCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
	);

	// Preview content based on current selection
	const previewVorname = $derived(member.vorname);
	const previewSubject = $derived(
		`Erinnerung: dein Mitgliedsbeitrag ${selectedYear} ist noch offen`
	);
	const previewVerwendungszweck = $derived(
		`Mitgliedsbeitrag ${selectedYear} ${member.vorname} ${member.nachname}`
	);

	function reset() {
		loading = false;
		selectedYear = defaultYear;
	}

	$effect(() => {
		if (!open) reset();
	});

	const isDisabled = $derived(
		reminderSentRecently || !member.email || loading
	);

	const disabledReason = $derived(
		!member.email
			? 'Keine E-Mail-Adresse hinterlegt'
			: reminderSentRecently
				? 'Erinnerung wurde bereits in den letzten 30 Tagen verschickt'
				: null
	);
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-full sm:max-w-lg overflow-y-auto">
		<Sheet.Header class="pb-0">
			<Sheet.Title class="text-lg font-bold">Erinnerungs-Mail vorbereiten</Sheet.Title>
			<Sheet.Description>
				Beitrags-Erinnerung an
				<strong>{member.vorname} {member.nachname}</strong> vorbereiten und senden.
			</Sheet.Description>
		</Sheet.Header>

		<div class="mt-6 space-y-6 px-1">
			<!-- Year selector -->
			<div class="space-y-2">
				<label
					for="reminder-year"
					class="text-sm font-medium text-foreground"
				>
					Beitragsjahr
				</label>
				<select
					id="reminder-year"
					bind:value={selectedYear}
					class="border-input bg-background h-9 w-full rounded-lg border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{#each yearOptions as y (y)}
						<option value={y}>{y}</option>
					{/each}
				</select>
			</div>

			<!-- Mail preview card -->
			<div class="space-y-2">
				<p class="text-sm font-medium text-foreground">Vorschau</p>

				<div class="rounded-xl border border-border bg-muted/30 p-4 space-y-3 text-sm">
					<!-- Header meta -->
					<div class="space-y-1.5">
						<div class="flex gap-3">
							<span class="w-16 shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-wide pt-0.5">An</span>
							<span class="text-foreground">{member.email ?? '—'}</span>
						</div>
						<div class="flex gap-3">
							<span class="w-16 shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-wide pt-0.5">Betreff</span>
							<span class="text-foreground">{previewSubject}</span>
						</div>
					</div>

					<div class="border-t border-border pt-3">
						<!-- Simplified text preview of BeitragsReminder template -->
						<p class="text-muted-foreground mb-2">
							<strong class="text-foreground">Liebste:r {previewVorname},</strong>
						</p>
						<p class="text-muted-foreground mb-3">
							Kleine, sonnige Erinnerung — dein Mitgliedsbeitrag für
							<strong class="text-foreground">{selectedYear}</strong> ist noch offen.
						</p>

						<!-- Payment details preview -->
						<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
							<div class="grid grid-cols-[120px_1fr] gap-1 text-xs">
								<span class="text-amber-700">Empfänger</span>
								<span class="font-medium text-amber-900">{page.data.vereinName}</span>
							</div>
							<div class="grid grid-cols-[120px_1fr] gap-1 text-xs">
								<span class="text-amber-700">Betrag</span>
								<span class="font-bold text-amber-900">{betragFmt}</span>
							</div>
							<div class="grid grid-cols-[120px_1fr] gap-1 text-xs">
								<span class="text-amber-700">Verwendungszweck</span>
								<span class="font-medium text-amber-900">{previewVerwendungszweck}</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Dedup / no-email warnings -->
			{#if disabledReason}
				<div
					class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
				>
					<svg
						class="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					{disabledReason}
				</div>
			{/if}
		</div>

		<!-- Send form + footer -->
		<Sheet.Footer class="mt-8 flex-col gap-2">
			<form
				method="POST"
				action="?/send-reminder"
				use:enhance={() => {
					loading = true;
					return async ({ result, update }) => {
						loading = false;
						if (result.type === 'success') {
							const data = result.data as { vorname?: string; deduped?: boolean } | undefined;
							const name = data?.vorname ?? member.vorname;
							if (data?.deduped) {
								toast.info(`Erinnerung bereits verschickt`, {
									description: `${name} hat in den letzten 30 Tagen bereits eine Erinnerung erhalten.`
								});
							} else {
								toast.success(`Erinnerung an ${name} verschickt`);
							}
							open = false;
							onSuccess?.();
							await update();
						} else if (result.type === 'failure') {
							const data = result.data as { error?: string } | undefined;
							toast.error(data?.error ?? 'Fehler beim Senden');
							await update();
						} else {
							await update();
						}
					};
				}}
				class="flex flex-col gap-3"
			>
				<input type="hidden" name="year" value={selectedYear} />

				<Button type="submit" disabled={isDisabled} class="w-full">
					{#if loading}
						<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
						Wird gesendet…
					{:else}
						<svg
							class="mr-2 h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
							/>
						</svg>
						Mail senden
					{/if}
				</Button>

				<Sheet.Close>
					{#snippet child({ props })}
						<Button variant="outline" type="button" class="w-full" {...props} disabled={loading}>
							Abbrechen
						</Button>
					{/snippet}
				</Sheet.Close>
			</form>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
