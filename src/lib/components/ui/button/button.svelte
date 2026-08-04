<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 active:not-aria-[haspopup]:translate-y-px active:scale-[0.98] aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap touch-manipulation transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default: "bg-primary-strong text-primary-foreground [a]:hover:bg-primary-strong/85",
				outline: "border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground",
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost: "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground",
				destructive: "bg-destructive/10 hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 text-destructive focus-visible:border-destructive/40 dark:hover:bg-destructive/30",
				link: "text-primary-text underline-offset-4 hover:underline",
			},
			size: {
				default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				// The ONE page-level CTA geometry (DESIGN-GUIDELINES §2.1): page /
				// takeover forms, public + error screens. Touch-safe on mobile,
				// desktop-tight at md. Never rebuild this as a class chain.
				// `md:min-h-10` is load-bearing, not decoration: `min-h-11` has no
				// md variant of its own, so a 44px min-height outranked `md:h-10`
				// and every CTA in the app rendered 44px at desktop — 4px taller
				// than the 40px controls it stands next to.
				cta: "h-11 min-h-11 gap-2 rounded-[10px] px-5 font-semibold md:h-10 md:min-h-10",
				icon: "size-8",
				"icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
				"icon-lg": "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			/**
			 * Submit in flight: spinner + disabled + aria-busy, from one place
			 * (DESIGN-GUIDELINES §2.1 — never copy the animate-spin SVG).
			 */
			loading?: boolean;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		loading = false,
		children,
		...restProps
	}: ButtonProps = $props();

	// A loading button is never clickable twice.
	const isDisabled = $derived(disabled || loading);
</script>

{#snippet spinner()}
	<LoaderCircle class="animate-spin" aria-hidden="true" />
{/snippet}

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={isDisabled ? undefined : href}
		aria-disabled={isDisabled}
		aria-busy={loading ? "true" : undefined}
		role={isDisabled ? "link" : undefined}
		tabindex={isDisabled ? -1 : undefined}
		{...restProps}
	>
		{#if loading}{@render spinner()}{/if}
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		disabled={isDisabled}
		aria-busy={loading ? "true" : undefined}
		{...restProps}
	>
		{#if loading}{@render spinner()}{/if}
		{@render children?.()}
	</button>
{/if}
