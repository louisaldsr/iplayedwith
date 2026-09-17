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
})
