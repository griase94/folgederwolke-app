<!--
  SpendeDetailFields — the editable detail fields for a Spende (spec §10 + §9).

  Rendered inside TransactionDetailView's `fields` slot. It owns `#detail-form`
  (the shell's dock-foot Speichern targets `form="detail-form"`), posting the
  same snake_case fields editSpende validates: Spendenart, Zweckbindung (+
  required Text when zweckgebunden), Betrag, Zuwendungsdatum, Spender. The
  Kategorie is DERIVED server-side (editSpende re-derives it) — no Kategorie
  picker here.

  B3 M3: the edit mode wears the B2 Erfassen-Gerüst — the Betrag+Zuwendungsdatum
  HERO pair (violet, + prefix), a type-caption, the read-only LockedSphereField,
  a neutral segmented Zweckbindung toggle, and consistent required asterisks.

  Spendenart is READ-ONLY here: a Geld↔Sach switch is a Storno-class change, not
  an inline edit (mutating it was a 422 dead end — the hidden Wertermittlung
  carry-forwards would be empty). For a Sachspende it ALSO shows a READ-ONLY
  Wertermittlung block; the hidden inputs carry the current values so editSpende's
  required-field validation still passes on a Zweckbindung-only edit.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { applyAction, enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import {
    AmountField,
    DateField as HeroDateField,
  } from "$lib/components/ui/hero-field/index.js";
  import LockedSphereField from "$lib/components/admin/transactions/fields/LockedSphereField.svelte";
  import { FIELD_CLASS } from "$lib/components/admin/transactions/fields/field-class.js";
  import type { Sphere } from "$lib/domain/sphere.js";
  import type { TransactionDetail } from "$lib/server/domain/transactions.js";

  interface Props {
    detail: TransactionDetail;
    errors?: Record<string, string[]>;
    onDirty?: () => void;
    /** Bubbled so the page can feed the shell's `saving` flag during a ?/save. */
    onSaving?: (v: boolean) => void;
    /** Fired on a successful ?/save so the page can reset `dirty` + drop to read. */
    onSaved?: () => void;
  }

  let { detail, errors = {}, onDirty, onSaving, onSaved }: Props = $props();

  type SpendeKind = "geldspende" | "sachspende";
  type ZweckbindungKind = "zweckfrei" | "zweckgebunden";

  // Spendenart is FIXED to the row's actual kind (read-only chip — see header).
  const spendeKind: SpendeKind = untrack(() =>
    detail.spendeKind === "sachspende" ? "sachspende" : "geldspende",
  );
  const isSach = $derived(spendeKind === "sachspende");
  const spendeArtLabel = $derived(isSach ? "Sachspende" : "Geldspende");

  // Initial snapshot from the loaded detail — the form fields seed ONCE.
  const initialZweckbindung: ZweckbindungKind = untrack(() =>
    detail.zweckbindungKind === "zweckgebunden" ? "zweckgebunden" : "zweckfrei",
  );
  const initialZugewendet = untrack(() =>
    detail.gebuchtAm ? detail.gebuchtAm.slice(0, 10) : "",
  );

  let zweckbindungKind = $state<ZweckbindungKind>(initialZweckbindung);
  let zugewendetAm = $state(initialZugewendet);

  // Betrag hero seed: de-DE display string (comma decimal, ADR-0003). The
  // AmountField owns the hidden name=betragCents integer-cents mirror.
  const betragSeed = untrack(() =>
    (detail.betragCents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );

  // The persisted sphere, shown read-only (Spenden derive their sphere from the
  // Spendenart server-side; this is context, never a chooser).
  // svelte-ignore state_referenced_locally
  const sphereEffective = detail.sphereEffective as Sphere;

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

  const saveSubmit = () => {
    onSaving?.(true);
    return async ({
      result,
    }: {
      result: import("@sveltejs/kit").ActionResult;
    }) => {
      onSaving?.(false);
      if (result.type === "success") {
        toast.success("Änderungen gespeichert");
        onSaved?.();
      } else if (result.type === "failure") {
        const e = (result.data as { error?: string } | undefined)?.error;
        toast.error(e ?? "Fehler beim Speichern");
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
  class="flex flex-col gap-4"
  oninput={markDirty}
  onchange={markDirty}
  use:enhance={saveSubmit}
>
  <input type="hidden" name="id" value={detail.id} />
  <!-- Member-vs-extern: the detail edit keeps the existing Spender identity
       (no re-pick in v1) — carry it forward so editSpende validation passes. -->
  <input type="hidden" name="member_id" value={detail.bezahltVonMemberId ?? ""} />

  <!-- Betrag-Hero + Zuwendungsdatum-Hero (identical anatomy; side-by-side). -->
  <div>
    <div class="grid grid-cols-2 gap-2 sm:gap-3">
      <div class="flex flex-col gap-1.5">
        <label for="detail-betrag" class="text-sm font-medium text-ink-900">
          {isSach ? "Gemeiner Wert (§ 9 BewG)" : "Betrag"}
          <span class="text-severity-critical" aria-hidden="true">*</span>
        </label>
        <AmountField
          id="detail-betrag"
          name="betragCents"
          value={betragSeed}
          type="spende"
          sign="plus"
          required
          onchange={() => markDirty()}
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="detail-zugewendet" class="text-sm font-medium text-ink-900">
          Zuwendungsdatum
          <span class="text-severity-critical" aria-hidden="true">*</span>
        </label>
        <HeroDateField
          id="detail-zugewendet"
          name="zugewendet_am"
          value={zugewendetAm}
          required
          onchange={(iso) => {
            zugewendetAm = iso;
            markDirty();
          }}
        />
      </div>
    </div>
    <p class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
      <span class="size-1.5 rounded-full bg-type-spende" aria-hidden="true"
      ></span>
      Wird als <b class="font-semibold text-ink-700">Spende</b> mit Plus gebucht.
    </p>
  </div>

  <!-- Spendenart — READ-ONLY chip. A Geld↔Sach switch is a Storno-class change. -->
  <div class="flex flex-col gap-1.5">
    <span class="text-sm font-medium text-ink-900">Spendenart</span>
    <span
      class="inline-flex w-fit items-center rounded-full border border-hairline bg-secondary px-2.5 py-1 text-sm font-medium text-ink-700"
      data-testid="detail-spendeart-chip"
    >
      {spendeArtLabel}
    </span>
    <input type="hidden" name="spende_kind" value={spendeKind} />
  </div>

  <!-- Sphäre — read-only context (derived from the Spendenart server-side). -->
  <LockedSphereField
    sphere={sphereEffective}
    hint="Spenden gehören in den ideellen Bereich — nicht direkt wählbar."
  />

  <!-- Zweckbindung — neutral segmented toggle (never brand pink). -->
  <fieldset class="flex flex-col gap-1.5">
    <legend class="text-sm font-medium text-ink-900">Zweckbindung</legend>
    <div
      class="flex gap-1 rounded-[10px] border border-hairline bg-secondary p-1"
      role="radiogroup"
      aria-label="Zweckbindung"
    >
      {#each ZWECKBINDUNGEN as [k, l] (k)}
        {@const on = zweckbindungKind === k}
        <button
          type="button"
          role="radio"
          aria-checked={on}
          onclick={() => {
            zweckbindungKind = k;
            markDirty();
          }}
          data-testid={`detail-zweckbindung-${k}`}
          class={[
            "inline-flex min-h-10 flex-1 items-center justify-center rounded-[7px] px-3 py-2 text-sm font-medium transition-colors",
            on
              ? "bg-card text-ink-900 shadow-sm ring-1 ring-hairline"
              : "bg-transparent text-ink-500 hover:text-ink-900",
          ].join(" ")}
        >
          {l}
        </button>
      {/each}
    </div>
    <input type="hidden" name="zweckbindung_kind" value={zweckbindungKind} />
    {#if isZweckgebunden}
      <div class="mt-1 flex flex-col gap-1.5">
        <label
          for="detail-zweckbindung-text"
          class="text-sm font-medium text-ink-900"
        >
          Zweckbindungs-Text
          <span class="text-severity-critical" aria-hidden="true">*</span>
        </label>
        <input
          id="detail-zweckbindung-text"
          name="zweckbindung_text"
          type="text"
          value={detail.zweckbindungText ?? ""}
          required
          class={FIELD_CLASS}
        />
        {#if err("zweckbindung_text")}
          <p class="text-xs text-severity-critical">
            {err("zweckbindung_text")}
          </p>
        {/if}
      </div>
    {/if}
  </fieldset>

  <!-- Spender -->
  <fieldset class="flex flex-col gap-3">
    <legend class="text-sm font-medium text-ink-900">Spender:in</legend>
    <div class="flex flex-col gap-1.5">
      <label for="detail-spender-name" class="text-sm font-medium text-ink-900"
        >Name</label
      >
      <input
        id="detail-spender-name"
        name="spender_name"
        type="text"
        placeholder="Name"
        value={detail.spenderName ?? ""}
        class={FIELD_CLASS}
      />
    </div>
    <div class="flex flex-col gap-1.5">
      <label
        for="detail-spender-adresse"
        class="text-sm font-medium text-ink-900">Adresse</label
      >
      <input
        id="detail-spender-adresse"
        name="spender_adresse"
        type="text"
        placeholder="Straße, PLZ Ort"
        value={detail.spenderAdresse ?? ""}
        class={FIELD_CLASS}
      />
    </div>
    <div class="flex flex-col gap-1.5">
      <label for="detail-spender-email" class="text-sm font-medium text-ink-900">
        E-Mail <span class="text-xs font-normal text-ink-500">(optional)</span>
      </label>
      <input
        id="detail-spender-email"
        name="spender_email"
        type="email"
        placeholder="name@example.org"
        value={detail.spenderEmail ?? ""}
        class={FIELD_CLASS}
      />
    </div>
  </fieldset>

  <!-- Sachspende: READ-ONLY Wertermittlung view + hidden carry-forward inputs. -->
  {#if isSach}
    <section
      class="flex flex-col gap-2 rounded-xl border border-hairline bg-secondary/40 p-3 text-sm"
      data-testid="detail-sachspende-wertermittlung"
    >
      <h3 class="text-sm font-semibold text-ink-900">
        Sachspende — Wertermittlung
      </h3>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-500">
        <dt>Methode</dt>
        <dd class="text-ink-900">
          {detail.wertermittlungMethode
            ? (methodeLabel[detail.wertermittlungMethode] ??
              detail.wertermittlungMethode)
            : "–"}
        </dd>
        <dt>Zustand</dt>
        <dd class="text-ink-900">{detail.zustandBeschreibung ?? "–"}</dd>
        {#if detail.betriebsvermoegen}
          <dt>Herkunft</dt>
          <dd class="text-ink-900">aus Betriebsvermögen</dd>
        {/if}
      </dl>
    </section>
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
