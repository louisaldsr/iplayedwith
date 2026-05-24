import { Player } from '../../domain/player'
import { Game } from '../../game/game'
import { useTranslations } from '../../i18n'

type Props = {
  game: Game
  players: Player[]
  moveCount: number
  onPlayAgain: () => void
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function VictoryScreen({ game, players, moveCount, onPlayAgain }: Props) {
  const t = useTranslations()
  const playerMap = new Map(players.map(p => [p.id as string, p.name]))
  const elapsedMs = Date.now() - game.startedAt.getTime()
  const pathNames = game.path.map(id => playerMap.get(id) ?? id)

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
        <div className="victory-stat">
          <span className="stat-label">{t.victory.moves}</span>
          <span className="stat-value">{moveCount}</span>
        </div>
        <div className="victory-stat">
          <span className="stat-label">{t.victory.time}</span>
          <span className="stat-value">{formatTime(elapsedMs)}</span>
        </div>
      </div>

      <button type="button" className="btn btn--primary btn--lg" onClick={onPlayAgain}>
        {t.victory.playAgain}
      </button>
    </div>
  )
}
