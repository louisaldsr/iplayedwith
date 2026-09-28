import { render, screen } from '@testing-library/react'
import { NodeCard } from '@/components/game/NodeCard'

function renderCard(props: Partial<Parameters<typeof NodeCard>[0]> = {}) {
  const { container } = render(
    <NodeCard
      nodeKey="player:p1"
      label="Antoine Dupont"
      kind="player"
      position={{ x: 0, y: 0 }}
      onPointerDown={jest.fn()}
      {...props}
    />,
  )
  return container.firstChild as HTMLElement
}

describe('NodeCard — fame floor', () => {
  it.each([
    [1, 'famous', 'Famous'],
    [2, 'known', 'Known'],
    [3, 'unsung', 'Unsung'],
  ] as const)('styles and labels floor %i as %s', (floor, key, label) => {
    const card = renderCard({ fameFloor: floor })
    expect(card).toHaveClass(`node-card--${key}`)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('renders a plain card when there is no floor', () => {
    const card = renderCard()
    expect(card.className).not.toMatch(/famous|known|unsung/)
    expect(card.querySelector('.node-card__floor')).toBeNull()
  })
})
