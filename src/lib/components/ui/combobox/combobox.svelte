<script lang="ts">
	import * as Popover from "$lib/components/ui/popover/index.js";
	import { cn } from "$lib/utils.js";

	type Option = { value: string; label: string };

	let {
		options,
		value = $bindable([]),
		onValueChange,
		multiple = false,
		placeholder = "Auswählen…",
		searchPlaceholder = "Suchen…",
		ariaLabel,
		class: className,
	}: {
		options: Option[];
		value?: string[];
		onValueChange: (v: string[]) => void;
		multiple?: boolean;
		placeholder?: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	let query = $state("");
	let activeIndex = $state(0);
	let inputRef = $state<HTMLInputElement | null>(null);
	let listboxId = $props.id();
	const optionId = (i: number) => `${listboxId}-opt-${i}`;

	const filtered = $derived(
		options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
	);

	const selectedLabels = $derived(
		options.filter((o) => value.includes(o.value)).map((o) => o.label)
	);

	const triggerLabel = $derived(
		selectedLabels.length ? selectedLabels.join(", ") : placeholder
	);

	// Keep the active option in range whenever the filtered list shrinks/grows.
	$effect(() => {
		if (activeIndex > filtered.length - 1) {
			activeIndex = Math.max(0, filtered.length - 1);
		}
	});

	function isSelected(v: string): boolean {
		return value.includes(v);
	}

	function commit(next: string[]) {
		value = next;
		onValueChange(next);
	}

	function toggle(v: string) {
		if (multiple) {
			const next = isSelected(v)
				? value.filter((x) => x !== v)
				: [...value, v];
			commit(next);
			// Multiple mode keeps the popover open for further toggling.
		} else {
			commit(isSelected(v) ? [] : [v]);
			open = false;
		}
	}

	function onInput(e: Event) {
		query = (e.currentTarget as HTMLInputElement).value;
		activeIndex = 0;
	}

	function onKeyDown(e: KeyboardEvent) {
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				if (filtered.length) activeIndex = (activeIndex + 1) % filtered.length;
				break;
			case "ArrowUp":
				e.preventDefault();
				if (filtered.length)
					activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
				break;
			case "Home":
				e.preventDefault();
				activeIndex = 0;
				break;
			case "End":
				e.preventDefault();
				activeIndex = filtered.length - 1;
				break;
			case "Enter": {
				e.preventDefault();
				const opt = filtered[activeIndex];
				if (opt) toggle(opt.value);
				break;
			}
			case "Escape":
				e.preventDefault();
				// Stop the surface beneath (e.g. the FilterBar mobile Sheet/Dialog)
				// from also closing on this Escape.
				e.stopPropagation();
				open = false;
				break;
		}
	}

	// Reset the query each time the popover opens so the full list is shown.
	$effect(() => {
		if (open) {
			query = "";
			activeIndex = 0;
		}
	});

	// Follow the active option with the scroll viewport during keyboard nav —
	// max-h-64 + overflow-y-auto means ArrowDown/End past the fold would
	// otherwise move the active descendant off-screen.
	$effect(() => {
		if (!open) return;
		document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		data-slot="combobox-trigger"
		class={cn(
			"border-input bg-background hover:bg-accent hover:text-accent-foreground flex h-9 min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring",
			className
		)}
	>
		<span class={cn("truncate", !selectedLabels.length && "text-muted-foreground")}>
			{triggerLabel}
		</span>
	</Popover.Trigger>
	<Popover.Content
		data-slot="combobox-content"
		class="w-72 p-0"
		onOpenAutoFocus={(e) => {
			// Keep focus on our search input instead of the first option.
			e.preventDefault();
			inputRef?.focus();
		}}
	>
		<div class="flex flex-col">
			<input
				bind:this={inputRef}
				bind:value={query}
				role="combobox"
				aria-expanded={open}
				aria-controls={listboxId}
				aria-activedescendant={filtered.length ? optionId(activeIndex) : undefined}
				aria-autocomplete="list"
				aria-label={ariaLabel ?? searchPlaceholder}
				placeholder={searchPlaceholder}
				class="border-input placeholder:text-muted-foreground focus-visible:ring-ring h-11 border-b bg-transparent px-3 text-sm outline-none focus-visible:ring-0"
				oninput={onInput}
				onkeydown={onKeyDown}
			/>
			<ul
				id={listboxId}
				role="listbox"
				aria-multiselectable={multiple}
				aria-label={ariaLabel ?? placeholder}
				class="max-h-64 overflow-y-auto p-1"
			>
				{#each filtered as opt, i (opt.value)}
					<!-- Keyboard nav is driven by the controlling combobox input
					     (aria-activedescendant); the option itself is pointer-only. -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id={optionId(i)}
						role="option"
						aria-selected={isSelected(opt.value)}
						data-slot="combobox-item"
						data-active={i === activeIndex ? "" : undefined}
						class={cn(
							"flex min-h-11 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none",
							"data-active:bg-accent data-active:text-accent-foreground",
							isSelected(opt.value) && "font-medium"
						)}
						onclick={() => toggle(opt.value)}
						onmousemove={() => (activeIndex = i)}
					>
						<span
							class={cn(
								"flex size-4 shrink-0 items-center justify-center",
								!isSelected(opt.value) && "opacity-0"
							)}
							aria-hidden="true"
						>
							✓
						</span>
						<span class="truncate">{opt.label}</span>
					</li>
				{:else}
					<li class="text-muted-foreground px-2 py-1.5 text-sm">Keine Treffer</li>
				{/each}
			</ul>
		</div>
	</Popover.Content>
</Popover.Root>
