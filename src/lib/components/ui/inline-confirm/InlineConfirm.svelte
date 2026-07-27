<script lang="ts">
	/**
	 * InlineConfirm — a two-step "armed" destructive control (`.inline-confirm`).
	 *
	 * First click arms (label swaps to the confirm phrasing, ghost → solid
	 * danger); the second click confirms. Esc or blur disarms — no nested dialog,
	 * no accidental commit (modal-member-popovers §3). Enter never auto-confirms
	 * stage 2: arming and confirming are two deliberate gestures.
	 *
	 * Reusable L1 primitive (Storno / Befreiung-Aufheben today; any future inline
	 * destructive action). Danger tone uses the `severity-critical` token family.
	 */
	let {
		label,
		confirmLabel,
		onConfirm,
		disabled = false,
		'data-testid': testId = 'inline-confirm'
	}: {
		/** Resting label, e.g. "Stornieren". */
		label: string;
		/** Armed label. Defaults to "Wirklich {label}?". */
		confirmLabel?: string;
		onConfirm: () => void;
		disabled?: boolean;
		'data-testid'?: string;
	} = $props();

	let armed = $state(false);
	const armedLabel = $derived(confirmLabel ?? `Wirklich ${label.toLowerCase()}?`);

	function handleClick() {
		if (disabled) return;
		if (!armed) {
			armed = true;
			return;
		}
		armed = false;
		onConfirm();
	}

	function disarm() {
		armed = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		// Esc disarms without bubbling to a parent dialog's close handler.
		if (e.key === 'Escape' && armed) {
			e.preventDefault();
			e.stopPropagation();
			disarm();
		}
	}
</script>

<button
	type="button"
	{disabled}
	data-testid={testId}
	data-armed={armed ? 'true' : undefined}
	onclick={handleClick}
	onblur={disarm}
	onkeydown={handleKeydown}
	class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-50 {armed
		? 'bg-severity-critical text-white hover:bg-severity-critical/90'
		: 'text-severity-critical-text hover:bg-severity-critical/10'}"
>
	<span aria-live="polite">{armed ? armedLabel : label}</span>
</button>
