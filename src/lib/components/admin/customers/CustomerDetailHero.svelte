<script lang="ts">
	type Customer = { id: string; name: string };
	let { customer }: { customer: Customer } = $props();
</script>

<header
	data-component="customer-detail-hero"
	class="mb-6 rounded-xl border border-border bg-card p-6 shadow-sm dark:border-border/60 dark:bg-card/40"
>
	<p class="text-xs uppercase tracking-wide text-muted-foreground">{customer.id.slice(0, 8)}</p>
	<h1 class="text-3xl font-semibold lg:text-4xl">{customer.name}</h1>
</header>
