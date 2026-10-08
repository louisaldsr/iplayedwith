import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isSportId } from '@/domain/sport'
import { translationsFor } from '@/i18n/translationsFor'
import { SITE_NAME } from '@/lib/siteUrl'
import { ArchivedChallengePage } from '@/components/daily/ArchivedChallengePage'
import { parseChallengeNumber, sharedChallengeOrNull } from './sharedChallenge'

type Props = {
  params: Promise<{ sport: string; number: string }>
}

/**
 * A shared daily: `/rugby/412`, the link in a finished day's message. It previews as that day's card
 * (`opengraph-image`) — messaging apps cache a preview per URL, so the link names its day — and opens
 * that day: a past one from the archive, today's on its own page. Found in the browser, from the
 * archive, so the page never waits on the database.
 *
 * Canonical on `/rugby`: one page to index, not one per day.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sport, number: raw } = await params
  const number = parseChallengeNumber(raw)
  if (!isSportId(sport) || number === null) return {}

  const shared = await sharedChallengeOrNull(sport, number)
  const t = translationsFor('en', sport)
  const title = `${t.home.sports[sport]} daily challenge #${number}`
  const description = shared ? t.seo.sharedDescription(shared.playerA.name, shared.playerB.name) : t.seo.sharedFallback
  return {
    title,
    description,
    alternates: { canonical: `/${sport}` },
    openGraph: { type: 'website', siteName: SITE_NAME, url: `/${sport}/${number}`, title, description },
  }
}

export default async function SharedDailyPage({ params }: Props) {
  const { sport, number: raw } = await params
  const number = parseChallengeNumber(raw)
  if (!isSportId(sport) || number === null) notFound()

  return <ArchivedChallengePage sport={sport} number={number} />
}
