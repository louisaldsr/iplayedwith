'use client'

type Suggestion = { id: string; name: string }

type Props = {
  value: string
  onChange: (v: string) => void
  onSelect: (name: string) => void
  suggestions: Suggestion[]
  placeholder: string
  autoFocus?: boolean
  minChars?: number
  dropdownDirection?: 'up' | 'down'
}

export function AutocompleteInput({
  value,
  onChange,
  onSelect,
  suggestions,
  placeholder,
  autoFocus,
  minChars = 2,
  dropdownDirection = 'up',
}: Props) {
  const showDropdown = value.length >= minChars && suggestions.length > 0

  return (
    <div className="autocomplete-wrapper">
      <input
        className="autocomplete-input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {showDropdown && (
        <ul
          className={`autocomplete-dropdown${dropdownDirection === 'down' ? ' autocomplete-dropdown--down' : ''}`}
        >
          {suggestions.map(s => (
            <li
              key={s.id}
              className="autocomplete-item"
              onMouseDown={() => onSelect(s.name)}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
