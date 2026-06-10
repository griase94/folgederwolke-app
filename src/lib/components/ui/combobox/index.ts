import Combobox from "./combobox.svelte";

export {
  Combobox,
  //
  Combobox as Root,
};

export type ComboboxOption = { value: string; label: string };

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string[]; // selected (single = length 0/1)
  onValueChange: (v: string[]) => void;
  multiple?: boolean; // default false
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  class?: string;
}
