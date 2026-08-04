<script lang="ts" module>
	export interface CreateMenuProps {
		/** Trigger label. The name canon is "Neu erfassen" — never "Neue Transaktion". */
		label?: string;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * CreateMenu — the desktop "Neu erfassen ▾" entry point (spec §5).
	 *
	 * The desktop counterpart of the mobile ⊕ CreateSheet, sharing its entries
	 * (CREATE_ENTRIES) so label, order, destination and hue cannot drift. Below
	 * md it renders nothing: the tab bar's ⊕ already owns that job, and two
	 * create affordances on one phone screen is one too many.
	 *
	 * `max-md:hidden`, not `hidden md:inline-flex`: the Kit button base already
	 * sets `inline-flex`, and two unprefixed display utilities of equal
	 * specificity are decided by stylesheet order — the button stayed visible on
	 * the phone.
	 *
	 * Built on the Kit DropdownMenu, so arrow-key navigation, Esc and focus
	 * return to the trigger come for free. Each entry is a REAL <a> via the
	 * child snippet (guidelines §2.4) — an <a> nested in a close-only item would
	 * not navigate on Enter or middle-click.
	 */
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { CREATE_ENTRIES } from './create-entries.js';

	let { label = 'Neu erfassen', class: className }: CreateMenuProps = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={[buttonVariants({ size: 'cta' }), 'max-md:hidden', className]}
		data-testid="create-menu-trigger"
	>
		{label}
		<svg
			class="size-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-56" align="end">
		{#each CREATE_ENTRIES as entry (entry.href)}
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a {...props} href={entry.href} data-testid="create-menu-item">
						<span
							class={['flex size-7 items-center justify-center rounded-lg', entry.chip]}
							aria-hidden="true"
						>
							<entry.icon size={16} strokeWidth={2.25} />
						</span>
						<span class="text-sm font-medium">{entry.label}</span>
					</a>
				{/snippet}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
