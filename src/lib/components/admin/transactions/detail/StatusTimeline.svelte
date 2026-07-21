<script lang="ts" module>
	/** One audit-log event as the detail load hands it over (`detail.timeline`). */
	export interface TimelineEntry {
		id: string;
		occurredAt: string;
		action: string;
		actorKind: string;
		actorUserId: string | null;
	}
</script>

<script lang="ts">
	/**
	 * StatusTimeline — the Verlauf `.tl`: a NEUTRAL hairline rail with lifecycle
	 * dots coloured by stage (ART-DIRECTION §7): grey = erfasst/importiert,
	 * violett = geprüft, grün = erstattet/bescheinigt. Reads append-only from
	 * `detail.timeline` (ADR-0004) — never writes. German labels per brief §6.2.
	 */
	let { entries }: { entries: TimelineEntry[] } = $props();

	type Stage = "neutral" | "checked" | "done";
	const ACTION: Record<string, { label: string; stage: Stage }> = {
		create: { label: "Erfasst", stage: "neutral" },
		import: { label: "Importiert", stage: "neutral" },
		update: { label: "Bearbeitet", stage: "neutral" },
		approve: { label: "Geprüft & freigegeben", stage: "checked" },
		reject: { label: "Abgelehnt", stage: "neutral" },
		reimburse: { label: "Erstattet", stage: "done" },
		bescheinigung_generated: { label: "Bescheinigt", stage: "done" },
		festschreibung: { label: "Festgeschrieben", stage: "neutral" },
		storno: { label: "Storniert", stage: "neutral" },
	};

	const DOT: Record<Stage, string> = {
		neutral: "var(--ink-500)",
		checked: "var(--type-spende)",
		done: "var(--type-einnahme)",
	};

	function label(action: string): string {
		return ACTION[action]?.label ?? action;
	}
	function stage(action: string): Stage {
		return ACTION[action]?.stage ?? "neutral";
	}
	function fmt(iso: string): string {
		return new Date(iso).toLocaleString("de-DE", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	function actor(kind: string): string {
		return kind === "user" ? "Kassenwart:in" : "System";
	}
</script>

{#if entries.length === 0}
	<p class="text-sm text-ink-500">Noch keine Aktivitäten erfasst.</p>
{:else}
	<ol class="relative ml-1.5 border-l border-hairline pl-5" data-slot="timeline">
		{#each entries as e (e.id)}
			<li class="relative pb-4 last:pb-0" data-stage={stage(e.action)}>
				<span
					class="absolute -left-[27px] top-1 size-2.5 rounded-full ring-2 ring-card"
					style="background: {DOT[stage(e.action)]};"
					aria-hidden="true"
				></span>
				<div class="text-[11.5px] tabular-nums text-ink-500" title={e.occurredAt}>
					{fmt(e.occurredAt)}
				</div>
				<div class="text-[13px] font-semibold text-ink-900">
					{label(e.action)}
				</div>
				<div class="text-xs text-ink-500">{actor(e.actorKind)}</div>
			</li>
		{/each}
	</ol>
{/if}
