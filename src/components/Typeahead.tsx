import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  setValue: (value: string) => void
  options: string[]
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  allowCustom?: boolean
  className?: string
}

export default function Typeahead({ value, setValue, options, placeholder, disabled, ariaLabel, allowCustom = true, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const term = value.trim().toLowerCase()
  const filtered = term === ''
    ? options.slice(0, 40)
    : options.filter(option => option.toLowerCase().includes(term)).slice(0, 40)

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!boxRef.current) return
      if (!boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function choose(option: string) {
    setValue(option)
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === 'ArrowDown') setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight(index => Math.min(index + 1, Math.max(0, filtered.length - 1)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight(index => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const choice = filtered[highlight] ?? (allowCustom ? value : null)
      if (choice) choose(choice)
    } else if (event.key === 'Escape') {
      setOpen(false)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} className={`typeahead ${className}`}>
      <input
        ref={inputRef}
        className="typeahead-input"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder ?? 'typeahead'}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={event => { setValue(event.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {value && !disabled && (
        <button type="button" className="typeahead-clear" aria-label="Clear" onClick={() => setValue('')}>×</button>
      )}
      {open && filtered.length > 0 && (
        <ul role="listbox" className="typeahead-list">
          {filtered.map((option, index) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={highlight === index}
                className={`typeahead-option${highlight === index ? ' is-highlighted' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={event => { event.preventDefault(); choose(option) }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
