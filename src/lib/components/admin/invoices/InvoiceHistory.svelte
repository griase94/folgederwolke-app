<!--
  InvoiceHistory — Verlauf timeline for the Rechnung detail page.

  Renders audit_log entries scoped to a single invoice in reverse-chronological
  order. Each entry: indicator dot + bold German label derived from the
  audit-log payload's kind field (falling back to the action column for
  pre-payload rows), meta line (actor + de-DE timestamp Europe/Berlin), and —
  for edited events — a single-line diff per changed field.

  Phase 12-B. Agent C imports this component on the detail page.
-->
<script lang="ts">
	type InvoiceHistoryEntry = {
		occurredAt: string;
		action: 'create' | 'update' | 'delete';
		actorName: string | null;
		payload: Record<string, unknown>;
	};

	let { entries }: { entries: InvoiceHistoryEntry[] } = $props();

	// Formatting helpers

	const dateTimeFmt = new Intl.DateTimeFormat('de-DE', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Europe/Berlin'
	});

	function fmtDateTime(iso: string): string {
		return dateTimeFmt.format(new Date(iso));
	}

	function fmtCurrencyCents(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: 'EUR'
		});
	}

	function fmtDateDe(iso: string | null): string {
		if (!iso) return '—';
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
		if (m) return `${m[3]}.${m[2]}.${m[1]}`;
		return iso;
	}

	function isCentsField(field: string): boolean {
		return field === 'nettoCents' || field === 'bruttoCents' || field === 'ustCents';
	}

	function isDateField(field: string): boolean {
		return (
			field === 'rechnungsdatum' ||
			field === 'leistungsDatum' ||
			field === 'faelligkeitsDatum'
		);
	}

	const FIELD_LABELS: Record<string, string> = {
		customerId: 'Kund:in',
		customerNameSnapshot: 'Kund:in (Name)',
		customerAddressSnapshot: 'Kund:in (Adresse)',
		projectId: 'Projekt',
		kategorieId: 'Kategorie',
		kategorieNameSnapshot: 'Kategorie (Name)',
		sphereSnapshot: 'Sphäre',
		rechnungsdatum: 'Rechnungsdatum',
		leistungsDatum: 'Leistungsdatum',
		faelligkeitsDatum: 'Fällig bis',
		bezeichnung: 'Bezeichnung',
		leistungsBeschreibung: 'Leistungsbeschreibung',
		leistungszeitraum: 'Leistungszeitraum',
		nettoCents: 'Netto',
		bruttoCents: 'Brutto',
		ustCents: 'USt',
		currency: 'Währung'
	};

	function fieldLabel(field: string): string {
		return FIELD_LABELS[field] ?? field;
	}

	function fmtValue(field: string, value: unknown): string {
		if (value === null || value === undefined || value === '') return '—';
		if (isCentsField(field) && typeof value === 'number') {
			return fmtCurrencyCents(value);
		}
		if (isDateField(field) && typeof value === 'string') {
			return fmtDateDe(value);
		}
		if (typeof value === 'string') {
			return `"${value}"`;
		}
		return String(value);
	}

	type EntryView = {
		key: string;
		occurredAt: string;
		actorName: string | null;
		label: string;
		labelSuffix: string | null;
		changedFields: Array<{ field: string; before: unknown; after: unknown }> | null;
	};

	function deriveLabel(entry: InvoiceHistoryEntry): {
		label: string;
		labelSuffix: string | null;
	} {
		const kind =
			typeof entry.payload?.kind === 'string' ? (entry.payload.kind as string) : null;

		if (!kind && entry.action === 'create') {
			return { label: 'Erstellt', labelSuffix: null };
		}

		switch (kind) {
			case 'edited':
				return { label: 'Bearbeitet', labelSuffix: null };
			case 'pdf_generated': {
				const deduped =
					typeof entry.payload?.dedupedFromFileId === 'string' &&
					(entry.payload.dedupedFromFileId as string).length > 0;
				return {
					label: 'PDF erstellt',
					labelSuffix: deduped ? '(gleicher Inhalt)' : null
				};
			}
			case 'paid':
				return { label: 'Zahlung verbucht', labelSuffix: null };
			case 'payment_undone':
				return { label: 'Zahlung rückgängig', labelSuffix: null };
			case 'superseded':
				return { label: 'Ersetzt durch Korrektur', labelSuffix: null };
		}

		switch (entry.action) {
			case 'create':
				return { label: 'Erstellt', labelSuffix: null };
			case 'update':
				return { label: 'Bearbeitet', labelSuffix: null };
			case 'delete':
				return { label: 'Gelöscht', labelSuffix: null };
		}
	}

	const view = $derived<EntryView[]>(
		entries.map((e, i) => {
			const { label, labelSuffix } = deriveLabel(e);

			let changedFields: EntryView['changedFields'] = null;
			if (e.payload?.kind === 'edited') {
				const raw = e.payload.changedFields;
				if (raw && typeof raw === 'object') {
					changedFields = Object.entries(raw as Record<string, unknown>)
						.filter(
							([, v]) =>
								v &&
								typeof v === 'object' &&
								'before' in (v as object) &&
								'after' in (v as object)
						)
						.map(([field, v]) => {
							const cf = v as { before: unknown; after: unknown };
							return { field, before: cf.before, after: cf.after };
						});
				}
			}

			return {
				key: `${e.occurredAt}-${i}`,
				occurredAt: e.occurredAt,
				actorName: e.actorName,
				label,
				labelSuffix,
				changedFields
			};
		})
	);
</script>

<div class="space-y-0">
	{#if view.length === 0}
		<div class="rounded-xl border border-dashed border-border py-10 text-center">
			<p class="text-sm text-muted-foreground">Noch keine Aktivitäten</p>
		</div>
	{:else}
		<div class="relative space-y-3">
			<!-- Vertical connector line -->
			<div
				class="absolute bottom-4 left-[19px] top-4 w-px bg-border"
				aria-hidden="true"
			></div>

			{#each view as item (item.key)}
				<div class="relative flex items-start gap-4">
					<!-- Indicator dot -->
					<div
						class="relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 bg-background"
					>
						<div class="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"></div>
					</div>

					<!-- Content card -->
					<div class="flex-1 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
						<div class="flex flex-wrap items-baseline gap-x-2">
							<p class="text-sm font-semibold text-foreground">{item.label}</p>
							{#if item.labelSuffix}
								<p class="text-xs text-muted-foreground">{item.labelSuffix}</p>
							{/if}
						</div>
						<p class="mt-0.5 text-xs text-muted-foreground">
							· {item.actorName ?? 'System'} ·
							<time datetime={item.occurredAt}>{fmtDateTime(item.occurredAt)}</time>
						</p>

						{#if item.changedFields && item.changedFields.length > 0}
							<ul class="mt-2 space-y-1 text-xs text-foreground">
								{#each item.changedFields as cf (cf.field)}
									<li>
										<span class="font-medium">{fieldLabel(cf.field)}:</span>
										<span class="text-muted-foreground">{fmtValue(cf.field, cf.before)}</span>
										<span class="mx-1 text-muted-foreground">→</span>
										<span>{fmtValue(cf.field, cf.after)}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
