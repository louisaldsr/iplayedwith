import { render, screen, fireEvent } from '@testing-library/react'
import { AutocompleteInput } from '@/components/shared/AutocompleteInput'

const rochelais = { id: 'c1', name: 'Stade Rochelais', hint: 'La Rochelle' }
const toulousain = { id: 'c2', name: 'Stade Toulousain' }

function renderInput(props: Partial<Parameters<typeof AutocompleteInput>[0]> = {}) {
  const onSelect = jest.fn()
  render(
    <AutocompleteInput
      value="la roch"
      onChange={jest.fn()}
      onSelect={onSelect}
      suggestions={[rochelais, toulousain]}
      placeholder="Search a club…"
      {...props}
    />,
  )
  return { onSelect }
}

describe('AutocompleteInput', () => {
  it('shows the alias next to the official name', () => {
    renderInput()

    expect(screen.getByText('Stade Rochelais')).toBeInTheDocument()
    expect(screen.getByText('La Rochelle')).toBeInTheDocument()
  })

  it('shows no hint for a suggestion that matched on its own name', () => {
    renderInput({ suggestions: [toulousain] })

    expect(screen.getByText('Stade Toulousain')).toBeInTheDocument()
    expect(document.querySelector('.autocomplete-item__hint')).toBeNull()
  })

  // Selecting used to hand back the name string, which the caller re-resolved by
  // comparison. With an alias on the row that is no longer a unique key, so the whole
  // suggestion comes back instead.
  it('hands the selected suggestion back to the caller', () => {
    const { onSelect } = renderInput()

    fireEvent.mouseDown(screen.getByText('Stade Rochelais'))

    expect(onSelect).toHaveBeenCalledWith(rochelais)
  })

  it('stays closed below the minimum query length', () => {
    renderInput({ value: 'l' })

    expect(screen.queryByText('Stade Rochelais')).not.toBeInTheDocument()
  })

  // A broken search used to render "No results", which reads as "this player does not
  // exist" — the reason a missing migration was hard to diagnose from the UI.
  it('says the search failed instead of claiming there is no match', () => {
    renderInput({
      suggestions: [],
      failed: true,
      emptyLabel: 'No results',
      errorLabel: 'Search unavailable — try again',
    })

    expect(screen.getByText('Search unavailable — try again')).toBeInTheDocument()
    expect(screen.queryByText('No results')).not.toBeInTheDocument()
  })

  it('still says "no results" for a genuinely empty search', () => {
    renderInput({ suggestions: [], emptyLabel: 'No results', errorLabel: 'Search unavailable' })

    expect(screen.getByText('No results')).toBeInTheDocument()
    expect(screen.queryByText('Search unavailable')).not.toBeInTheDocument()
  })

  describe('keyboard', () => {
    const input = () => screen.getByPlaceholderText('Search a club…')
    const active = () => screen.queryByRole('option', { selected: true })

    it('walks the list with the arrows, wrapping at both ends', () => {
      renderInput()

      fireEvent.keyDown(input(), { key: 'ArrowDown' })
      expect(active()).toHaveTextContent('Stade Rochelais')
      fireEvent.keyDown(input(), { key: 'ArrowDown' })
      expect(active()).toHaveTextContent('Stade Toulousain')
      fireEvent.keyDown(input(), { key: 'ArrowDown' })
      expect(active()).toHaveTextContent('Stade Rochelais')
      fireEvent.keyDown(input(), { key: 'ArrowUp' })
      expect(active()).toHaveTextContent('Stade Toulousain')
    })

    it('starts on the last row when going up', () => {
      renderInput()

      fireEvent.keyDown(input(), { key: 'ArrowUp' })

      expect(active()).toHaveTextContent('Stade Toulousain')
      expect(input()).toHaveAttribute('aria-activedescendant', active()!.id)
    })

    it('picks the highlighted row on Enter', () => {
      const { onSelect } = renderInput()

      fireEvent.keyDown(input(), { key: 'ArrowDown' })
      fireEvent.keyDown(input(), { key: 'ArrowDown' })
      fireEvent.keyDown(input(), { key: 'Enter' })

      expect(onSelect).toHaveBeenCalledWith(toulousain)
    })

    // With nothing highlighted, Enter is the form's: a name typed in full still submits.
    it('leaves Enter alone when no row is highlighted', () => {
      const { onSelect } = renderInput()

      const enter = fireEvent.keyDown(input(), { key: 'Enter' })

      expect(enter).toBe(true)
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('drops the highlight on Escape', () => {
      renderInput()

      fireEvent.keyDown(input(), { key: 'ArrowDown' })
      fireEvent.keyDown(input(), { key: 'Escape' })

      expect(active()).toBeNull()
    })

    it('drops the highlight when the query changes', () => {
      const onChange = jest.fn()
      renderInput({ onChange })

      fireEvent.keyDown(input(), { key: 'ArrowDown' })
      fireEvent.change(input(), { target: { value: 'la roche' } })

      expect(onChange).toHaveBeenCalledWith('la roche')
      expect(active()).toBeNull()
    })
  })
})
