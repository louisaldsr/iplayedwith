import { notFound } from 'next/navigation'
import { isSportId } from '@/domain/sport'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { ArchivedChallengePage } from '@/components/daily/ArchivedChallengePage'

type Props = {
  params: Promise<{ sport: string; day: string }>
}

/** A past daily challenge, played late. `day` is YYYY-MM-DD; which days exist is the archive's call. */
export default async function ArchivedDayPage({ params }: Props) {
  const { sport, day } = await params
  if (!isSportId(sport) || !isChallengeDay(day)) notFound()

  return <ArchivedChallengePage sport={sport} day={day} />
}

function isChallengeDay(raw: string): boolean {
  try {
    ChallengeDay(raw)
    return true
  } catch {
    return false
  }
}
