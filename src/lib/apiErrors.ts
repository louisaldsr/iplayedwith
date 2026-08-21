import { NextResponse } from 'next/server'
import { ServiceError } from '@/services/errors'

/** Maps a thrown error to an HTTP response. Unknown errors (e.g. raw DB failures) become a 500. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error(err)
  return NextResponse.json({ error: 'internal server error' }, { status: 500 })
}
