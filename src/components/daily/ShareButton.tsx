'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '../../i18n'
import { shareMessage, ShareOutcome } from '../../lib/dailyShare'

type Props = {
  /** The message, built by `dailyShareText`. */
  text: string
  className?: string
}

/** The share icon seen everywhere (three connected dots) — drawn in the text's colour. */
function ShareIcon() {
  return (
    <svg className="btn__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="8.6" y1="10.7" x2="15.4" y2="6.8" />
        <line x1="8.6" y1="13.3" x2="15.4" y2="17.2" />
      </g>
      <g fill="currentColor">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
      </g>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="btn__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <polyline
        points="5 12.5 10 17.5 19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** How long "Copied" stays before the button reads "Share" again. */
const FEEDBACK_MS = 2500

/**
 * Shares a finished daily: the share sheet on a phone, the clipboard on a computer — the button
 * then says it was copied, since nothing else on screen would.
 */
export function ShareButton({ text, className = '' }: Props) {
  const t = useTranslations()
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)

  useEffect(() => {
    if (outcome !== 'copied' && outcome !== 'failed') return
    const timer = window.setTimeout(() => setOutcome(null), FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [outcome])

  return (
    <span className={`share-button ${className}`}>
      <button
        type="button"
        className={`btn btn--share${outcome === 'copied' ? ' btn--share-done' : ''}`}
        onClick={async () => setOutcome(await shareMessage(text))}
      >
        {outcome === 'copied' ? <CheckIcon /> : <ShareIcon />}
        {t.daily.share.button}
      </button>
      <span
        className={`share-button__feedback${outcome === 'failed' ? ' share-button__feedback--failed' : ''}`}
        role="status"
      >
        {outcome === 'copied' ? t.daily.share.copied : outcome === 'failed' ? t.daily.share.failed : ''}
      </span>
    </span>
  )
}
