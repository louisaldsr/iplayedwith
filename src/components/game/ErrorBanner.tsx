import { useEffect, useRef } from 'react'
import { useTranslations } from '../../i18n'

type Props = {
  message: string
  onDismiss: () => void
}

/** How long a refused guess stays said before the banner goes on its own. */
export const ERROR_BANNER_MS = 5000

export function ErrorBanner({ message, onDismiss }: Props) {
  const t = useTranslations()
  // The latest callback, without restarting the countdown when the parent re-renders.
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(), ERROR_BANNER_MS)
    return () => window.clearTimeout(timer)
  }, [message])

  return (
    <div className="error-banner error-banner--toast" role="alert">
      <span>{message}</span>
      <button type="button" className="error-banner__close" onClick={onDismiss} aria-label={t.game.closeError}>
        ✕
      </button>
    </div>
  )
}
