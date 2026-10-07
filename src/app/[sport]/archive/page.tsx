import { notFound } from 'next/navigation'
import { isSportId, SPORTS } from '@/domain/sport'
import { DailyArchivePage } from '@/components/daily/DailyArchivePage'

type Props = {
  params: Promise<{ sport: string }>
}

export function generateStaticParams() {
  return SPORTS.map((sport) => ({ sport }))
}

/** The sport's past daily challenges, each one playable. Today's lives at `/[sport]`. */
export default async function ArchivePage({ params }: Props) {
  const { sport } = await params
  if (!isSportId(sport)) notFound()

  return <DailyArchivePage sport={sport} />
}
