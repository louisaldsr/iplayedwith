'use client'

import Link from 'next/link'
import { useTranslations } from '../../i18n'
import { DATA_SINCE } from '../../domain/dataCoverage'
import { SportId } from '../../domain/sport'
import { ContactSection } from './ContactSection'

const GITHUB_URL = 'https://github.com/louisaldsr'

const external = { target: '_blank', rel: 'noopener noreferrer' } as const

/** « from 2012-2013 » after a sport's sources: its first season of data. */
function Since({ sport }: { sport: SportId }) {
  const t = useTranslations()
  return <span className="about-screen__since"> · {t.about.dataSince(DATA_SINCE[sport])}</span>
}

/** Where the data comes from, what is counted of a visit, who made the game, and how to reach them. */
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
            <Since sport="rugby" />
          </li>
          <li>
            <strong>{t.home.sports.football}</strong> —{' '}
            <a href="https://github.com/dcaribou/transfermarkt-datasets" {...external}>
              Transfermarkt
            </a>{' '}
            (CC0)
            <Since sport="football" />
          </li>
          <li>
            <strong>{t.home.sports.basketball}</strong> —{' '}
            <a href="https://www.basketball-reference.com" {...external}>
              Basketball-Reference
            </a>
            <Since sport="basketball" />
          </li>
          <li>
            <strong>{t.home.sports.formula1}</strong> —{' '}
            <a href="https://github.com/jolpica/jolpica-f1" {...external}>
              Jolpica-F1
            </a>
            <Since sport="formula1" />
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
          </a>
        </p>
      </section>

      <ContactSection />

      <Link href="/" className="btn btn--primary">
        {t.about.back}
      </Link>
    </article>
  )
}
