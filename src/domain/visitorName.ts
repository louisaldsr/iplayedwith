/**
 * The name a visitor shows in the rankings — generated, never typed.
 *
 * An anonymous visitor gets a sport-flavoured name drawn from curated lists, plus a number that
 * makes it unique ("Pilier Pressé 042", "Hasty Prop 042").
 * 40 adjectives × 28 nouns × 1,000 numbers = 1,120,000 names; the database hands out a number
 * still free for the pair (018_visitor_number.sql). Curated means nothing to moderate: a free-form username needs a filter, a report
 * button and someone to act on it, and is kept for accounts.
 *
 * Stored as KEYS, not text, in `visitors` (017_visitors.sql): the name is drawn once and never
 * changes, and each viewer reads it in their language (`fame`'s labels work the same way). The
 * labels live in `src/i18n` (`visitorNames`), typed against these keys — a key without a label in
 * every language does not compile.
 *
 * Rules for the lists, since the names are public: kind to everyone (teasing at most), nothing a
 * player could be embarrassed to carry, no word with a second meaning in either language (hence
 * no "hooker"). French nouns are all masculine, so adjectives never need to agree.
 */

export const NAME_ADJECTIVES = [
  'hasty',
  'shy',
  'absentMinded',
  'fearless',
  'cunning',
  'elegant',
  'fiery',
  'serene',
  'flying',
  'masked',
  'mysterious',
  'legendary',
  'tireless',
  'flamboyant',
  'discreet',
  'curious',
  'daring',
  'elusive',
  'unpredictable',
  'jolly',
  'mischievous',
  'philosophical',
  'nostalgic',
  'sleepwalking',
  'lucky',
  'dreamy',
  'tenacious',
  'zen',
  'unstoppable',
  'valiant',
  'playful',
  'hungry',
  'earlyRising',
  'nocturnal',
  'heroic',
  'optimistic',
  'chatty',
  'cosmic',
  'electric',
  'laidBack',
] as const

export const NAME_NOUNS = [
  'prop',
  'winger',
  'fullback',
  'centre',
  'scrumHalf',
  'flyHalf',
  'flanker',
  'lock',
  'kicker',
  'captain',
  'substitute',
  'goalkeeper',
  'sweeper',
  'striker',
  'wingBack',
  'playmaker',
  'midfielder',
  'referee',
  'coach',
  'supporter',
  'physio',
  'ballBoy',
  'chairman',
  'steward',
  'announcer',
  'kitMan',
  'scout',
  'manager',
] as const

export type NameAdjective = (typeof NAME_ADJECTIVES)[number]
export type NameNoun = (typeof NAME_NOUNS)[number]

/** The words of a name — what the server draws; the database adds a free number. */
export type NameWords = { adjective: NameAdjective; noun: NameNoun }

export type VisitorName = NameWords & { number: number }

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)]

/** A pair of words drawn uniformly. */
export function randomNameWords(random: () => number = Math.random): NameWords {
  return { adjective: pick(NAME_ADJECTIVES, random), noun: pick(NAME_NOUNS, random) }
}

/**
 * A stored name read back — null when missing, or when a key is no longer in the lists (they only
 * ever grow).
 */
export function visitorNameOf(adjective: unknown, noun: unknown, number: unknown): VisitorName | null {
  const isAdjective = (NAME_ADJECTIVES as readonly unknown[]).includes(adjective)
  const isNoun = (NAME_NOUNS as readonly unknown[]).includes(noun)
  const isNumber = Number.isInteger(number) && (number as number) >= 0 && (number as number) <= 999
  if (!isAdjective || !isNoun || !isNumber) return null
  return { adjective: adjective as NameAdjective, noun: noun as NameNoun, number: number as number }
}

type NameLabels = {
  adjectives: Record<NameAdjective, string>
  nouns: Record<NameNoun, string>
  /** Word order is the language's: "Hasty Prop", "Pilier Pressé". */
  format: (adjective: string, noun: string) => string
}

/** "Pilier Pressé 042" — the number always on three digits. */
export function formatVisitorName(name: VisitorName, labels: NameLabels): string {
  const words = labels.format(labels.adjectives[name.adjective], labels.nouns[name.noun])
  return `${words} ${String(name.number).padStart(3, '0')}`
}
