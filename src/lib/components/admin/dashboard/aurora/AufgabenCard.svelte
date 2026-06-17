<script lang="ts">
	/**
	 * Aufgaben card (spec §7): buildTaskQueue → TaskRow list. Mobile shows up
	 * to 4 rows + "Alle N Aufgaben" expander; desktop shows all. "Heute"
	 * context label when the year switcher is off the current Berlin year
	 * (the queue is ALWAYS anchored to today — mirrors the Beiträge section).
	 */
	import TaskRow from '$lib/components/ui/TaskRow.svelte';
	import {
		buildTaskQueue,
		type QueueTask,
		type TaskQueueInput
	} from '$lib/domain/task-queue.js';

	let {
		input,
		selectedYear,
		currentYear,
		now = new Date()
	}: {
		input: TaskQueueInput;
		// selectedYear/currentYear come from the layout parent-data merge
		// (src/routes/app/+layout.server.ts; PageData already includes them) —
		// the page passes them down. Do NOT add them to +page.server.ts.
		selectedYear: number;
		currentYear: number;
		now?: Date;
	} = $props();

	const tasks = $derived(buildTaskQueue(input, now));
	let expanded = $state(false);
	const MOBILE_CAP = 4;

	// Tinted 26px icon chips (gradient-brand-soft is THE sanctioned soft
	// treatment for task rails/chips — spec §2 gradient budget).
	function chipTint(t: QueueTask): string {
		if (t.severity === 'critical') return 'bg-severity-critical/10 text-severity-critical-text';
		if (t.severity === 'warn') return 'bg-severity-warn/10 text-severity-warn-text';
		if (t.id === 'belegpruefung') return 'bg-type-ausgabe-tint text-type-ausgabe';
		if (t.id === 'erstattungen') return 'bg-type-einnahme-tint text-type-einnahme';
		if (t.id === 'jahresabschluss') return 'bg-type-spende-tint text-type-spende';
		return '[background-image:var(--gradient-brand-soft)] text-primary-text';
	}
</script>

{#snippet icon(t: QueueTask)}
	<span class={'flex size-[26px] items-center justify-center rounded-lg ' + chipTint(t)}>
		<svg
			class="size-3.5"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			{#if t.id === 'wgb-ueberschritten' || t.id === 'wgb-warn'}
				<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
				<path d="M12 9v4m0 4h.01" />
			{:else if t.id === 'belegpruefung'}
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.3-4.3" />
			{:else if t.id === 'erstattungen'}
				<rect x="2" y="6" width="20" height="12" rx="2" />
				<circle cx="12" cy="12" r="2" />
			{:else if t.id === 'jahresabschluss'}
				<rect x="3" y="4" width="18" height="17" rx="2" />
				<path d="M16 2v4M8 2v4M3 10h18" />
			{:else if t.id === 'vorjahres-beitraege'}
				<circle cx="12" cy="12" r="10" />
				<path d="M12 6v6l4 2" />
			{:else}
				<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
			{/if}
		</svg>
	</span>
{/snippet}

<section class="rounded-2xl bg-white p-4 shadow-(--shadow-card)" aria-labelledby="aufgaben-heading">
	<div class="mb-2 flex items-center justify-between">
		<h2 id="aufgaben-heading" class="text-sm font-semibold tracking-tight text-ink-900">
			Aufgaben
		</h2>
		{#if selectedYear !== currentYear}
			<span
				data-testid="aufgaben-heute-chip"
				class="rounded-full border border-(--hairline) px-2 py-0.5 text-xs text-ink-500"
				title="Aufgaben beziehen sich immer auf heute, unabhängig vom gewählten Jahr"
			>Heute</span>
		{/if}
	</div>

	{#if tasks.length === 0}
		<p class="flex h-13 items-center text-sm text-ink-500 md:h-11">
			Alles erledigt — nichts wartet auf dich.
		</p>
	{:else}
		<ul class="flex flex-col">
			{#each tasks as task, i (task.id)}
				<li
					data-testid="task-item"
					class={i >= MOBILE_CAP && !expanded ? 'hidden md:block' : ''}
				>
					<TaskRow
						railKind={task.railKind}
						title={task.title}
						amountCents={task.amountCents}
						ctaLabel={task.ctaLabel}
						href={task.href}
						severity={task.severity}
					>
						{#snippet chipIcon()}{@render icon(task)}{/snippet}
					</TaskRow>
					{#if task.subline}
						<!-- align under TaskRow title: px-1(4)+rail(3)+gap(10)+chip(26)+gap(10)=53px -->
						<p class="-mt-0.5 mb-1 pl-[53px] text-xs text-ink-500">{task.subline}</p>
					{/if}
				</li>
			{/each}
		</ul>
		{#if tasks.length > MOBILE_CAP && !expanded}
			<button
				type="button"
				class="mt-1 w-full rounded-[10px] py-2 text-[13px] font-medium text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) md:hidden"
				onclick={() => (expanded = true)}
			>
				Alle {tasks.length} Aufgaben
			</button>
		{/if}
	{/if}
</section>
