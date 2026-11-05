import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { ChevronDownIcon } from "lucide-react";

export const Combobox = ComboboxPrimitive.Root;
export const ComboboxInput = ComboboxPrimitive.Input;
export const ComboboxTrigger = ComboboxPrimitive.Trigger;
export const ComboboxPortal = ComboboxPrimitive.Portal;
export const ComboboxPositioner = ComboboxPrimitive.Positioner;
export const ComboboxPopup = ComboboxPrimitive.Popup;
export const ComboboxList = ComboboxPrimitive.List;
export const ComboboxItem = ComboboxPrimitive.Item;
export const ComboboxEmpty = ComboboxPrimitive.Empty;

export function ComboboxTriggerButton(props: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger {...props}>
      <ChevronDownIcon className="h-4 w-4" />
    </ComboboxPrimitive.Trigger>
  );
}