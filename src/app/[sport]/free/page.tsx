import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isSportId, SPORTS } from '@/domain/sport'
import en from '@/i18n/en'
import { GamePage } from '@/components/GamePage'

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
    title: `Free play — ${name}`,
    description: `Pick any two ${name.toLowerCase()} players and connect them through the teammates they shared.`,
    alternates: { canonical: `/${sport}/free` },
  }
}

/** Free play: the user picks both players and the difficulty. The daily lives at `/[sport]`. */
export default async function FreePlayPage({ params }: Props) {
  const { sport } = await params
  if (!isSportId(sport)) notFound()

  return <GamePage sport={sport} />
}
