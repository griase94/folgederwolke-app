<!--
  MemberAvatar — the ONE member identity avatar (L4 / DESIGN-DEBT-REGISTER).
  Deterministic colour + initials from `domain/member-avatar`, rendered at one of
  three sizes so the list row, the mobile card and the detail hero share one
  algorithm instead of three copies.
    - sm → list row (40px)
    - md → mobile card (44px touch target)
    - lg → detail hero (64px, rounded-2xl)
  Always aria-hidden: the name is announced by the surrounding link/heading.
-->
<script lang="ts">
	import { avatarColorClass, avatarInitials } from '$lib/domain/member-avatar.js';

	let {
		vorname,
		nachname,
		size = 'sm',
	}: {
		vorname: string;
		nachname: string;
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	const sizeClass = {
		sm: 'h-10 w-10 rounded-full text-sm font-semibold',
		md: 'h-11 w-11 rounded-full text-sm font-semibold',
		lg: 'h-16 w-16 rounded-2xl text-xl font-bold shadow-sm',
	} as const;
</script>

<div
	class="flex shrink-0 items-center justify-center {sizeClass[size]} {avatarColorClass(
		vorname,
		nachname,
	)}"
	aria-hidden="true"
>
	{avatarInitials(vorname, nachname)}
</div>
