'use client'

/**
 * A suggestion row. `hint` is the secondary label shown next to the name — for a club
 * matched through an alias it is that alias, so typing "la roch" renders
 * "Stade Rochelais · La Rochelle" and the player can see why the row is there.
 */
export type Suggestion = { id: string; name: string; hint?: string }

/**
 * Upper bound on rendered suggestions.
 *
 * The API already caps typeahead results at 20; this guards against a caller passing a
 * longer list, which previously meant mounting thousands of <li> on a single keystroke.
 */
const MAX_RENDERED = 20

type Props<S extends Suggestion> = {
  value: string
  onChange: (v: string) => void
  /**
   * Receives the whole suggestion, not its name: with aliases the rendered label is no
   * longer a unique key, so the caller can't resolve a selection by string any more.
   */
  onSelect: (suggestion: S) => void
  suggestions: S[]
  placeholder: string
  autoFocus?: boolean
  minChars?: number
  dropdownDirection?: 'up' | 'down'
  loading?: boolean
  emptyLabel?: string
  /** Set when the search request itself failed, so "no match" is never shown for an outage. */
  failed?: boolean
  errorLabel?: string
}

export function AutocompleteInput<S extends Suggestion>({
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
  failed = false,
  errorLabel,
}: Props<S>) {
  const querying = value.trim().length >= minChars
  const visible = suggestions.slice(0, MAX_RENDERED)
  const showError = querying && !loading && failed && !!errorLabel
  const showEmpty = querying && !loading && !failed && visible.length === 0 && !!emptyLabel
  const showDropdown = querying && (loading || visible.length > 0 || showEmpty || showError)

  return (
    <div className="autocomplete-wrapper">
      <input
        className="autocomplete-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {showDropdown && (
        <ul className={`autocomplete-dropdown${dropdownDirection === 'down' ? ' autocomplete-dropdown--down' : ''}`}>
          {visible.map((s) => (
            <li key={s.id} className="autocomplete-item" onMouseDown={() => onSelect(s)}>
              {s.name}
              {s.hint && <span className="autocomplete-item__hint">{s.hint}</span>}
            </li>
          ))}
          {visible.length === 0 && loading && <li className="autocomplete-item autocomplete-item--status">…</li>}
          {showEmpty && <li className="autocomplete-item autocomplete-item--status">{emptyLabel}</li>}
          {showError && (
            <li className="autocomplete-item autocomplete-item--status autocomplete-item--error">{errorLabel}</li>
          )}
        </ul>
      )}
    </div>
  )
}
