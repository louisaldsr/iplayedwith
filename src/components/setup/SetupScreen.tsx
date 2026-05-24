import { Player } from '../../domain/player'
import { DifficultyLevel } from '../../game/game'
import { useTranslations } from '../../i18n'
import { PlayerPicker } from './PlayerPicker'
import { DifficultyPicker } from './DifficultyPicker'
import { players as allPlayers } from '../../mock/data'

type Props = {
  playerA: Player | null
  playerB: Player | null
  difficulty: DifficultyLevel
  onSetPlayerA: (p: Player | null) => void
  onSetPlayerB: (p: Player | null) => void
  onDifficultyChange: (d: DifficultyLevel) => void
  onStart: () => void
}

export function SetupScreen({
  playerA,
  playerB,
  difficulty,
  onSetPlayerA,
  onSetPlayerB,
  onDifficultyChange,
  onStart,
}: Props) {
  const t = useTranslations()
  const canStart = playerA !== null && playerB !== null

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
