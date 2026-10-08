import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isSportId, SPORTS } from '@/domain/sport'
import { translationsFor } from '@/i18n/translationsFor'
import { DailyChallengePage } from '@/components/daily/DailyChallengePage'

type Props = {
  params: Promise<{ sport: string }>
}

export function generateStaticParams() {
  return SPORTS.map((sport) => ({ sport }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sport } = await params
  if (!isSportId(sport)) return {}
  const t = translationsFor('en', sport)
  const name = t.home.sports[sport]
  return {
    title: `${name} daily challenge`,
    description: t.seo.dailyDescription(name),
    alternates: { canonical: `/${sport}` },
  }
}

export default async function SportPage({ params }: Props) {
  const { sport } = await params
  if (!isSportId(sport)) notFound()

  return <DailyChallengePage sport={sport} />
}
