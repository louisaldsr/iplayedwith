import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isSportId } from '@/domain/sport'
import en from '@/i18n/en'
import { SITE_NAME } from '@/lib/siteUrl'
import { DailyChallengePage } from '@/components/daily/DailyChallengePage'
import { parseChallengeNumber, sharedChallengeOrNull } from './sharedChallenge'

type Props = {
  params: Promise<{ sport: string; number: string }>
}

/**
 * A shared daily: `/rugby/412`, the link in a finished day's message. It previews as that day's card
 * (`opengraph-image`) — messaging apps cache a preview per URL, so the link names its day — and opens
 * today's challenge: the one a friend can still play.
 *
 * Canonical on `/rugby`: one page to index, not one per day.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sport, number: raw } = await params
  const number = parseChallengeNumber(raw)
  if (!isSportId(sport) || number === null) return {}

  const shared = await sharedChallengeOrNull(sport, number)
  const title = `${en.home.sports[sport]} daily challenge #${number}`
  const description = shared
    ? `${shared.playerA.name} → ${shared.playerB.name}. Can you link them through their teammates?`
    : 'Link two players through the teammates they shared. One pair a day, the same for everyone.'
  return {
    title,
    description,
    alternates: { canonical: `/${sport}` },
    openGraph: { type: 'website', siteName: SITE_NAME, url: `/${sport}/${number}`, title, description },
  }
}

export default async function SharedDailyPage({ params }: Props) {
  const { sport, number } = await params
  if (!isSportId(sport) || parseChallengeNumber(number) === null) notFound()

  return <DailyChallengePage sport={sport} />
}
