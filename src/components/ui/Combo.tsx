import * as React from "react";
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
    <BaseCombobox items={options} onValueChange={(value) => setValue(value ?? "")} value={value}>
      <div className="relative inline-flex w-full items-center gap-1 border border-input bg-background px-2 py-1 text-sm rounded-md">
        <ComboboxInput
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder ?? "combobox"}
        />
        <ComboboxTrigger className="static -translate-y-0" />
      </div>
      <ComboboxPortal>
        <ComboboxPositioner>
          <ComboboxPopup className="min-w-[200px]">
            <ComboboxEmpty className="px-3 py-2 text-xs text-muted-foreground">
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