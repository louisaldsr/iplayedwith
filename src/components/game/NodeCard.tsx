type Props = {
  nodeKey: string
  label: string
  sublabel?: string
  kind: 'player' | 'club'
  imageUrl?: string
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
  imageUrl = '/dummy.svg',
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

  return (
    <div
      className={classes}
      style={{ left: position.x, top: position.y }}
      onPointerDown={e => onPointerDown(e, nodeKey)}
    >
      <img src={imageUrl} alt="" className="node-card__avatar" draggable={false} />
      <span className="node-card__label">{label}</span>
      {sublabel && <span className="node-card__sublabel">{sublabel}</span>}
    </div>
  )
}
