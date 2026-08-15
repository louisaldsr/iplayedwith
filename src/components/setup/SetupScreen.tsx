import { Player } from '../../domain/player'
import { Membership } from '../../domain/membership'
import { DifficultyLevel } from '../../game/game'
import { areDirectlyConnected } from '../../game/engine'
import { useTranslations } from '../../i18n'
import { PlayerPicker } from './PlayerPicker'
import { DifficultyPicker } from './DifficultyPicker'

type Props = {
  players: Player[]
  memberships: Membership[]
  playerA: Player | null
  playerB: Player | null
  difficulty: DifficultyLevel
  onSetPlayerA: (p: Player | null) => void
  onSetPlayerB: (p: Player | null) => void
  onDifficultyChange: (d: DifficultyLevel) => void
  onStart: () => void
}

export function SetupScreen({
  players: allPlayers,
  memberships,
  playerA,
  playerB,
  difficulty,
  onSetPlayerA,
  onSetPlayerB,
  onDifficultyChange,
  onStart,
}: Props) {
  const t = useTranslations()

  if (allPlayers.length === 0) {
    return (
      <div className="setup-screen">
        <h2 className="setup-screen__title">{t.setup.title}</h2>
        <p className="setup-screen__empty">{t.setup.emptyState}</p>
      </div>
    )
  }

  const bothSelected = playerA !== null && playerB !== null
  const directlyConnected = bothSelected && difficulty === 'easy'
    ? areDirectlyConnected(playerA!, playerB!, memberships)
    : false
  const canStart = bothSelected && !directlyConnected

  return (
    <div className="setup-screen">
      <h2 className="setup-screen__title">{t.setup.title}</h2>

      <div className="setup-screen__players">
        <PlayerPicker
          role="A"
          selected={playerA}
          allPlayers={allPlayers}
          excludeId={playerB?.id}
          onSelect={onSetPlayerA}
        />
        <PlayerPicker
          role="B"
          selected={playerB}
          allPlayers={allPlayers}
          excludeId={playerA?.id}
          onSelect={onSetPlayerB}
        />
      </div>

      <DifficultyPicker value={difficulty} onChange={onDifficultyChange} />

      {directlyConnected && (
        <p className="setup-screen__warning">
          {t.setup.directlyConnectedWarning}
        </p>
      )}

      <button
        type="button"
        className="btn btn--primary btn--lg"
        disabled={!canStart}
        onClick={onStart}
      >
        {t.setup.launch}
      </button>
    </div>
  )
}
