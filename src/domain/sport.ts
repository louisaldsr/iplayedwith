export const SPORTS = ['rugby', 'football'] as const;

export type SportId = (typeof SPORTS)[number];

export function isSportId(value: string): value is SportId {
  return (SPORTS as readonly string[]).includes(value);
}
