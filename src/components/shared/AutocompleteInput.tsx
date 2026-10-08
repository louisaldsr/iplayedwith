'use client'

import { useEffect, useId, useRef, useState } from 'react'

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

  // The highlighted row, kept by id rather than index: when new results arrive the row
  // either is still there (and stays highlighted) or is gone (and nothing is).
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeIndex = showDropdown ? visible.findIndex((s) => s.id === activeId) : -1
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (activeIndex < 0) return
    // Absent from jsdom.
    listRef.current?.children[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || visible.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      // From no highlight, Down starts on the best match and Up on the last row; both wrap.
      const next = activeIndex < 0 ? (step === 1 ? 0 : visible.length - 1) : activeIndex + step
      setActiveId(visible[(next + visible.length) % visible.length].id)
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      // Picks the row instead of submitting the form; with nothing highlighted, Enter keeps
      // submitting a name typed in full.
      e.preventDefault()
      onSelect(visible[activeIndex])
    } else if (e.key === 'Escape' && activeIndex >= 0) {
      e.preventDefault()
      setActiveId(null)
    }
  }

  return (
    <div className="autocomplete-wrapper">
      <input
        className="autocomplete-input"
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={value}
        onChange={(e) => {
          setActiveId(null)
          onChange(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {showDropdown && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className={`autocomplete-dropdown${dropdownDirection === 'down' ? ' autocomplete-dropdown--down' : ''}`}
        >
          {visible.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`autocomplete-item${i === activeIndex ? ' autocomplete-item--active' : ''}`}
              onMouseDown={() => onSelect(s)}
            >
              {s.name}
              {s.hint && <span className="autocomplete-item__hint">{s.hint}</span>}
            </li>
          ))}
          {visible.length === 0 && loading && (
            <li
              role="option"
              aria-disabled="true"
              aria-selected={false}
              className="autocomplete-item autocomplete-item--status"
            >
              …
            </li>
          )}
          {showEmpty && (
            <li
              role="option"
              aria-disabled="true"
              aria-selected={false}
              className="autocomplete-item autocomplete-item--status"
            >
              {emptyLabel}
            </li>
          )}
          {showError && (
            <li
              role="option"
              aria-disabled="true"
              aria-selected={false}
              className="autocomplete-item autocomplete-item--status autocomplete-item--error"
            >
              {errorLabel}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
