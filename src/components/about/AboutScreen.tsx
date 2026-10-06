'use client'

import Link from 'next/link'
import { useTranslations } from '../../i18n'

const GITHUB_URL = 'https://github.com/louisaldsr'

const external = { target: '_blank', rel: 'noopener noreferrer' } as const

/** Where the data comes from, what is counted of a visit, and who made the game. */
export function AboutScreen() {
  const t = useTranslations()

  return (
    <article className="about-screen">
      <h1 className="about-screen__title">{t.about.title}</h1>

      <section className="about-screen__section">
        <h2>{t.about.dataTitle}</h2>
        <ul>
          <li>
            <strong>{t.home.sports.rugby}</strong> —{' '}
            <a href="https://www.allrugby.com" {...external}>
              allrugby.com
            </a>{' '}
            {t.about.and}{' '}
            <a href="https://all.rugby" {...external}>
              all.rugby
            </a>
          </li>
          <li>
            <strong>{t.home.sports.football}</strong> —{' '}
            <a href="https://github.com/dcaribou/transfermarkt-datasets" {...external}>
              Transfermarkt
            </a>{' '}
            (CC0)
          </li>
        </ul>
        <p>{t.about.dataCaveat}</p>
      </section>

      <section className="about-screen__section">
        <h2>{t.about.privacyTitle}</h2>
        <p>{t.about.privacy}</p>
      </section>

      <section className="about-screen__section">
        <h2>{t.about.madeByTitle}</h2>
        <p>
          <a href={GITHUB_URL} {...external}>
            louisaldsr
          </a>{' '}
          — {t.about.contactSoon}
        </p>
      </section>

      <Link href="/" className="btn btn--primary">
        {t.about.back}
      </Link>
    </article>
  )
}
