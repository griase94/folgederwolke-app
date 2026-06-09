<!--
  AufwandsspendeStubModal — placeholder for the Aufwandsspende ("Verzicht
  spenden") workflow that is DEFERRED to Phase 2 per masterplan §5.10.

  Renders a single-line "deferred" notice so the admin understands the button
  is intentionally not wired up yet. No form, no submission — pure messaging.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				Aufwandsspende
				<Badge variant="secondary">In Vorbereitung</Badge>
			</Dialog.Title>
			<Dialog.Description>
				Diese Funktion ist noch nicht verfügbar.
			</Dialog.Description>
		</Dialog.Header>
		<div class="text-sm text-muted-foreground">
			<p>
				Wir richten den Workflow gemeinsam mit dem Steuerberater ein und schalten ihn bald frei.
				Bis dahin kannst du die Auslage wie gewohnt freigeben und erstatten.
			</p>
		</div>
		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" type="button" {...props}>Verstanden</Button>
				{/snippet}
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
