import { act, fireEvent, render, screen } from '@testing-library/react'
import { RulesDemo } from '@/components/rules/RulesDemo'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const caption = () => document.querySelector('.rules-demo__caption')?.textContent
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms))
const step = (n: number) => screen.getByRole('button', { name: new RegExp(`^Step ${n} of 4`) })

describe('RulesDemo', () => {
  it('plays the story on a loop: the goal, a move, a miss, the win', () => {
    render(<RulesDemo active />)
    expect(caption()).toMatch(/Two players are drawn/)

    advance(5000)
    expect(caption()).toMatch(/shared a club and a season/)
    expect(screen.getByText(/With Messi — FC Barcelona, 2013-2014/)).toBeInTheDocument()

    advance(5000)
    expect(caption()).toMatch(/costs a life/)
    expect(document.querySelector('.heart--breaking')).not.toBeNull()

    advance(5000)
    expect(caption()).toMatch(/You win/)
    expect(document.querySelector('.game-board--won')).not.toBeNull()

    // Back to the start: the board is empty again, every life back.
    advance(5000)
    expect(caption()).toMatch(/Two players are drawn/)
    expect(document.querySelector('.game-board--won')).toBeNull()
    expect(document.querySelector('.heart--empty')).toBeNull()
  })

  it('jumps to a scene from the progress bar, as if it had been played', () => {
    render(<RulesDemo active />)

    fireEvent.click(step(4))
    expect(caption()).toMatch(/You win/)
    expect(step(4)).toHaveAttribute('aria-current', 'step')
    // The earlier scenes happened: Neymar is on the board, a life is gone.
    expect(screen.getByText('Neymar')).toBeInTheDocument()
    expect(document.querySelectorAll('.heart--empty')).toHaveLength(1)
  })

  it('pauses and resumes', () => {
    render(<RulesDemo active />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause the demo' }))
    advance(10000)
    expect(caption()).toMatch(/Two players are drawn/)

    fireEvent.click(screen.getByRole('button', { name: 'Play the demo' }))
    advance(4000)
    expect(caption()).toMatch(/shared a club and a season/)
  })

  it('stands still while the dialog is closed, and restarts when it opens', () => {
    const { rerender } = render(<RulesDemo active />)
    advance(10000)
    expect(caption()).toMatch(/costs a life/)

    rerender(<RulesDemo active={false} />)
    advance(10000)
    expect(caption()).toMatch(/costs a life/)

    rerender(<RulesDemo active />)
    expect(caption()).toMatch(/Two players are drawn/)
  })
})
