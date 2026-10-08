'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

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

/**
 * Where typing opens a sheet over the screen: phones — the same 640px as the CSS — with a touch
 * screen, where the keyboard covers half of it. A narrow window on a computer keeps its field.
 */
const SHEET_MEDIA = '(max-width: 640px) and (pointer: coarse)'
const SHEET_CLOSE_DELAY_MS = 200

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
  /**
   * On a phone, typing happens in a sheet over the whole screen: the field at its very top, the
   * list filling the rest (`.autocomplete-wrapper--sheet`, phones only). Closing the keyboard closes
   * it. Names its back button.
   */
  sheetCloseLabel?: string
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
  sheetCloseLabel,
}: Props<S>) {
  const [sheet, setSheet] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const closing = useRef<number | undefined>(undefined)
  const closeSheet = () => {
    window.clearTimeout(closing.current)
    setSheet(false)
    inputRef.current?.blur()
  }

  // The keyboard closed: back to the board. iOS says so by leaving the field (`handleBlur`); Android
  // often keeps the field focused, so the visible height growing back says it too.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!sheet || !viewport) return
    let keyboardSeen = false
    const onResize = () => {
      if (viewport.height < window.innerHeight * 0.85) keyboardSeen = true
      else if (keyboardSeen) closeSheet()
    }
    viewport.addEventListener('resize', onResize)
    return () => viewport.removeEventListener('resize', onResize)
  }, [sheet])

  useEffect(() => () => window.clearTimeout(closing.current), [])
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

  // Laid out as a sheet in the focus event itself — synchronously, before iOS looks for where the
  // field is: at the top of the screen, the keyboard does not cover it, and the page stays put.
  const handleFocus = () => {
    window.clearTimeout(closing.current)
    if (!sheetCloseLabel || sheet || !window.matchMedia?.(SHEET_MEDIA).matches) return
    flushSync(() => setSheet(true))
  }

  // Leaving the field — the keyboard dismissed — closes the sheet, a moment later: a name tapped in
  // the list is picked first (its press comes before the field is left), and the sheet goes with it.
  const handleBlur = () => {
    if (!sheet) return
    window.clearTimeout(closing.current)
    closing.current = window.setTimeout(() => setSheet(false), SHEET_CLOSE_DELAY_MS)
  }

  const handleSheetKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (sheet && e.key === 'Escape' && activeIndex < 0) {
      e.preventDefault()
      closeSheet()
      return
    }
    handleKeyDown(e)
  }

  return (
    <div className={`autocomplete-wrapper${sheet ? ' autocomplete-wrapper--sheet' : ''}`}>
      {sheet && (
        <button
          type="button"
          className="autocomplete-sheet__close"
          aria-label={sheetCloseLabel}
          title={sheetCloseLabel}
          onClick={closeSheet}
        >
          <span aria-hidden="true">←</span>
        </button>
      )}
      <input
        ref={inputRef}
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
        onKeyDown={handleSheetKeys}
        onFocus={handleFocus}
        onBlur={handleBlur}
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
