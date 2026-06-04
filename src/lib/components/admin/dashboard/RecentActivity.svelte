<script lang="ts">
	interface ActivityEntry {
		id: string;
		occurredAt: Date | string;
		action: string;
		entityKind: string;
		entityBusinessId: string | null;
		actorKind: string;
		label: string;
	}

	interface Props {
		entries: ActivityEntry[];
	}

	let { entries }: Props = $props();

	function formatTime(raw: Date | string): string {
		const d = raw instanceof Date ? raw : new Date(raw);
		return d.toLocaleString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/** Map entity kind to a simple icon character */
	function entityIcon(kind: string): string {
		const icons: Record<string, string> = {
			expense: '💸',
			auslagen_submission: '📥',
			donation: '🎁',
			member: '👤',
			invoice: '🧾',
			income: '📈',
			user: '🔑',
			project: '📁',
			customer: '🏢',
			settings: '⚙️'
		};
		return icons[kind] ?? '📋';
	}
</script>

<section aria-labelledby="activity-heading" class="mt-10">
	<h2 id="activity-heading" class="mb-3 text-base font-semibold text-foreground">
		Letzte Aktivitäten
	</h2>

	{#if entries.length === 0}
		<p class="text-sm text-muted-foreground">Noch keine Aktivitäten aufgezeichnet.</p>
	{:else}
		<ol class="space-y-1">
			{#each entries as entry (entry.id)}
				<li
					class="fdw-cv-row flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
				>
					<span class="shrink-0 text-base" aria-hidden="true">{entityIcon(entry.entityKind)}</span>
					<span class="flex-1 text-foreground">{entry.label}</span>
					<time
						datetime={entry.occurredAt instanceof Date
							? entry.occurredAt.toISOString()
							: entry.occurredAt}
						class="shrink-0 text-xs text-muted-foreground"
					>
						{formatTime(entry.occurredAt)}
					</time>
				</li>
			{/each}
		</ol>
	{/if}
</section>
