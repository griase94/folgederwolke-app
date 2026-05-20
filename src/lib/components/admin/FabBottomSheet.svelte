<!--
  FabBottomSheet — the "Neu" quick-add bottom sheet (C7 / PM-003).

  Triggered by the MobileTabBar FAB. Shows 4 quick actions covering the
  most-common create flows on a Kassenwart's phone:
    - Neue Ausgabe   → /app/transactions/neu?kind=ausgabe
    - Neue Einnahme  → /app/transactions/neu?kind=einnahme
    - Neue Spende    → /app/transactions/neu?kind=spende
    - Auslage einreichen → /auslage-einreichen  (public form)

  A11y notes:
  - shadcn-svelte Sheet wraps bits-ui Dialog → focus is trapped while open,
    ESC closes, focus returns to the trigger (the FAB) on close.
  - Each action is an anchor with role="menuitem" (so the four actions are
    selectable from a screen-reader rotor).
  - The sheet honours safe-area-inset-bottom so the last action sits above
    the home indicator on devices that have one.
-->
<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	type Action = {
		href: string;
		label: string;
		hint: string;
		icon: string;
		tone: string;
	};

	// Lucide-style icon paths. Stroke 2 / 24x24 viewBox.
	const ACTIONS: Action[] = [
		{
			href: '/app/transactions/neu?kind=ausgabe',
			label: 'Neue Ausgabe',
			hint: 'Beleg, Datum, Betrag',
			icon: 'M12 5v14M5 12h14',
			tone: 'bg-red-50 text-red-700'
		},
		{
			href: '/app/transactions/neu?kind=einnahme',
			label: 'Neue Einnahme',
			hint: 'z.B. Zahlung einer Rechnung',
			icon: 'M12 5v14M5 12h14',
			tone: 'bg-emerald-50 text-emerald-700'
		},
		{
			href: '/app/transactions/neu?kind=spende',
			label: 'Neue Spende',
			hint: 'Geld- oder Sachspende',
			icon: 'M12 5v14M5 12h14',
			tone: 'bg-blue-50 text-blue-700'
		},
		{
			href: '/auslage-einreichen',
			label: 'Auslage einreichen',
			hint: 'Öffentliches Formular',
			icon: 'M12 5v14M5 12h14',
			tone: 'bg-amber-50 text-amber-800'
		}
	];

	function onSelect(): void {
		// Close the sheet — SvelteKit anchor navigation kicks in via the href.
		// Closing eagerly (rather than waiting for navigation) keeps the
		// interaction snappy on flaky networks.
		open = false;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]"
	>
		<Sheet.Header class="pt-2">
			<!-- Drag handle (visual only) -->
			<div
				aria-hidden="true"
				class="mx-auto mb-1 h-1 w-9 rounded-full bg-muted-foreground/30"
			></div>
			<Sheet.Title class="text-left text-base font-semibold">Neu erfassen</Sheet.Title>
			<Sheet.Description class="text-left text-xs text-muted-foreground">
				Was möchtest du anlegen?
			</Sheet.Description>
		</Sheet.Header>

		<!--
			role="menu" + role="menuitem" on each link mirrors the contract of
			DropdownMenu, so screen-reader rotors group the 4 actions together.
		-->
		<div class="grid gap-1 px-2 pb-2" role="menu" aria-label="Schnellaktionen">
			{#each ACTIONS as action (action.href)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a
					role="menuitem"
					href={action.href}
					onclick={onSelect}
					class="flex min-h-[56px] items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full {action.tone}"
						aria-hidden="true"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.25"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d={action.icon} />
						</svg>
					</span>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="text-sm font-medium text-foreground">{action.label}</span>
						<span class="text-xs text-muted-foreground">{action.hint}</span>
					</span>
					<svg
						class="h-4 w-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
				</a>
			{/each}
		</div>
	</Sheet.Content>
</Sheet.Root>
