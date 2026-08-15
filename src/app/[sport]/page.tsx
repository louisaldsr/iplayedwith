import { notFound } from 'next/navigation'
import { isSportId, SPORTS } from '@/domain/sport'
import { GamePage } from '@/components/GamePage'

type Props = {
  params: Promise<{ sport: string }>
}

export function generateStaticParams() {
  return SPORTS.map(sport => ({ sport }))
}

export default async function SportPage({ params }: Props) {
  const { sport } = await params
  if (!isSportId(sport)) notFound()

  return <GamePage sport={sport} />
}
