<script lang="ts">
	type AuditEntry = {
		id: string;
		occurredAt: string;
		action: string;
		actorKind: string;
		payload: Record<string, unknown> | null;
	};

	type SentMailEntry = {
		id: string;
		template: string;
		subject: string;
		status: string;
		queuedAt: string;
		sentAt: string | null;
	};

	let {
		auditEntries,
		sentMails
	}: {
		auditEntries: AuditEntry[];
		sentMails: SentMailEntry[];
	} = $props();

	// Merge and sort reverse-chronological
	type FeedItem =
		| { kind: 'audit'; entry: AuditEntry; ts: number }
		| { kind: 'mail'; entry: SentMailEntry; ts: number };

	const feed = $derived(
		(
			[
				...auditEntries.map((e) => ({
					kind: 'audit' as const,
					entry: e,
					ts: new Date(e.occurredAt).getTime()
				})),
				...sentMails.map((m) => ({
					kind: 'mail' as const,
					entry: m,
					ts: new Date(m.queuedAt).getTime()
				}))
			] as FeedItem[]
		).sort((a, b) => b.ts - a.ts)
	);

	function fmtDateTime(iso: string): string {
		return new Date(iso).toLocaleString('de-DE', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function auditActionLabel(action: string): string {
		const map: Record<string, string> = {
			create: 'Erstellt',
			update: 'Bearbeitet',
			delete: 'Gelöscht',
			approve: 'Genehmigt',
			reject: 'Abgelehnt',
			reimburse: 'Erstattet',
			import: 'Importiert',
			festschreibung: 'Festgeschrieben',
			storno: 'Storniert',
			sign_in: 'Angemeldet',
			sign_out: 'Abgemeldet',
			magic_link_issue: 'Magic Link erstellt',
			magic_link_verify: 'Magic Link verifiziert'
		};
		return map[action] ?? action;
	}

	function templateLabel(template: string): string {
		const map: Record<string, string> = {
			beitrag_reminder: 'Beitrags-Erinnerung',
			magic_link: 'Magic Link',
			auslage_eingang: 'Auslagen-Eingang',
			auslage_erstattet: 'Auslagen-Erstattung',
			auslage_abgelehnt: 'Auslagen-Ablehnung',
			spende_bescheinigung: 'Spendenbestätigung',
			invoice_versendet: 'Rechnung'
		};
		return map[template] ?? template;
	}

	function mailStatusLabel(status: string): string {
		const map: Record<string, string> = {
			queued: 'In Warteschlange',
			sent: 'Gesendet',
			bounced: 'Bounce',
			failed: 'Fehlgeschlagen'
		};
		return map[status] ?? status;
	}

	const mailStatusClasses: Record<string, string> = {
		queued: 'bg-blue-100 text-blue-700',
		sent: 'bg-green-100 text-green-700',
		bounced: 'bg-orange-100 text-orange-700',
		failed: 'bg-red-100 text-red-700'
	};
</script>

<div class="space-y-0">
	{#if feed.length === 0}
		<div class="rounded-xl border border-dashed border-border py-10 text-center">
			<svg
				class="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<p class="text-sm text-muted-foreground">Keine Aktivitäten vorhanden</p>
		</div>
	{:else}
		<div class="relative space-y-0">
			<!-- Vertical connector line -->
			<div
				class="absolute left-[19px] top-4 bottom-4 w-px bg-border"
				aria-hidden="true"
			></div>

			{#each feed as item (item.kind + '-' + item.entry.id)}
				<div class="relative flex items-start gap-4 pb-3">
					<!-- Icon dot -->
					<div
						class="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-background
						{item.kind === 'mail' ? 'border-blue-400' : 'border-muted-foreground/40'}"
					>
						{#if item.kind === 'mail'}
							<svg
								class="h-2.5 w-2.5 text-blue-500"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"
								/>
								<path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
							</svg>
						{:else}
							<svg
								class="h-2.5 w-2.5 text-muted-foreground"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fill-rule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"
									clip-rule="evenodd"
								/>
							</svg>
						{/if}
					</div>

					<!-- Content -->
					<div
						class="flex-1 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
					>
						{#if item.kind === 'mail'}
							{@const mail = item.entry as SentMailEntry}
							<div class="flex flex-wrap items-start gap-2">
								<div class="flex-1">
									<p class="text-sm font-medium text-foreground">
										{templateLabel(mail.template)}
									</p>
									<p class="mt-0.5 text-xs text-muted-foreground">{mail.subject}</p>
								</div>
								<div class="flex flex-col items-end gap-1">
									<span
										class="rounded-full px-2 py-0.5 text-xs font-medium {mailStatusClasses[
											mail.status
										] ?? 'bg-gray-100 text-gray-600'}"
									>
										{mailStatusLabel(mail.status)}
									</span>
									<time
										datetime={mail.queuedAt}
										class="text-xs text-muted-foreground"
									>
										{fmtDateTime(mail.queuedAt)}
									</time>
								</div>
							</div>
						{:else}
							{@const audit = item.entry as AuditEntry}
							<div class="flex flex-wrap items-start gap-2">
								<div class="flex-1">
									<p class="text-sm font-medium text-foreground">
										{auditActionLabel(audit.action)}
									</p>
									{#if audit.actorKind === 'system'}
										<p class="mt-0.5 text-xs text-muted-foreground">System-Aktion</p>
									{/if}
								</div>
								<time
									datetime={audit.occurredAt}
									class="text-xs text-muted-foreground"
								>
									{fmtDateTime(audit.occurredAt)}
								</time>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
