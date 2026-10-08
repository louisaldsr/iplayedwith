export const SPORTS = ['rugby', 'football', 'basketball'] as const

export type SportId = (typeof SPORTS)[number]

export function isSportId(value: string): value is SportId {
  return (SPORTS as readonly string[]).includes(value)
}

/**
 * Sports teased on the menu before they exist: a card that says "coming soon", nothing more. Never a
 * SportId — no route, no data, no daily challenge. Moving one into SPORTS is what launches it.
 */
export const UPCOMING_SPORTS = ['formula1'] as const

export type UpcomingSportId = (typeof UPCOMING_SPORTS)[number]
