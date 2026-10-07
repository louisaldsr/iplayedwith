import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isSportId, SPORTS } from '@/domain/sport'
import en from '@/i18n/en'
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
  const name = en.home.sports[sport]
  return {
    title: `${name} daily challenge`,
    description: `Today's ${name.toLowerCase()} challenge: connect two players through the teammates they shared. One pair a day, the same for everyone.`,
    alternates: { canonical: `/${sport}` },
  }
}

export default async function SportPage({ params }: Props) {
  const { sport } = await params
  if (!isSportId(sport)) notFound()

  return <DailyChallengePage sport={sport} />
}
