import { Nationality } from '../../domain/nationality'

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
}: Props) {
  const classes = [
    'node-card',
    `node-card--${kind}`,
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
      onPointerDown={e => onPointerDown(e, nodeKey)}
    >
      {kind === 'player' && nationality && (
        <span
          className={`fi fi-${nationality.toLowerCase()} node-card__flag`}
          title={nationality}
          role="img"
          aria-label={nationality}
        />
      )}
      {src && (
        <img
          src={src}
          alt=""
          className={kind === 'club' ? 'node-card__logo' : 'node-card__avatar'}
          draggable={false}
        />
      )}
      <span className="node-card__label">{label}</span>
      {sublabel && <span className="node-card__sublabel">{sublabel}</span>}
    </div>
  )
}
