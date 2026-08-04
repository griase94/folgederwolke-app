/**
 * The three things a Verein books, in one place (spec §5 name canon).
 *
 * Shared by the mobile CreateSheet (⊕ tab) and the desktop CreateMenu so the
 * two entry points can never drift in label, order, destination or hue — a user
 * moving between phone and desktop meets the same three choices in the same
 * order.
 *
 * The wording is "Neu erfassen", never "Neue Transaktion".
 */
import MinusIcon from "@lucide/svelte/icons/minus";
import PlusIcon from "@lucide/svelte/icons/plus";
import HeartIcon from "@lucide/svelte/icons/heart";
import type { Component } from "svelte";

export interface CreateEntry {
  href: string;
  label: string;
  icon: Component;
  /** Tinted icon chip — the type IDENTITY hue (never a status colour). */
  chip: string;
}

/** Ausgaben lead: booking an expense is by far the most frequent entry. */
export const CREATE_ENTRIES: CreateEntry[] = [
  {
    href: "/app/ausgaben/neu",
    label: "Ausgabe",
    icon: MinusIcon,
    chip: "bg-type-ausgabe-tint text-type-ausgabe",
  },
  {
    href: "/app/einnahmen/neu",
    label: "Einnahme",
    icon: PlusIcon,
    chip: "bg-type-einnahme-tint text-type-einnahme",
  },
  {
    href: "/app/spenden/neu",
    label: "Spende",
    icon: HeartIcon,
    chip: "bg-type-spende-tint text-type-spende",
  },
];
