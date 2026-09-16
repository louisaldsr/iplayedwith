'use client'

type Suggestion = { id: string; name: string }

/**
 * Upper bound on rendered suggestions.
 *
 * The API already caps typeahead results at 20; this guards against a caller passing a
 * longer list, which previously meant mounting thousands of <li> on a single keystroke.
 */
const MAX_RENDERED = 20

type Props = {
  value: string
  onChange: (v: string) => void
  onSelect: (name: string) => void
  suggestions: Suggestion[]
  placeholder: string
  autoFocus?: boolean
  minChars?: number
  dropdownDirection?: 'up' | 'down'
  loading?: boolean
  emptyLabel?: string
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
  loading = false,
  emptyLabel,
}: Props) {
  const querying = value.trim().length >= minChars
  const visible = suggestions.slice(0, MAX_RENDERED)
  const showEmpty = querying && !loading && visible.length === 0 && !!emptyLabel
  const showDropdown = querying && (loading || visible.length > 0 || showEmpty)

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
          {visible.map(s => (
            <li
              key={s.id}
              className="autocomplete-item"
              onMouseDown={() => onSelect(s.name)}
            >
              {s.name}
            </li>
          ))}
          {visible.length === 0 && loading && (
            <li className="autocomplete-item autocomplete-item--status">…</li>
          )}
          {showEmpty && (
            <li className="autocomplete-item autocomplete-item--status">{emptyLabel}</li>
          )}
        </ul>
      )}
    </div>
  )
}
