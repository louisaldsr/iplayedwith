'use client'

import { useState } from 'react'
import { Club } from '../../domain/club'

/**
 * A club's crest, sized to the text next to it — before a club's name in a career or a link.
 *
 * Decoration: the name beside it says the same thing, so it is hidden from screen readers. No
 * background: a thin light rim (CSS) keeps a dark crest readable on the dark theme. No logo, or one
 * that fails to load, leaves an empty slot of the same size: names stay aligned down a list.
 */
export function ClubLogo({ club }: { club: Pick<Club, 'logoUrl'> }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const url = club.logoUrl && club.logoUrl !== failedUrl ? club.logoUrl : null

  if (!url) return <span className="club-logo club-logo--empty" aria-hidden="true" />
  return (
    <span className="club-logo" aria-hidden="true">
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailedUrl(url)}
      />
    </span>
  )
}
