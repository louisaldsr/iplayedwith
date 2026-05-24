import { useTranslations } from '../../i18n'

type Props = {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: Props) {
  const t = useTranslations()

  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="error-banner__close"
        onClick={onDismiss}
        aria-label={t.game.closeError}
      >
        ✕
      </button>
    </div>
  )
}
