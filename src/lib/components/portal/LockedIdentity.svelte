<!--
	LockedIdentity — the confirmed-identity block of the member portal
	(Aurora A-flow S2b, plate `.locked-identity`).

	A member never re-types who they are: the identity comes from the session's
	Mitglied row, so this reads as a CONFIRMATION, not a form. Deliberately NOT
	disabled inputs — "editable but tedious" is forbidden (ANDY-LENS §2); the one
	way to change these values is the Profil link.

	The rows compose `ui/facts-table` so the label ruler matches every other
	Facts surface in the app.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import FactsTable, { type FactRow } from '$lib/components/ui/facts-table/FactsTable.svelte';
	import Lock from '@lucide/svelte/icons/lock';
	import Pencil from '@lucide/svelte/icons/pencil';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	export interface LockedIdentityProps {
		vorname: string;
		nachname: string;
		email: string | null;
		/** Where "Profil" goes. Omit to hide the link entirely. */
		profilHref?: string | null;
		/**
		 * Render the confirming sentence above the block ("Du reichst als … ein").
		 * Off on surfaces that already say it (e.g. the Profil page itself).
		 */
		confirm?: boolean;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		vorname,
		nachname,
		email,
		profilHref = '/portal/profil',
		confirm = false,
		class: className,
		'data-testid': testId = 'locked-identity'
	}: LockedIdentityProps = $props();

	const fullName = $derived(`${vorname} ${nachname}`.trim());
	const rows = $derived<FactRow[]>([
		{ label: 'Name', value: fullName },
		{ label: 'E-Mail', value: email ?? '—' }
	]);
</script>

{#if confirm}
	<p class="mb-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-500">
		<ShieldCheck class="mt-0.5 size-4 shrink-0 text-type-einnahme" aria-hidden="true" />
		<span>
			Du reichst als <b class="font-bold text-ink-900">{fullName}</b> ein{#if email}
				— deine Bestätigung geht an {email}{/if}.
		</span>
	</p>
{/if}

<div
	class={cn('rounded-[16px] border border-hairline bg-secondary px-4 pb-1', className)}
	data-testid={testId}
	data-slot="locked-identity"
>
	<div class="flex items-center gap-2 border-b border-hairline py-3">
		<span class="flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
			<Lock class="size-4" aria-hidden="true" />
			Deine Daten
		</span>
		{#if profilHref}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- caller-supplied in-app portal route -->
			<a
				href={profilHref}
				class="ml-auto inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-semibold text-primary-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				data-testid="locked-identity-profil"
			>
				<Pencil class="size-3.5" aria-hidden="true" />
				Profil
			</a>
		{/if}
	</div>

	<FactsTable {rows} labelWidth="76px" data-testid="locked-identity-facts" />
</div>
