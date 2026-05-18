<script lang="ts">
	import { enhance } from '$app/forms';
	import { beitragStatusFor, type BeitragStatus } from '$lib/domain/members.js';

	type BeitragRow = {
		id: string;
		year: number;
		betragCents: number;
		paidCents: number;
		gezahltAm: string | null;
		notes: string | null;
		createdAt: string;
		updatedAt: string;
	};

	let {
		beitrags,
		memberId
	}: {
		beitrags: BeitragRow[];
		memberId: string;
	} = $props();

	// Sorted newest first (server already orders this, but be explicit)
	const sorted = $derived([...beitrags].sort((a, b) => b.year - a.year));

	const totalPaidCents = $derived(
		beitrags.reduce((sum, b) => sum + Math.min(b.paidCents, b.betragCents), 0)
	);
	const totalOpenCents = $derived(
		beitrags.reduce((sum, b) => sum + Math.max(0, b.betragCents - b.paidCents), 0)
	);

	function fmtEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function fmtDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const statusLabel: Record<BeitragStatus, string> = {
		paid: 'bezahlt',
		open: 'offen',
		waived: 'erlassen'
	};

	const statusClasses: Record<BeitragStatus, string> = {
		paid: 'bg-green-100 text-green-800 border-green-200',
		open: 'bg-amber-100 text-amber-800 border-amber-200',
		waived: 'bg-gray-100 text-gray-500 border-gray-200'
	};

	let markingYear = $state<number | null>(null);
</script>

<div class="space-y-4">
	<!-- Summary row -->
	{#if beitrags.length > 0}
		<div class="grid grid-cols-2 gap-3">
			<div class="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
				<p class="text-xs font-medium text-green-700">Gesamt bezahlt</p>
				<p class="mt-0.5 text-lg font-bold text-green-800">{fmtEur(totalPaidCents)}</p>
			</div>
			<div
				class="rounded-xl border px-4 py-3
				{totalOpenCents > 0
					? 'border-amber-200 bg-amber-50'
					: 'border-border bg-muted'}"
			>
				<p class="text-xs font-medium {totalOpenCents > 0 ? 'text-amber-700' : 'text-muted-foreground'}">
					Gesamt offen
				</p>
				<p
					class="mt-0.5 text-lg font-bold {totalOpenCents > 0
						? 'text-amber-800'
						: 'text-muted-foreground'}"
				>
					{fmtEur(totalOpenCents)}
				</p>
			</div>
		</div>
	{/if}

	<!-- Timeline -->
	{#if sorted.length === 0}
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
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
				/>
			</svg>
			<p class="text-sm text-muted-foreground">Noch keine Beitragsdaten vorhanden</p>
		</div>
	{:else}
		<div class="relative space-y-0">
			<!-- Vertical line -->
			<div
				class="absolute left-[19px] top-4 bottom-4 w-px bg-border"
				aria-hidden="true"
			></div>

			{#each sorted as b (b.id)}
				{@const status = beitragStatusFor(b)}
				<div class="relative flex items-start gap-4 pb-4">
					<!-- Timeline dot -->
					<div
						class="relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-background
						{status === 'paid'
							? 'border-green-400'
							: status === 'open'
								? 'border-amber-400'
								: 'border-gray-300'}"
					>
						{#if status === 'paid'}
							<svg
								class="h-2.5 w-2.5 text-green-600"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						{:else if status === 'open'}
							<div class="h-2 w-2 rounded-full bg-amber-400"></div>
						{/if}
					</div>

					<!-- Row content -->
					<div
						class="flex flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-0"
					>
						<!-- Year + status -->
						<div class="flex flex-1 items-center gap-3">
							<span class="w-12 text-base font-bold text-foreground tabular-nums">
								{b.year}
							</span>
							<span
								class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {statusClasses[status]}"
							>
								{statusLabel[status]}
							</span>
						</div>

						<!-- Amount + date -->
						<div class="flex items-center gap-4 text-sm">
							<span class="font-medium text-foreground tabular-nums">
								{fmtEur(b.betragCents)}
							</span>
							{#if b.gezahltAm}
								<span class="text-muted-foreground">
									{fmtDate(b.gezahltAm)}
								</span>
							{/if}
						</div>

						<!-- Mark paid action -->
						{#if status !== 'paid' && status !== 'waived'}
							<form
								method="POST"
								action="?/mark-beitrag-paid"
								class="mt-2 sm:mt-0 sm:ml-4"
								use:enhance={() => {
									markingYear = b.year;
									return async ({ update }) => {
										await update();
										markingYear = null;
									};
								}}
							>
								<input type="hidden" name="member_id" value={memberId} />
								<input type="hidden" name="year" value={b.year} />
								<button
									type="submit"
									disabled={markingYear === b.year}
									class="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
								>
									{#if markingYear === b.year}
										<svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
									{:else}
										<svg
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2.5"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
									Als bezahlt markieren
								</button>
							</form>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
