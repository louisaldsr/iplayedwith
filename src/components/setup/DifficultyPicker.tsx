import { DifficultyLevel } from '../../game/game'
import { useTranslations } from '../../i18n'

type Props = {
  value: DifficultyLevel
  onChange: (d: DifficultyLevel) => void
}

export function DifficultyPicker({ value, onChange }: Props) {
  const t = useTranslations()

  return (
    <div className="difficulty-picker">
      <span className="difficulty-picker__label">{t.setup.difficulty}</span>
      <div className="difficulty-picker__options">
        <button
          type="button"
          className={`difficulty-picker__option${value === 'easy' ? ' difficulty-picker__option--active' : ''}`}
          onClick={() => onChange('easy')}
        >
          <span className="difficulty-picker__option-label">{t.setup.easy}</span>
          <span className="difficulty-picker__option-desc">{t.setup.easyDesc}</span>
        </button>
        <button
          type="button"
          className={`difficulty-picker__option${value === 'hard' ? ' difficulty-picker__option--active' : ''}`}
          onClick={() => onChange('hard')}
        >
          <span className="difficulty-picker__option-label">{t.setup.hard}</span>
          <span className="difficulty-picker__option-desc">{t.setup.hardDesc}</span>
        </button>
      </div>
    </div>
  )
}
