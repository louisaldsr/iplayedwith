import { notFound } from 'next/navigation'
import { isSportId, SPORTS } from '@/domain/sport'
import { GamePage } from '@/components/GamePage'

type Props = {
  params: Promise<{ sport: string }>
}

export function generateStaticParams() {
  return SPORTS.map((sport) => ({ sport }))
}

/** Free play: the user picks both players and the difficulty. The daily lives at `/[sport]`. */
export default async function FreePlayPage({ params }: Props) {
  const { sport } = await params
  if (!isSportId(sport)) notFound()

  return <GamePage sport={sport} />
}
