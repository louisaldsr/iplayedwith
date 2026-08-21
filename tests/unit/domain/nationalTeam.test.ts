import { nationalTeamFor } from '@/domain/nationalTeam'
import { Nationality } from '@/domain/nationality'

describe('nationalTeamFor', () => {
  it('resolves Northern Ireland to unified Ireland for rugby', () => {
    expect(nationalTeamFor(Nationality('GB-NIR'), 'rugby')).toBe('IE')
  })

  it('keeps Northern Ireland as its own team for football', () => {
    expect(nationalTeamFor(Nationality('GB-NIR'), 'football')).toBe('GB-NIR')
  })

  it('leaves other nationalities unchanged regardless of sport', () => {
    expect(nationalTeamFor(Nationality('GB-SCT'), 'rugby')).toBe('GB-SCT')
    expect(nationalTeamFor(Nationality('GB-SCT'), 'football')).toBe('GB-SCT')
    expect(nationalTeamFor(Nationality('FR'), 'rugby')).toBe('FR')
  })
})
