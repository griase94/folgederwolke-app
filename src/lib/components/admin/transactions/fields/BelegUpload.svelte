<script lang="ts">
	/**
	 * BelegUpload — Task 8, Phase 3. Shared Beleg field for the Ausgaben entry form.
	 *
	 * Default path: a native file input (the Beleg upload). The "Kein Beleg
	 * vorhanden" path (spec §7.2): ticking the checkbox hides the file input and
	 * reveals a *mandatory* Begründung textarea — the documented kein-Beleg flow
	 * (a missing receipt requires a written justification).
	 *
	 * The component owns only the reveal UX; the tab wires `name`s into its form so
	 * the server action sees either a file or a `keinBeleg` + `begruendung` pair.
	 */
	interface Props {
		/** form field name for the file input. */
		fileName?: string;
		/** form field name for the "kein Beleg" checkbox. */
		keinBelegName?: string;
		/** form field name for the Begründung textarea. */
		begruendungName?: string;
		accept?: string;
		/** Bound: is the kein-Beleg path active. */
		keinBeleg?: boolean;
		/** Bound: the Begründung text (kein-Beleg path). */
		begruendung?: string;
	}

	let {
		fileName = 'beleg',
		keinBelegName = 'keinBeleg',
		begruendungName = 'begruendung',
		accept = 'image/*,application/pdf',
		keinBeleg = $bindable(false),
		begruendung = $bindable(''),
	}: Props = $props();
</script>

<div class="flex flex-col gap-2" data-slot="beleg-upload">
	<!-- Required marker: a Beleg IS required (the row must satisfy Beleg OR a
	     Begründung), so the field carries the "*". When the kein-Beleg path is
	     active the requirement transfers to the Begründung (its own "*" below). -->
	<label for="beleg-file" class="text-sm font-medium text-foreground">
		Beleg<span class="text-destructive" aria-hidden="true">&nbsp;*</span>
	</label>

	<!-- Keep the input MOUNTED (disabled + hidden in the kein-Beleg path) so the
	     `for="beleg-file"` association never dangles. A disabled file input does
	     not submit, so the server's `keinBeleg`/Begründung branch is unaffected. -->
	<input
		id="beleg-file"
		type="file"
		name={fileName}
		{accept}
		disabled={keinBeleg}
		class:hidden={keinBeleg}
		class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
	/>

	<label class="flex items-center gap-2 text-sm text-foreground">
		<input
			type="checkbox"
			name={keinBelegName}
			bind:checked={keinBeleg}
			value="true"
			class="size-4 rounded border-input"
		/>
		Kein Beleg vorhanden
	</label>

	{#if keinBeleg}
		<!-- kein-Beleg path → mandatory Begründung (spec §7.2). -->
		<div class="flex flex-col gap-1.5">
			<label for="beleg-begruendung" class="text-sm font-medium text-foreground">
				Begründung<span class="text-destructive" aria-hidden="true">&nbsp;*</span>
			</label>
			<textarea
				id="beleg-begruendung"
				name={begruendungName}
				bind:value={begruendung}
				required
				rows="3"
				placeholder="Warum liegt kein Beleg vor?"
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
			></textarea>
		</div>
	{/if}
</div>
