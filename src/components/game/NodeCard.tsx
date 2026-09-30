import { Nationality } from '../../domain/nationality'
import { FameFloor, fameFloorKey } from '../../domain/fameFloor'
import { useTranslations } from '../../i18n'

type Props = {
  nodeKey: string
  label: string
  sublabel?: string
  kind: 'player' | 'club'
  imageUrl?: string
  nationality?: Nationality
  position: { x: number; y: number }
  onPointerDown: (e: React.PointerEvent, key: string) => void
  /** Makes the card a button (keyboard included) that opens the player's career. */
  onOpen?: () => void
  isDragging?: boolean
  highlighted?: boolean
  /** Rank along the winning chain, from A — staggers the cards lighting up one after another. */
  pathStep?: number
  target?: boolean
  /** Styles the card by fame floor. The board leaves it unset for players A and B. */
  fameFloor?: FameFloor
}

export function NodeCard({
  nodeKey,
  label,
  sublabel,
  kind,
  imageUrl,
  nationality,
  position,
  onPointerDown,
  onOpen,
  isDragging,
  highlighted,
  pathStep,
  target,
  fameFloor,
}: Props) {
  const t = useTranslations()
  const floorKey = fameFloor ? fameFloorKey(fameFloor) : undefined
  const classes = [
    'node-card',
    `node-card--${kind}`,
    target ? 'node-card--target' : '',
    floorKey ? `node-card--${floorKey}` : '',
    isDragging ? 'node-card--dragging' : '',
    highlighted ? 'node-card--highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const src = imageUrl ?? (kind === 'player' ? '/dummy.svg' : undefined)

  return (
    <div
      className={classes}
      style={{ left: position.x, top: position.y, ...(pathStep !== undefined && { '--path-step': pathStep }) }}
      onPointerDown={(e) => onPointerDown(e, nodeKey)}
      {...(onOpen && {
        role: 'button',
        tabIndex: 0,
        'aria-label': `${label} — ${t.daily.viewCareer}`,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onOpen()
        },
      })}
    >
      {kind === 'player' && nationality && (
        <span
          className={`fi fi-${nationality.toLowerCase()} node-card__flag`}
          title={nationality}
          role="img"
          aria-label={nationality}
        />
      )}
      {floorKey && <span className="node-card__floor">{t.fame.floors[floorKey]}</span>}
      {src && (
        <img src={src} alt="" className={kind === 'club' ? 'node-card__logo' : 'node-card__avatar'} draggable={false} />
      )}
      <span className="node-card__label">{label}</span>
      {sublabel && <span className="node-card__sublabel">{sublabel}</span>}
    </div>
  )
}
