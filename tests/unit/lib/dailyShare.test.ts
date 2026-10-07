import { DailyShare, dailyShareText, shareMessage, shareSquares } from '@/lib/dailyShare'
import { PlayerId } from '@/domain/ids'
import en from '@/i18n/en'
import fr from '@/i18n/fr'

const dupont = { id: PlayerId('p-dupont'), name: 'Antoine Dupont' }
const kolisi = { id: PlayerId('p-kolisi'), name: 'Siya Kolisi' }
const [x, y, z, w] = ['p-x', 'p-y', 'p-z', 'p-w'].map(PlayerId)

const base = { sport: 'rugby' as const, number: 412, playerA: dupont, playerB: kolisi }

const wonWithExtras: DailyShare = {
  ...base,
  added: [x, z, y, w],
  lives: { left: 2, total: 3 },
  outcome: 'won',
  path: [dupont.id, x, y, kolisi.id],
  score: 2,
  elapsedMs: 277_000,
}

describe('shareSquares', () => {
  it('marks each player added, in order: on the winning chain or a dead end', () => {
    expect(shareSquares([x, z, y, w], [dupont.id, x, y, kolisi.id])).toBe('🟩⬜🟩⬜')
  })

  it('has no chain to be on once the day is lost', () => {
    expect(shareSquares([x, y], [])).toBe('⬜⬜')
  })
})

describe('dailyShareText', () => {
  it('shares a won day: squares, score, hearts, time and what the score means', () => {
    expect(dailyShareText(wonWithExtras, en)).toBe(
      [
        'I Played With · Rugby #412',
        'Antoine Dupont → Siya Kolisi',
        '🟩⬜🟩⬜',
        '+2 · ❤️❤️🤍 · 4:37',
        '2 players more than the shortest chain',
        'iplayedwith.com/rugby/412',
      ].join('\n'),
    )
  })

  it('says "Perfect!" for the shortest chain', () => {
    const perfect: DailyShare = {
      ...base,
      added: [x],
      lives: { left: 3, total: 3 },
      outcome: 'won',
      path: [dupont.id, x, kolisi.id],
      score: 0,
      elapsedMs: 42_000,
    }
    const lines = dailyShareText(perfect, en).split('\n')
    expect(lines[2]).toBe('🟩')
    expect(lines[3]).toBe('Perfect! · ❤️❤️❤️ · 0:42')
    expect(lines[4]).toBe('Shortest chain found')
  })

  it('shares a lost day with a dare, every heart empty', () => {
    const lost: DailyShare = { ...base, added: [x, y], lives: { left: 0, total: 3 }, outcome: 'lost' }
    expect(dailyShareText(lost, en)).toBe(
      [
        'I Played With · Rugby #412',
        'Antoine Dupont → Siya Kolisi',
        '⬜⬜',
        '💔 Out of lives · 🤍🤍🤍',
        'Can you do better?',
        'iplayedwith.com/rugby/412',
      ].join('\n'),
    )
  })

  it('drops the squares line when nobody was added', () => {
    const lost: DailyShare = { ...base, added: [], lives: { left: 0, total: 3 }, outcome: 'lost' }
    expect(dailyShareText(lost, en).split('\n')[2]).toBe('💔 Out of lives · 🤍🤍🤍')
  })

  it("is written in the sharer's language", () => {
    const text = dailyShareText(wonWithExtras, fr)
    expect(text).toContain(fr.daily.scoreHint(2))
    expect(text).not.toContain('players more')
  })

  it('never names a player of the chain — only A and B', () => {
    const named: DailyShare = {
      ...wonWithExtras,
      added: [PlayerId('p-secret')],
      path: [dupont.id, PlayerId('p-secret'), kolisi.id],
    }
    expect(dailyShareText(named, en)).not.toContain('secret')
  })
})

describe('shareMessage', () => {
  const writeText = jest.fn()

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
  })
  afterEach(() => {
    delete (navigator as { share?: unknown }).share
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  const touchScreen = (coarse: boolean) => Object.assign(window, { matchMedia: () => ({ matches: coarse }) })

  it('copies on a computer', async () => {
    touchScreen(false)
    Object.assign(navigator, { share: jest.fn() })
    expect(await shareMessage('hi')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hi')
    expect(navigator.share).not.toHaveBeenCalled()
  })

  it("opens the phone's share sheet", async () => {
    touchScreen(true)
    Object.assign(navigator, { share: jest.fn().mockResolvedValue(undefined) })
    expect(await shareMessage('hi')).toBe('shared')
    expect(navigator.share).toHaveBeenCalledWith({ text: 'hi' })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('takes a closed share sheet as a change of mind, not a failure', async () => {
    touchScreen(true)
    Object.assign(navigator, { share: jest.fn().mockRejectedValue(new DOMException('closed', 'AbortError')) })
    expect(await shareMessage('hi')).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when the share sheet fails', async () => {
    touchScreen(true)
    Object.assign(navigator, { share: jest.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')) })
    expect(await shareMessage('hi')).toBe('copied')
  })

  it('says so when the clipboard is refused', async () => {
    touchScreen(false)
    writeText.mockRejectedValue(new Error('denied'))
    expect(await shareMessage('hi')).toBe('failed')
  })
})
