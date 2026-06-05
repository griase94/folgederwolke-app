<!--
  SpendeDetailFields — the editable detail fields for a Spende (spec §10 + §9).

  Rendered inside DetailModalShell's right column. It owns the `#detail-form`
  (the shell's Speichern button targets `form="detail-form"`), posting the same
  snake_case fields editSpende validates: Spendenart, Zweckbindung (+ required
  Text when zweckgebunden), Betrag, Zuwendungsdatum, Spender. The Kategorie is
  DERIVED server-side (editSpende re-derives it) — no Kategorie picker here.

  For a Sachspende it ALSO shows a READ-ONLY Wertermittlung block (gemeiner Wert
  / Methode / Zustand) — these are not re-edited inline in v1 (a value change is
  a Storno+Neu concern); the create form is the authoring surface. The hidden
  inputs carry the current Sachspende values so the editSpende validation (which
  requires them for a Sachspende) still passes on a Zweckbindung edit.

  Spendenart is READ-ONLY here: it is FIXED at the row's actual kind (a
  Geld↔Sach switch is a Storno-class change, not an inline edit). Making it
  mutable was a save dead-end — toggling Geldspende→Sachspende revealed only the
  READ-ONLY Wertermittlung block with EMPTY hidden carry-forwards, which
  editSpende's superRefine rejects (422) with no editable inputs to fix it. The
  fixed chip keeps `isSach` aligned with the row, so the hidden carry-forwards
  always mirror real persisted values.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { applyAction, enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import DateField from "$lib/components/ui/date-field/DateField.svelte";
  import type { TransactionDetail } from "$lib/server/domain/transactions.js";

  interface Props {
    detail: TransactionDetail;
    errors?: Record<string, string[]>;
    onDirty?: () => void;
    /** Bubbled so the page can feed the shell's `saving` flag during a ?/save. */
    onSaving?: (v: boolean) => void;
  }

  let { detail, errors = {}, onDirty, onSaving }: Props = $props();

  type SpendeKind = "geldspende" | "sachspende";
  type ZweckbindungKind = "zweckfrei" | "zweckgebunden";

  // Spendenart is FIXED to the row's actual kind (read-only chip — see header).
  const spendeKind: SpendeKind = untrack(() =>
    detail.spendeKind === "sachspende" ? "sachspende" : "geldspende",
  );
  const isSach = $derived(spendeKind === "sachspende");
  const spendeArtLabel = $derived(isSach ? "Sachspende" : "Geldspende");

  // Initial snapshot from the loaded detail — the form fields seed ONCE (a
  // detail modal does not hot-swap its row), so we read the props untracked to
  // make the initial-value intent explicit (no reactivity-capture warning).
  const initialZweckbindung: ZweckbindungKind = untrack(() =>
    detail.zweckbindungKind === "zweckgebunden" ? "zweckgebunden" : "zweckfrei",
  );
  const initialZugewendet = untrack(() =>
    detail.gebuchtAm ? detail.gebuchtAm.slice(0, 10) : "",
  );

  let zweckbindungKind = $state<ZweckbindungKind>(initialZweckbindung);
  let zugewendetAm = $state(initialZugewendet);

  const ZWECKBINDUNGEN: readonly [ZweckbindungKind, string][] = [
    ["zweckfrei", "Zweckfrei"],
    ["zweckgebunden", "Zweckgebunden"],
  ];

  const isZweckgebunden = $derived(zweckbindungKind === "zweckgebunden");

  function markDirty() {
    onDirty?.();
  }
  function err(key: string): string | null {
    return errors[key]?.[0] ?? null;
  }

  // T4 (review): enhance the ?/save so a failed editSpende (422 superRefine, 409
  // festgeschrieben/bescheinigt, …) surfaces a toast in the modal instead of
  // silently replacing the page. The page's inline `form.error` banner +
  // per-field `errors` still render via applyAction's `form` update.
  const saveSubmit = () => {
    onSaving?.(true);
    return async ({
      result,
    }: {
      result: import("@sveltejs/kit").ActionResult;
    }) => {
      onSaving?.(false);
      if (result.type === "failure") {
        const err = (result.data as { error?: string } | undefined)?.error;
        toast.error(err ?? "Fehler beim Speichern");
      }
      await applyAction(result);
    };
  };

  const methodeLabel: Record<string, string> = {
    marktpreis: "Marktpreis",
    kaufbeleg: "Kaufbeleg",
    schaetzung: "Schätzung",
    buchwert: "Buchwert",
  };
</script>

<form
  id="detail-form"
  method="POST"
  action="?/save"
  class="flex flex-col gap-5"
  use:enhance={saveSubmit}
>
  <input type="hidden" name="id" value={detail.id} />
  <!-- Member-vs-extern: the detail edit keeps the existing Spender identity
	     (no re-pick in v1) — carry it forward so editSpende validation passes. -->
  <input
    type="hidden"
    name="member_id"
    value={detail.bezahltVonMemberId ?? ""}
  />

  <!-- Spendenart — READ-ONLY chip. A Geld↔Sach switch is a Storno-class change,
	     not an inline edit (it would otherwise be an unfixable 422 dead end). -->
  <div>
    <p class="text-foreground mb-1.5 block text-sm font-medium">Spendenart</p>
    <span
      class="border-border bg-muted/50 text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium"
      data-testid="detail-spendeart-chip"
    >
      {spendeArtLabel}
    </span>
    <input type="hidden" name="spende_kind" value={spendeKind} />
  </div>

  <!-- Zweckbindung -->
  <fieldset>
    <legend class="text-foreground mb-1.5 block text-sm font-medium"
      >Zweckbindung</legend
    >
    <div class="flex flex-wrap gap-2">
      {#each ZWECKBINDUNGEN as [k, l] (k)}
        <button
          type="button"
          onclick={() => {
            zweckbindungKind = k;
            markDirty();
          }}
          class={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            zweckbindungKind === k
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          ].join(" ")}
          data-testid={`detail-zweckbindung-${k}`}
        >
          {l}
        </button>
      {/each}
    </div>
    <input type="hidden" name="zweckbindung_kind" value={zweckbindungKind} />
    {#if isZweckgebunden}
      <div class="mt-2 space-y-1">
        <label
          for="detail-zweckbindung-text"
          class="text-foreground block text-sm font-medium"
        >
          Zweckbindungs-Text <span class="text-red-500" aria-hidden="true"
            >*</span
          >
        </label>
        <input
          id="detail-zweckbindung-text"
          name="zweckbindung_text"
          type="text"
          value={detail.zweckbindungText ?? ""}
          oninput={markDirty}
          required
          class="border-border bg-background focus:ring-primary w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        {#if err("zweckbindung_text")}
          <p class="text-xs text-red-600">{err("zweckbindung_text")}</p>
        {/if}
      </div>
    {/if}
  </fieldset>

  <!-- Betrag -->
  <div>
    <label
      for="detail-betrag"
      class="text-foreground mb-1 block text-sm font-medium"
    >
      {isSach ? "Gemeiner Wert (€, § 9 BewG)" : "Betrag (€)"}
    </label>
    <div class="relative">
      <span
        class="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm"
        >€</span
      >
      <input
        id="detail-betrag"
        type="number"
        step="0.01"
        min="0.01"
        value={detail.betragCents / 100}
        oninput={(e) => {
          const val = parseFloat((e.target as HTMLInputElement).value) || 0;
          const hidden = document.querySelector<HTMLInputElement>(
            '#detail-form input[name="betragCents"]',
          );
          if (hidden) hidden.value = String(Math.round(val * 100));
          markDirty();
        }}
        class="border-border bg-background focus:ring-primary w-full rounded-md border py-2 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
      />
      <input type="hidden" name="betragCents" value={detail.betragCents} />
    </div>
  </div>

  <!-- Zuwendungsdatum -->
  <div class="space-y-1.5">
    <label
      for="detail-zugewendet"
      class="text-foreground block text-sm font-medium"
    >
      Zuwendungsdatum
    </label>
    <DateField
      id="detail-zugewendet"
      name="zugewendet_am"
      value={zugewendetAm}
      onchange={(iso) => {
        zugewendetAm = iso;
        markDirty();
      }}
    />
  </div>

  <!-- Spender (display + edit of free-text identity for extern) -->
  <fieldset class="space-y-2">
    <legend class="text-foreground mb-1.5 block text-sm font-medium"
      >Spender</legend
    >
    <input
      name="spender_name"
      type="text"
      placeholder="Name"
      value={detail.spenderName ?? ""}
      oninput={markDirty}
      class="border-border bg-background focus:ring-primary w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
    />
    <input
      name="spender_adresse"
      type="text"
      placeholder="Adresse"
      value={detail.spenderAdresse ?? ""}
      oninput={markDirty}
      class="border-border bg-background focus:ring-primary w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
    />
    <input
      name="spender_email"
      type="email"
      placeholder="E-Mail (optional)"
      value={detail.spenderEmail ?? ""}
      oninput={markDirty}
      class="border-border bg-background focus:ring-primary w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
    />
  </fieldset>

  <!-- Sachspende: READ-ONLY Wertermittlung view + hidden carry-forward inputs. -->
  {#if isSach}
    <section
      class="border-border bg-muted/30 space-y-2 rounded-md border p-3 text-sm"
      data-testid="detail-sachspende-wertermittlung"
    >
      <h3 class="text-foreground text-sm font-medium">
        Sachspende — Wertermittlung
      </h3>
      <dl
        class="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1"
      >
        <dt>Methode</dt>
        <dd class="text-foreground">
          {detail.wertermittlungMethode
            ? (methodeLabel[detail.wertermittlungMethode] ??
              detail.wertermittlungMethode)
            : "–"}
        </dd>
        <dt>Zustand</dt>
        <dd class="text-foreground">{detail.zustandBeschreibung ?? "–"}</dd>
        {#if detail.betriebsvermoegen}
          <dt>Herkunft</dt>
          <dd class="text-foreground">aus Betriebsvermögen</dd>
        {/if}
      </dl>
    </section>
    <!-- Carry the current Sachspende facts so editSpende's required-field
		     validation passes on a non-Wertermittlung edit (e.g. Zweckbindung). -->
    <input
      type="hidden"
      name="wertermittlung_methode"
      value={detail.wertermittlungMethode ?? ""}
    />
    <input
      type="hidden"
      name="zustand_beschreibung"
      value={detail.zustandBeschreibung ?? ""}
    />
    <input
      type="hidden"
      name="betriebsvermoegen"
      value={detail.betriebsvermoegen ? "true" : ""}
    />
  {/if}
</form>
