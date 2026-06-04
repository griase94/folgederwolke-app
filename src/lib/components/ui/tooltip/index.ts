import { Tooltip as TooltipPrimitive } from "bits-ui";
import Content from "./tooltip-content.svelte";

const Root = TooltipPrimitive.Root;
const Trigger = TooltipPrimitive.Trigger;
const Provider = TooltipPrimitive.Provider;
const Portal = TooltipPrimitive.Portal;
const Arrow = TooltipPrimitive.Arrow;

export {
  Root,
  Trigger,
  Provider,
  Portal,
  Arrow,
  Content,
  //
  Root as Tooltip,
  Trigger as TooltipTrigger,
  Provider as TooltipProvider,
  Portal as TooltipPortal,
  Arrow as TooltipArrow,
  Content as TooltipContent,
};
