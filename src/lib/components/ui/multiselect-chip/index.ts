import MultiselectChip from "./multiselect-chip.svelte";

export {
  MultiselectChip,
  //
  MultiselectChip as Root,
};

export interface MultiselectChipProps {
  label: string;
  value: string;
  onRemove: () => void;
}
