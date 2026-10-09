'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { formatUsername, generatedNameOf } from '../../domain/visitorName'
import { parseTypedUsername, USERNAME_MAX_LENGTH, UsernameProblem } from '../../domain/username'
import { renameUsername } from '../../lib/gameApi'
import { readVisitor } from '../../lib/visitor'
import { useTranslations } from '../../i18n'
import { useUsername } from '../shared/useUsername'

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'invalid'; problem: UsernameProblem }
  | { kind: 'taken'; name: string; suggestions: string[]; attempt: number }
  | { kind: 'error' }

/**
 * The visitor's name, top left of the menu — the name the rankings show. The menu is the one place
 * to rename (the game's top bar only shows it), and it happens in place: a click turns the badge
 * into a field. Enter or a click elsewhere saves; Escape or ✕ cancels. A name refused (invalid,
 * taken) keeps the field open with the reason, whichever way it was sent.
 *
 * The rules are checked here first (same function as the server), so most mistakes never leave the
 * browser; only the server knows whether a name is taken — it then offers a few free variants, one
 * tap each, in a bubble under the badge.
 */
export function VisitorBadge() {
  const t = useTranslations()
  const r = t.menu.rename
  const { username, update } = useUsername()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [justSaved, setJustSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const refocusBadge = useRef(false)
  // The latest save, for the outside-click listener — which is set up once per editing session.
  const saveDraft = useRef<() => void>(() => {})

  const displayName = username ? formatUsername(username, t.visitorNames) : ''

  // The badge pops once after a rename, then settles.
  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 1200)
    return () => clearTimeout(timer)
  }, [justSaved])

  // A click anywhere outside the badge (and its bubble) saves, like Enter.
  useEffect(() => {
    if (!editing) return
    const onPointerDown = (e: PointerEvent) => {
      if (!formRef.current?.contains(e.target as Node)) saveDraft.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [editing])

  // Back from the field: the badge gets the focus back — unless the click went elsewhere.
  useEffect(() => {
    if (editing || !refocusBadge.current) return
    refocusBadge.current = false
    buttonRef.current?.focus()
  }, [editing])

  if (!username) return null

  function startEditing() {
    setDraft(displayName)
    setStatus({ kind: 'idle' })
    setEditing(true)
    // Selected, so typing replaces it — the usual rename gesture.
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function stopEditing(refocus: boolean) {
    refocusBadge.current = refocus
    setEditing(false)
  }

  /**
   * `fromOutside`: sent by a click elsewhere — the focus stays where that click put it, and a
   * second click while the first save runs does nothing.
   */
  async function save(raw: string, fromOutside = false) {
    if (status.kind === 'saving') return
    const parsed = parseTypedUsername(raw)
    if (!parsed.ok) return setStatus({ kind: 'invalid', problem: parsed.problem })
    // Unchanged — including a generated name left as displayed, which must stay translatable.
    const unchanged = parsed.username === username || (generatedNameOf(username!) && parsed.username === displayName)
    if (unchanged) return stopEditing(!fromOutside)

    const { playerId } = readVisitor()
    if (!playerId) return setStatus({ kind: 'error' })

    setStatus({ kind: 'saving' })
    try {
      const result = await renameUsername(playerId, parsed.username)
      if (result.status === 'renamed') {
        update(result.username)
        setJustSaved(true)
        stopEditing(!fromOutside)
      } else if (result.status === 'taken') {
        setStatus((prev) => ({
          kind: 'taken',
          name: parsed.username,
          suggestions: result.suggestions,
          // Restarts the shake when a name is refused twice in a row.
          attempt: prev.kind === 'taken' ? prev.attempt + 1 : 0,
        }))
        requestAnimationFrame(() => inputRef.current?.focus())
      } else {
        setStatus({ kind: 'invalid', problem: result.problem })
      }
    } catch {
      setStatus({ kind: 'error' })
    }
  }

  saveDraft.current = () => void save(draft, true)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void save(draft)
  }

  if (!editing) {
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          className={`visitor-badge visitor-badge--button${justSaved ? ' visitor-badge--saved' : ''}`}
          title={r.open}
          onClick={startEditing}
        >
          <span className="visitor-badge__icon" aria-hidden="true">
            👤
          </span>
          <span className="visually-hidden">{t.menu.yourName}: </span>
          <span className="visitor-badge__name">{displayName}</span>
          <span className="visually-hidden"> — {r.open}</span>
          <span className="visitor-badge__edit" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
              <path d="m14.5 5.5 3 3" />
            </svg>
          </span>
        </button>
        <span className="visually-hidden" role="status">
          {justSaved ? r.done : ''}
        </span>
      </>
    )
  }

  const saving = status.kind === 'saving'
  const refused = status.kind === 'invalid' || status.kind === 'taken'
  const tone =
    status.kind === 'taken'
      ? ' visitor-badge--taken'
      : refused || status.kind === 'error'
        ? ' visitor-badge--invalid'
        : ''

  return (
    <form
      ref={formRef}
      // Remounted on each refusal of a taken name, so the shake plays again.
      key={status.kind === 'taken' ? `taken-${status.attempt}` : 'editing'}
      className={`visitor-badge visitor-badge--editing${tone}`}
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          stopEditing(true)
        }
      }}
      noValidate
    >
      <span className="visitor-badge__icon" aria-hidden="true">
        👤
      </span>
      <input
        ref={inputRef}
        className="visitor-badge__input"
        aria-label={r.label}
        value={draft}
        placeholder={displayName}
        maxLength={USERNAME_MAX_LENGTH}
        size={USERNAME_MAX_LENGTH}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        autoFocus
        aria-invalid={refused}
        aria-describedby="visitor-badge-feedback"
        readOnly={saving}
        onChange={(e) => {
          setDraft(e.target.value)
          if (!saving) setStatus({ kind: 'idle' })
        }}
      />
      <span className="visitor-badge__count" aria-hidden="true">
        {[...draft].length}/{USERNAME_MAX_LENGTH}
      </span>
      <button
        type="submit"
        className="visitor-badge__action visitor-badge__action--save"
        aria-label={saving ? r.saving : r.save}
        title={r.save}
        disabled={saving || draft.trim() === ''}
      >
        {saving ? '…' : '✓'}
      </button>
      <button
        type="button"
        className="visitor-badge__action"
        aria-label={r.cancel}
        title={r.cancel}
        onClick={() => stopEditing(true)}
      >
        ✕
      </button>

      <div id="visitor-badge-feedback" className="visitor-badge__bubble" role="status" aria-live="polite">
        {(status.kind === 'idle' || saving) && <p className="visitor-badge__hint">{r.rules}</p>}
        {status.kind === 'invalid' && <p className="visitor-badge__problem">{r.problems[status.problem]}</p>}
        {status.kind === 'error' && <p className="visitor-badge__problem">{r.error}</p>}
        {status.kind === 'taken' && (
          <div className="visitor-badge__taken">
            <p>
              <span aria-hidden="true">🙈 </span>
              {r.taken(status.name)}
            </p>
            {status.suggestions.length > 0 ? (
              <>
                <p className="visitor-badge__hint">{r.tryInstead}</p>
                <div className="visitor-badge__suggestions">
                  {status.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="visitor-badge__suggestion"
                      onClick={() => {
                        setDraft(suggestion)
                        void save(suggestion)
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="visitor-badge__hint">{r.tryAnother}</p>
            )}
          </div>
        )}
      </div>
    </form>
  )
}
