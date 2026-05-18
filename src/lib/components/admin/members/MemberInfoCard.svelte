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
			telefon: string | null;
			adresse: string | null;
			dateOfBirth: string | null;
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

	// -200 bg / -800 text can be borderline 4:1 (WCAG AA); bump to -100/-900 to clear it cleanly.
	const avatarColors = [
		'bg-rose-100 text-rose-900',
		'bg-pink-100 text-pink-900',
		'bg-fuchsia-100 text-fuchsia-900',
		'bg-purple-100 text-purple-900',
		'bg-violet-100 text-violet-900',
		'bg-indigo-100 text-indigo-900',
		'bg-sky-100 text-sky-900',
		'bg-teal-100 text-teal-900',
		'bg-emerald-100 text-emerald-900',
		'bg-amber-100 text-amber-900'
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

			<!-- Telefon -->
			{#if member.telefon}
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
								d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
							/>
						</svg>
						Telefon
					</dt>
					<dd class="min-w-0 flex-1 text-sm text-foreground">
						<a href="tel:{member.telefon}" class="hover:text-primary hover:underline">
							{member.telefon}
						</a>
					</dd>
				</div>
			{/if}

			<!-- Adresse -->
			{#if member.adresse}
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
								d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
						Adresse
					</dt>
					<dd class="min-w-0 flex-1 whitespace-pre-wrap text-sm text-foreground">
						{member.adresse}
					</dd>
				</div>
			{/if}

			<!-- Geburtsdatum -->
			{#if member.dateOfBirth}
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
								d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.701 2.701 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6l3-3 3 3M12 3v12"
							/>
						</svg>
						Geburtsdatum
					</dt>
					<dd class="text-sm text-foreground">
						{formatDate(member.dateOfBirth)}
					</dd>
				</div>
			{/if}

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
