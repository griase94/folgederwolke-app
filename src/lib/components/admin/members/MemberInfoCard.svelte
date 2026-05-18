<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import EditMemberDialog from './EditMemberDialog.svelte';
	import type { MemberView } from '$lib/domain/members.js';

	// We receive a subset matching MemberView; EditMemberDialog wants MemberView
	// (beitrags not needed here — pass an empty record).
	let {
		member
	}: {
		member: {
			id: string;
			vorname: string;
			nachname: string;
			email: string | null;
			iban: string | null;
			role: string;
			eintrittsDatum: string | null;
			austrittsDatum: string | null;
			isFixture: boolean;
			createdAt: string;
		};
	} = $props();

	let editOpen = $state(false);

	// Cast to MemberView for EditMemberDialog (beitrags field is unused there)
	const memberView = $derived<MemberView>({
		...member,
		beitrags: {}
	});

	function roleLabel(role: string): string {
		const map: Record<string, string> = {
			mitglied: 'Mitglied',
			vorstand: 'Vorstand',
			kassenwart: 'Kassenwart',
			schriftfuehrer: 'Schriftführer',
			'fördermitglied': 'Fördermitglied'
		};
		return map[role] ?? role;
	}

	// Deterministic avatar color from name hash
	function nameHash(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
		}
		return Math.abs(h);
	}

	const avatarColors = [
		'bg-rose-200 text-rose-800',
		'bg-pink-200 text-pink-800',
		'bg-fuchsia-200 text-fuchsia-800',
		'bg-purple-200 text-purple-800',
		'bg-violet-200 text-violet-800',
		'bg-indigo-200 text-indigo-800',
		'bg-sky-200 text-sky-800',
		'bg-teal-200 text-teal-800',
		'bg-emerald-200 text-emerald-800',
		'bg-amber-200 text-amber-800'
	];

	const avatarColor = $derived(
		avatarColors[nameHash(member.vorname + member.nachname) % avatarColors.length] ??
			avatarColors[0]!
	);
	const initials = $derived(
		(member.vorname.charAt(0) ?? '') + (member.nachname.charAt(0) ?? '')
	);

	function formatDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	const isActive = $derived(!member.austrittsDatum);
</script>

<Card.Root class="overflow-hidden">
	<!-- Card top band matching brand gradient -->
	<div class="h-2 bg-gradient-to-r from-pink-400 to-rose-500"></div>

	<Card.Content class="p-6">
		<!-- Avatar + name row -->
		<div class="mb-6 flex items-start gap-4">
			<div
				class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold shadow-sm {avatarColor}"
				aria-hidden="true"
			>
				{initials.toUpperCase()}
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-xl font-bold text-foreground">
					{member.vorname}
					{member.nachname}
				</h2>
				<div class="mt-1 flex flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium
						{isActive
							? 'border-green-200 bg-green-100 text-green-800'
							: 'border-red-200 bg-red-100 text-red-700'}"
					>
						{isActive ? 'aktiv' : 'ausgetreten'}
					</span>
					<span
						class="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
					>
						{roleLabel(member.role)}
					</span>
					{#if member.isFixture}
						<span
							class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
						>
							Fixture
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Contact + metadata fields -->
		<dl class="space-y-3">
			<!-- Email -->
			<div class="flex items-start gap-3">
				<dt class="flex w-32 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
					E-Mail
				</dt>
				<dd class="min-w-0 flex-1 break-all text-sm font-medium text-foreground">
					{#if member.email}
						<a href="mailto:{member.email}" class="hover:text-primary hover:underline">
							{member.email}
						</a>
					{:else}
						<span class="text-muted-foreground">—</span>
					{/if}
				</dd>
			</div>

			<!-- IBAN -->
			<div class="flex items-start gap-3">
				<dt class="flex w-32 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
						/>
					</svg>
					IBAN
				</dt>
				<dd class="min-w-0 flex-1 font-mono text-sm text-foreground">
					{#if member.iban}
						{member.iban
							.replace(/\s+/g, '')
							.toUpperCase()
							.replace(/(.{4})/g, '$1 ')
							.trim()}
					{:else}
						<span class="font-sans text-muted-foreground">—</span>
					{/if}
				</dd>
			</div>

			<!-- Eintrittsdatum -->
			<div class="flex items-start gap-3">
				<dt class="flex w-32 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
						/>
					</svg>
					Eintritt
				</dt>
				<dd class="text-sm text-foreground">
					{formatDate(member.eintrittsDatum)}
				</dd>
			</div>

			<!-- Austrittsdatum (only if set) -->
			{#if member.austrittsDatum}
				<div class="flex items-start gap-3">
					<dt class="flex w-32 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
						<svg
							class="h-4 w-4 text-destructive"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
							/>
						</svg>
						Austritt
					</dt>
					<dd class="text-sm font-medium text-destructive">
						{formatDate(member.austrittsDatum)}
					</dd>
				</div>
			{/if}

			<!-- Mitglied seit -->
			<div class="flex items-start gap-3">
				<dt class="flex w-32 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					Angelegt
				</dt>
				<dd class="text-sm text-muted-foreground">
					{formatDate(member.createdAt)}
				</dd>
			</div>
		</dl>

		<!-- Edit CTA -->
		<div class="mt-6 border-t border-border pt-4">
			<Button
				variant="outline"
				class="w-full"
				onclick={() => (editOpen = true)}
				aria-label="Mitglied bearbeiten"
			>
				<svg
					class="mr-2 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
					/>
				</svg>
				Bearbeiten
			</Button>
		</div>
	</Card.Content>
</Card.Root>

<EditMemberDialog bind:open={editOpen} member={memberView} />
