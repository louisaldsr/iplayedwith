'use client'

import { useCallback, useState } from 'react'
import { SportId } from '../../domain/sport'
import { DailySolution } from '../../domain/dailySolution'
import { getDailySolution } from '../../lib/gameApi'
import { readVisitor } from '../../lib/visitor'

export type DailySolutionState = {
  /** The solution to lay over the board — set only while shown. */
  shown: DailySolution | null
  status: 'idle' | 'loading' | 'error'
  show: () => Promise<void>
  hide: () => void
}

/**
 * The proposed solution of a finished daily, asked of the server only when the visitor wants it —
 * the server itself refuses it to a visitor it has not seen finish the day. Kept in memory, never in
 * storage: hidden and shown again, it is not asked twice.
 *
 * `daily` is null while the day is not over: `show` then does nothing.
 */
export function useDailySolution(daily: { sport: SportId; day: string } | null): DailySolutionState {
  const [solution, setSolution] = useState<DailySolution | null>(null)
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState<DailySolutionState['status']>('idle')

  const show = useCallback(async () => {
    if (!daily) return
    if (solution) return setVisible(true)
    const visitorId = readVisitor().playerId
    if (!visitorId) return setStatus('error')
    setStatus('loading')
    try {
      setSolution(await getDailySolution(daily.sport, daily.day, visitorId))
      setVisible(true)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [daily, solution])

  const hide = useCallback(() => setVisible(false), [])

  return { shown: visible ? solution : null, status, show, hide }
}
