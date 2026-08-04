<!--
	CopyAnnouncer — the ONE live region a page needs for its CopyFields.

	Screen readers want a single polite region per page; one per field would be
	ignored or read over itself. The page owns this component, hands its
	`announce` to every CopyField's `onCopied`, and the region clears itself so
	a stale "IBAN kopiert" is never re-read on the next focus change.
-->
<script lang="ts" module>
	/** Matches the CopyField morph so text and icon settle together. */
	const CLEAR_MS = 1200;
</script>

<script lang="ts">
	let message = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Bind via `bind:this` and pass `announcer.announce` to CopyField.onCopied. */
	export function announce(label: string) {
		message = `${label} kopiert`;
		clearTimeout(timer);
		timer = setTimeout(() => (message = ''), CLEAR_MS);
	}
</script>

<div aria-live="polite" class="sr-only" data-testid="copy-live">{message}</div>
