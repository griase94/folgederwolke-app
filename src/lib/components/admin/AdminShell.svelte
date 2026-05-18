<script lang="ts">
	import type { Snippet } from 'svelte';
	import Sidebar from './Sidebar.svelte';
	import Topbar from './Topbar.svelte';
	import MobileTabBar from './MobileTabBar.svelte';
	import type { SessionUser } from '$lib/server/auth/index.js';

	interface Props {
		user: SessionUser;
		children: Snippet;
	}

	let { user, children }: Props = $props();

	/**
	 * Sidebar is collapsed (icon-only) at the tablet breakpoint (768–1023px).
	 * We detect this via a CSS-driven approach: the sidebar itself adapts
	 * based on its container width using Tailwind classes. This boolean drives
	 * which variant to render.
	 */
</script>

<!--
  Layout grid:
  - Mobile  (< md):    single column, no sidebar, fixed bottom tab bar
  - Tablet  (md–lg):   sidebar 64px (icon-only) + flex-1 main
  - Desktop (≥ lg):    sidebar 240px + flex-1 main
-->
<div class="flex h-svh overflow-hidden bg-background">
	<!-- Sidebar: hidden on mobile, icon-only on tablet, full on desktop -->
	<div class="hidden md:flex md:shrink-0">
		<!-- Tablet: collapsed icon-only sidebar -->
		<div class="block lg:hidden">
			<Sidebar {user} collapsed={true} />
		</div>
		<!-- Desktop: full sidebar -->
		<div class="hidden lg:block">
			<Sidebar {user} collapsed={false} />
		</div>
	</div>

	<!-- Main area: topbar + scrollable content -->
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<Topbar {user} />

		<main
			id="main-content"
			class="flex-1 overflow-y-auto"
			style="padding-bottom: env(safe-area-inset-bottom, 0px);"
		>
			<!-- Extra bottom padding on mobile so tab bar doesn't obscure content -->
			<div class="pb-20 md:pb-0">
				{@render children()}
			</div>
		</main>
	</div>
</div>

<!-- Mobile bottom tab bar (hidden md+) -->
<MobileTabBar />
