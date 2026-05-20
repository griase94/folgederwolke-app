<script lang="ts" module>
	import { cn } from '$lib/utils.js';

	export interface WorkspaceTab {
		id: string;
		label: string;
		href: string;
	}

	export interface WorkspaceTabsProps {
		tabs: WorkspaceTab[];
		/** Path of the current URL, used to compute the active tab. */
		activePath: string;
		ariaLabel?: string;
	}
</script>

<script lang="ts">
	let { tabs, activePath, ariaLabel = 'Jahresabschluss-Tabs' }: WorkspaceTabsProps = $props();

	function isActive(href: string): boolean {
		// "active" when activePath starts with href; this handles nested paths
		// (e.g. /app/jahresabschluss/2025/uebersicht/foo → uebersicht is still active).
		// We also resolve the case where activePath ends with /[year] (no tab):
		// in that case the default tab (uebersicht) is the active one.
		return activePath === href || activePath.startsWith(href + '/');
	}
</script>

<nav
	data-testid="workspace-tabs"
	data-slot="workspace-tabs"
	aria-label={ariaLabel}
	class="-mx-4 mb-6 flex border-b border-border/60 px-4 sm:mx-0 sm:px-0"
>
	<ul role="tablist" class="flex min-w-0 gap-1 overflow-x-auto sm:gap-2">
		{#each tabs as t (t.id)}
			{@const active = isActive(t.href)}
			<li role="presentation" class="flex-shrink-0">
				<a
					href={t.href}
					role="tab"
					aria-selected={active}
					aria-current={active ? 'page' : undefined}
					data-tab-id={t.id}
					data-active={active}
					class={cn(
						'relative inline-flex items-center whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-t',
						active
							? 'text-foreground'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					{t.label}
					{#if active}
						<span
							aria-hidden="true"
							class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#9c2870]"
						></span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>
