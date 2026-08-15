'use client'

import Link from 'next/link'
import { SPORTS } from '../../domain/sport'
import { useTranslations } from '../../i18n'

export function SportSelectScreen() {
  const t = useTranslations()

  return (
    <div className="home-screen">
      <h1 className="home-screen__title">{t.home.title}</h1>
      <p className="home-screen__tagline">{t.home.tagline}</p>

      <p className="home-screen__prompt">{t.home.chooseSportPrompt}</p>

      <div className="home-screen__sports">
        {SPORTS.map(sport => (
          <Link key={sport} href={`/${sport}`} className="home-screen__sport-card">
            {t.home.sports[sport]}
          </Link>
        ))}
      </div>
    </div>
  )
}
