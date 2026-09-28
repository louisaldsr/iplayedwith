import Link from 'next/link'
import { Player } from '../../domain/player'
import { Game } from '../../game/game'
import { useTranslations } from '../../i18n'

type Props = {
  game: Game
  players: Player[]
  moveCount: number
  /** Daily only: the shortest chain possible, shown next to the one the user found. */
  optimalLinks?: number
  /** Free play restarts in place; the daily has one pair a day, so it offers free play instead. */
  onPlayAgain?: () => void
  freePlayHref?: string
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function VictoryScreen({ game, players, moveCount, optimalLinks, onPlayAgain, freePlayHref }: Props) {
  const t = useTranslations()
  const playerMap = new Map(players.map((p) => [p.id as string, p.name]))
  const elapsedMs = Date.now() - game.startedAt.getTime()
  const pathNames = game.path.map((id) => playerMap.get(id) ?? id)

  return (
    <div className="victory-screen">
      <h2 className="victory-screen__heading">{t.victory.heading}</h2>

      <div className="victory-path">
        {pathNames.map((name, i) => (
          <span key={i}>
            {i > 0 && <span className="victory-path__separator"> → </span>}
            <span className="victory-path__player">{name}</span>
          </span>
        ))}
      </div>

      <div className="victory-stats">
        {optimalLinks !== undefined && (
          <div className="victory-stat">
            <span className="stat-label">{t.daily.yourChain}</span>
            <span className="stat-value">{game.path.length - 1}</span>
          </div>
        )}
        {optimalLinks !== undefined && (
          <div className="victory-stat">
            <span className="stat-label">{t.daily.bestPossible}</span>
            <span className="stat-value">{optimalLinks}</span>
          </div>
        )}
        <div className="victory-stat">
          <span className="stat-label">{t.victory.moves}</span>
          <span className="stat-value">{moveCount}</span>
        </div>
        <div className="victory-stat">
          <span className="stat-label">{t.victory.time}</span>
          <span className="stat-value">{formatTime(elapsedMs)}</span>
        </div>
      </div>

      {onPlayAgain && (
        <button type="button" className="btn btn--primary btn--lg" onClick={onPlayAgain}>
          {t.victory.playAgain}
        </button>
      )}
      {freePlayHref && (
        <Link href={freePlayHref} className="btn btn--primary btn--lg">
          {t.daily.freePlay}
        </Link>
      )}
    </div>
  )
}
