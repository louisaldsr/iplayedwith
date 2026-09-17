'use client'

import { useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 250

type Options = {
  /** Below this many characters the search is skipped and results cleared. */
  minChars?: number
}

/**
 * Debounced typeahead against a server endpoint.
 *
 * The pickers used to filter a full in-memory roster on every keystroke; they now query
 * the API instead. Two things matter beyond the debounce: responses can arrive out of
 * order, so a stale one must not overwrite a newer one, and an unmounted component must
 * not set state — both handled by the request counter below.
 *
 * `failed` exists because a failing search used to be indistinguishable from one that
 * simply matched nothing: the catch emptied the results and the dropdown said "No
 * results". A server-side outage then looks to the player like an absent player, which is
 * the hardest kind of bug to report.
 */
export function useDebouncedSearch<T>(
  query: string,
  search: (q: string, signal: AbortSignal) => Promise<T[]>,
  { minChars = 2 }: Options = {},
): { results: T[]; loading: boolean; failed: boolean } {
  const [results, setResults] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  // Identifies the most recent request so slower earlier ones can be discarded.
  const latestRequest = useRef(0)
  const searchRef = useRef(search)
  searchRef.current = search

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < minChars) {
      latestRequest.current += 1
      setResults([])
      setLoading(false)
      setFailed(false)
      return
    }

    const requestId = ++latestRequest.current
    const controller = new AbortController()
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const found = await searchRef.current(trimmed, controller.signal)
        if (requestId === latestRequest.current) {
          setResults(found)
          setFailed(false)
          setLoading(false)
        }
      } catch (err) {
        // An abort is this effect cleaning up after itself, not a failure.
        if (controller.signal.aborted) return
        if (requestId === latestRequest.current) {
          console.error('player/club search failed', err)
          setResults([])
          setFailed(true)
          setLoading(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, minChars])

  return { results, loading, failed }
}
