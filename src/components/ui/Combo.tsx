import { Combobox as BaseCombobox,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxList,
  ComboboxEmpty,
  ComboboxItem,
} from "./Combobox";
import * as React from "react";

export default function Combo({
  value,
  setValue,
  options,
  placeholder,
  disabled,
  ariaLabel,
}: {
  value: string;
  setValue: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}): React.ReactElement {
  return (
    <BaseCombobox items={options} onValueChange={(val: unknown) => setValue(String(val ?? ""))} value={value}>
      <div className="relative inline-flex w-full items-center rounded-lg border border-input bg-background px-2 py-1 text-base text-foreground shadow-xs/5">
        <ComboboxInput
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder ?? "combobox"}
          className="border-0 bg-transparent p-0 shadow-none focus:ring-0 sm:text-sm"
        />
        <ComboboxTrigger className="h-6 w-6 p-1" />
      </div>
      <ComboboxPortal>
        <ComboboxPositioner>
          <ComboboxPopup className="min-w-[220px] rounded-md border border-gray-300 bg-white py-1 shadow-lg">
            <ComboboxEmpty className="px-3 py-2 text-xs text-gray-500">
              No matches.
            </ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxPopup>
        </ComboboxPositioner>
      </ComboboxPortal>
    </BaseCombobox>
  );
}