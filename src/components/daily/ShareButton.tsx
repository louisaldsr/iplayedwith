'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '../../i18n'
import { shareMessage, ShareOutcome } from '../../lib/dailyShare'

type Props = {
  /** The message, built by `dailyShareText`. */
  text: string
  className?: string
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
        <span aria-hidden="true">{outcome === 'copied' ? '✓ ' : '↗ '}</span>
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
