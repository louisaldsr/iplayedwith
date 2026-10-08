import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { isSportId } from '@/domain/sport'
import { translationsFor } from '@/i18n/translationsFor'
import { parseChallengeNumber, sharedChallengeOrNull } from './sharedChallenge'

/**
 * The card a shared daily link unfurls into — the same for everyone that day: the day's number, A
 * and B on the gold cards of the board, and a dare. The sharer's own result travels in the message
 * under it, never in here: nothing is stored for a share.
 *
 * A day's pair never changes once drawn, so a found card is cached for good. Without one (a number
 * not reached yet, the database down) the card names no players and is cached briefly.
 *
 * In English: the server does not know the language of whoever the link is sent to.
 */

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'I Played With daily challenge: connect the two players through their teammates'

// The board's colours (globals.css): A and B are the gold-bordered target cards.
const BG = '#111318'
const TEXT = '#e8eaf0'
const MUTED = '#8b8fa8'
const ACCENT = '#7c6ef5'
const GOLD = '#ffd66b'
const TARGET_TINT = '#1c355a'
const TARGET_BORDER = '#b0925a'

const asset = (...path: string[]) => readFile(join(process.cwd(), ...path))

export default async function Image({ params }: { params: Promise<{ sport: string; number: string }> }) {
  const { sport, number: raw } = await params
  const number = parseChallengeNumber(raw)
  if (!isSportId(sport) || number === null) notFound()

  const [shared, logo, medium, extraBold] = await Promise.all([
    sharedChallengeOrNull(sport, number),
    asset('brand', 'logo.svg'),
    asset('brand', 'fonts', 'Archivo-Medium.ttf'),
    asset('brand', 'fonts', 'Archivo-ExtraBold.ttf'),
  ])

  const t = translationsFor('en', sport)
  const heading = `Daily challenge #${number} · ${t.home.sports[sport]}`
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '56px 64px',
        background: BG,
        // Vertical only: a PNG compresses identical rows to almost nothing — a radial glow tripled
        // the file, past the ~300 KB WhatsApp shows previews under.
        backgroundImage: `linear-gradient(180deg, ${BG} 5%, #29245a 50%, ${BG} 95%)`,
        color: TEXT,
        fontFamily: 'Archivo',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <img src={`data:image/svg+xml;base64,${logo.toString('base64')}`} width={72} height={72} alt="" />
        <span
          style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}
        >
          {heading}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlayerCard name={shared?.playerA.name ?? t.seo.cardPlayerA} />
        <div style={{ display: 'flex', alignItems: 'center', width: 180 }}>
          <div style={{ flex: 1, height: 6, background: GOLD, opacity: 0.85 }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 88,
              height: 88,
              borderRadius: 44,
              border: `5px solid ${GOLD}`,
              background: BG,
              color: GOLD,
              fontSize: 52,
              fontWeight: 800,
            }}
          >
            ?
          </div>
          <div style={{ flex: 1, height: 6, background: GOLD, opacity: 0.85 }} />
        </div>
        <PlayerCard name={shared?.playerB.name ?? t.seo.cardPlayerB} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 60, fontWeight: 800 }}>Can you connect them?</span>
        <span style={{ fontSize: 30, fontWeight: 500, color: ACCENT }}>iplayedwith.com</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Archivo', data: medium, weight: 500, style: 'normal' },
        { name: 'Archivo', data: extraBold, weight: 800, style: 'normal' },
      ],
      headers: {
        'Cache-Control': shared ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      },
    },
  )
}

function PlayerCard({ name }: { name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 410,
        height: 190,
        padding: '0 24px',
        borderRadius: 24,
        border: `4px solid ${TARGET_BORDER}`,
        background: TARGET_TINT,
        boxShadow: '0 0 48px rgba(255, 200, 90, 0.35)',
        textAlign: 'center',
        fontSize: name.length <= 14 ? 44 : name.length <= 20 ? 38 : 32,
        fontWeight: 800,
        lineHeight: 1.1,
      }}
    >
      {name}
    </div>
  )
}
