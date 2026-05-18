<!--
  InboxList — vertically stacked list of pending submissions.

  Arrow keys (↑ / ↓) move focus between cards; Enter follows the link.
  Empty state ("Alles geprüft") is rendered by the caller when submissions
  is empty — this component renders only when there is at least one card.
-->
<script lang="ts">
	import InboxCard from './InboxCard.svelte';
	import type { InboxSubmissionView } from '$lib/domain/inbox.js';

	let { submissions }: { submissions: InboxSubmissionView[] } = $props();

	let rootEl = $state<HTMLDivElement | null>(null);

	function focusCard(index: number): void {
		if (!rootEl) return;
		const target = rootEl.querySelector<HTMLAnchorElement>(
			`a[data-inbox-card-index="${index}"]`
		);
		target?.focus();
	}

	function onKeydown(e: KeyboardEvent): void {
		if (!rootEl) return;
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') {
			return;
		}
		const active = document.activeElement;
		if (!(active instanceof HTMLAnchorElement)) return;
		// Only react when the focused element is one of OUR cards.
		if (!rootEl.contains(active)) return;
		const idxStr = active.dataset['inboxCardIndex'];
		if (idxStr === undefined) return;
		const idx = Number(idxStr);
		if (Number.isNaN(idx)) return;
		e.preventDefault();
		const last = submissions.length - 1;
		if (e.key === 'ArrowDown') focusCard(Math.min(last, idx + 1));
		else if (e.key === 'ArrowUp') focusCard(Math.max(0, idx - 1));
		else if (e.key === 'Home') focusCard(0);
		else if (e.key === 'End') focusCard(last);
	}
</script>

<!--
  Arrow-key navigation listens on window so the list reacts even when the
  user is anywhere in the page; the handler short-circuits unless one of the
  child <a> cards has focus. This avoids the a11y_no_noninteractive_element
  warning that a div-level keydown handler triggers.
-->
<svelte:window onkeydown={onKeydown} />

<div
	bind:this={rootEl}
	role="list"
	aria-label="Offene Einreichungen"
	class="space-y-2"
>
	{#each submissions as submission, i (submission.id)}
		<div role="listitem">
			<InboxCard {submission} index={i} />
		</div>
	{/each}
</div>
