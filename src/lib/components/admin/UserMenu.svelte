<script lang="ts">
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger,
	} from '$lib/components/ui/dropdown-menu/index.js';
	import type { SessionUser } from '$lib/server/auth/index.js';

	interface Props {
		user: SessionUser;
	}

	let { user }: Props = $props();

	/** Derive initials from name or email */
	function initials(u: SessionUser): string {
		if (u.name) {
			const parts = u.name.trim().split(/\s+/);
			const first = parts[0] ?? '';
			const last = parts.length >= 2 ? (parts[parts.length - 1] ?? '') : '';
			if (parts.length >= 2 && first && last) {
				return (first[0]! + last[0]!).toUpperCase();
			}
			return u.name.slice(0, 2).toUpperCase();
		}
		return u.email.slice(0, 2).toUpperCase();
	}

	const abbr = $derived(initials(user));
	const displayName = $derived(user.name ?? user.email);
</script>

<DropdownMenu>
	<DropdownMenuTrigger
		class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
		aria-label="Benutzermenü öffnen"
	>
		{abbr}
	</DropdownMenuTrigger>

	<DropdownMenuContent align="end" class="w-52">
		<DropdownMenuLabel class="font-normal">
			<div class="flex flex-col space-y-1">
				<p class="text-sm font-medium leading-none">{displayName}</p>
				<p class="text-xs leading-none text-muted-foreground">{user.email}</p>
			</div>
		</DropdownMenuLabel>

		<DropdownMenuSeparator />

		<!-- Sign-out: use onSelect to submit the form via JS (no asChild needed) -->
		<form method="POST" action="/sign-out" id="sign-out-form" class="hidden"></form>
		<DropdownMenuItem
			variant="destructive"
			onSelect={() => {
				(document.getElementById('sign-out-form') as HTMLFormElement | null)?.submit();
			}}
			class="cursor-pointer"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
				<polyline points="16 17 21 12 16 7" />
				<line x1="21" y1="12" x2="9" y2="12" />
			</svg>
			Abmelden
		</DropdownMenuItem>
	</DropdownMenuContent>
</DropdownMenu>
