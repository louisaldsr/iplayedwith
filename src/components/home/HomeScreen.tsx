import { useTranslations } from '../../i18n'

type Props = {
  onLaunch: () => void
}

export function HomeScreen({ onLaunch }: Props) {
  const t = useTranslations()

  return (
    <div className="home-screen">
      <h1 className="home-screen__title">{t.home.title}</h1>
      <p className="home-screen__tagline">{t.home.tagline}</p>
      <button type="button" className="btn btn--primary btn--lg" onClick={onLaunch}>
        {t.home.launchGame}
      </button>
    </div>
  )
}
