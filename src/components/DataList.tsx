import * as React from 'react'

type Props = {
  value: string
  setValue: (value: string) => void
  options: string[]
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  id?: string
  allowCustom?: boolean
  className?: string
  inputClassName?: string
}

// A native searchable dropdown: typing filters the <datalist> suggestions in
// the browser (no reliance on framework portals/correct styling) and stays
// fully accessible. allowCustom (default on) still permits free-form values.
export default function DataList({
  value,
  setValue,
  options,
  placeholder,
  disabled,
  ariaLabel,
  id,
  className = '',
  inputClassName = '',
}: Props): React.ReactElement {
  const listId = id ?? `dl-${Math.random().toString(36).slice(2, 11)}`
  return (
    <span className={className}>
      <input
        list={listId}
        className={cn(inputClassName, 'w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-ring focus:outline-none')}
        value={value}
        onChange={event => setValue(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder ?? 'datalist-combobox'}
      />
      <datalist id={listId}>
        {options.map(option => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </span>
  )
}

function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ')
}