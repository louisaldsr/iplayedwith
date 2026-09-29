import { act, fireEvent, render, screen } from '@testing-library/react'
import { RulesProvider } from '@/components/rules/RulesProvider'
import { markRulesSeen } from '@/lib/visitor'

const mockPathname = jest.fn(() => '/')
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname() }))

// jsdom implements <dialog> but not its modal API.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

beforeEach(() => {
  window.localStorage.clear()
  mockPathname.mockReturnValue('/')
})

const dialog = () => document.querySelector('dialog') as HTMLDialogElement | null

describe('RulesProvider', () => {
  it('opens the rules on a first visit, and records them as seen once closed', () => {
    render(<RulesProvider>page</RulesProvider>)

    expect(dialog()?.open).toBe(true)
    expect(window.localStorage.getItem('ipw.playerId')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: "Let's play" }))

    expect(dialog()?.open).toBe(false)
    expect(window.localStorage.getItem('ipw.rulesSeen')).not.toBeNull()
  })

  it('stays closed for a visitor who has already seen them', () => {
    markRulesSeen()
    render(<RulesProvider>page</RulesProvider>)

    expect(dialog()?.open).toBe(false)
  })

  it('reopens from the "?" button', () => {
    markRulesSeen()
    render(<RulesProvider>page</RulesProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'How to play' }))

    expect(dialog()?.open).toBe(true)
  })

  it('closes on a click on the backdrop, not inside the box', () => {
    render(<RulesProvider>page</RulesProvider>)

    fireEvent.click(screen.getByRole('heading', { name: 'How to play' }))
    expect(dialog()?.open).toBe(true)

    act(() => {
      fireEvent.click(dialog()!)
    })
    expect(dialog()?.open).toBe(false)
  })

  it('stays out of the back-office, and does not count it as a visit', () => {
    mockPathname.mockReturnValue('/admin/clubs')
    render(<RulesProvider>admin</RulesProvider>)

    expect(dialog()).toBeNull()
    expect(screen.queryByRole('button', { name: 'How to play' })).toBeNull()
    expect(window.localStorage.getItem('ipw.playerId')).toBeNull()
  })
})
