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
  isDragging?: boolean
  highlighted?: boolean
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
  isDragging,
  highlighted,
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
      style={{ left: position.x, top: position.y }}
      onPointerDown={(e) => onPointerDown(e, nodeKey)}
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
