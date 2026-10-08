import { parseContactMessage } from '@/domain/contactMessage'

const ID = '3f2b8c1e-9a4d-4e7f-8b2c-1d5e6f7a8b9c'

describe('parseContactMessage', () => {
  it('needs only a message; the rest is optional', () => {
    expect(parseContactMessage({ message: '  Le club de Bayonne manque en 2015  ' })).toEqual({
      ok: true,
      value: { name: null, email: null, message: 'Le club de Bayonne manque en 2015', visitorId: null },
    })
  })

  it('keeps a name, an email and a visitor id', () => {
    const parsed = parseContactMessage({ name: 'Louis', email: 'a@b.fr', message: 'Une idée de mode', visitorId: ID })
    expect(parsed).toEqual({
      ok: true,
      value: { name: 'Louis', email: 'a@b.fr', message: 'Une idée de mode', visitorId: ID },
    })
  })

  it('refuses a message too short or too long', () => {
    expect(parseContactMessage({ message: 'salut' })).toEqual({ ok: false, problem: 'message-too-short' })
    expect(parseContactMessage({})).toEqual({ ok: false, problem: 'message-too-short' })
    expect(parseContactMessage({ message: 'x'.repeat(3001) })).toEqual({ ok: false, problem: 'message-too-long' })
  })

  it('refuses an email that is not one', () => {
    for (const email of ['louis', 'louis@', 'a b@c.fr', `${'a'.repeat(250)}@b.fr`]) {
      expect(parseContactMessage({ email, message: 'Un message assez long' })).toEqual({ ok: false, problem: 'email' })
    }
  })

  it('refuses a name too long', () => {
    expect(parseContactMessage({ name: 'x'.repeat(61), message: 'Un message assez long' })).toEqual({
      ok: false,
      problem: 'name-too-long',
    })
  })

  it('folds line breaks out of name and email — they end up in the subject and Reply-To', () => {
    const parsed = parseContactMessage({
      name: 'Louis\r\nBcc: x@y.z',
      email: ' a@b.fr\n',
      message: 'Un message assez long',
    })
    expect(parsed).toMatchObject({ ok: true, value: { name: 'Louis Bcc: x@y.z', email: 'a@b.fr' } })
  })

  it('drops a visitor id that is not a UUID', () => {
    expect(parseContactMessage({ message: 'Un message assez long', visitorId: 'me' })).toMatchObject({
      value: { visitorId: null },
    })
  })
})
