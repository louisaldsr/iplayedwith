'use client'

import { FormEvent, useState } from 'react'
import { useTranslations } from '../../i18n'
import { CONTACT_LIMITS, ContactProblem, parseContactMessage } from '../../domain/contactMessage'
import { sendContactMessage } from '../../lib/gameApi'
import { readVisitor } from '../../lib/visitor'
import { CONTACT_EMAIL } from '../../lib/siteUrl'

type Status = 'idle' | 'sending' | 'sent' | 'failed'

/** Which field a refusal belongs to — its message is shown under that field. */
const FIELD_OF: Record<ContactProblem, 'name' | 'email' | 'message'> = {
  'message-too-short': 'message',
  'message-too-long': 'message',
  email: 'email',
  'name-too-long': 'name',
}

/**
 * The contact address, in plain sight, and a form that emails the author (`POST /api/contact`).
 * The address stays the way out whatever happens to the form: a failed send points back to it.
 *
 * Checked here with the server's own rules (`parseContactMessage`) before any request. The
 * visitor id rides along, so a report about a result can be looked up.
 */
export function ContactSection() {
  const t = useTranslations().about.contact
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [problem, setProblem] = useState<ContactProblem | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard
      ?.writeText(CONTACT_EMAIL)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return
    const parsed = parseContactMessage({ name, email, message })
    if (!parsed.ok) {
      setProblem(parsed.problem)
      return
    }
    setProblem(null)
    setStatus('sending')
    const res = await sendContactMessage({ name, email, message, website, visitorId: readVisitor().playerId })
    if (res.status === 'sent') {
      setStatus('sent')
      setName('')
      setEmail('')
      setMessage('')
    } else if (res.status === 'invalid') {
      setProblem(res.problem)
      setStatus('idle')
    } else {
      setStatus('failed')
    }
  }

  const errorFor = (field: 'name' | 'email' | 'message') =>
    problem && FIELD_OF[problem] === field ? t.problems[problem] : null

  const field = (id: 'name' | 'email' | 'message', hint?: string) => {
    const error = errorFor(id)
    return {
      id: `contact-${id}`,
      'aria-invalid': error ? true : undefined,
      'aria-describedby':
        [hint && `contact-${id}-hint`, error && `contact-${id}-error`].filter(Boolean).join(' ') || undefined,
    }
  }

  const mailLink = (
    <a href={`mailto:${CONTACT_EMAIL}`} className="contact__address">
      {CONTACT_EMAIL}
    </a>
  )

  return (
    <section className="about-screen__section contact" aria-labelledby="contact-title">
      <h2 id="contact-title">{t.title}</h2>
      <p>{t.intro}</p>
      <div className="contact__email">
        {mailLink}
        <button type="button" className="btn btn--ghost contact__copy" onClick={copy}>
          {copied ? `✓ ${t.copied}` : t.copy}
        </button>
      </div>

      <h3 className="contact__form-title">{t.formTitle}</h3>

      {status === 'sent' ? (
        <div className="contact__sent" role="status">
          <p>{t.sent}</p>
          <button type="button" className="btn btn--ghost" onClick={() => setStatus('idle')}>
            {t.sendAnother}
          </button>
        </div>
      ) : (
        <form className="contact__form" onSubmit={submit} noValidate>
          <div className="contact__row">
            <div className="contact__field">
              <label htmlFor="contact-name">
                {t.name} <span className="contact__optional">({t.optional})</span>
              </label>
              <input
                {...field('name')}
                className="contact__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={CONTACT_LIMITS.name}
                autoComplete="name"
              />
              {errorFor('name') && (
                <p id="contact-name-error" className="contact__error">
                  {errorFor('name')}
                </p>
              )}
            </div>
            <div className="contact__field">
              <label htmlFor="contact-email">
                {t.email} <span className="contact__optional">({t.optional})</span>
              </label>
              <input
                {...field('email', t.emailHint)}
                className="contact__input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={CONTACT_LIMITS.email}
                autoComplete="email"
              />
              <p id="contact-email-hint" className="contact__hint">
                {t.emailHint}
              </p>
              {errorFor('email') && (
                <p id="contact-email-error" className="contact__error">
                  {errorFor('email')}
                </p>
              )}
            </div>
          </div>

          <div className="contact__field">
            <label htmlFor="contact-message">{t.message}</label>
            <textarea
              {...field('message')}
              className="contact__input contact__textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={CONTACT_LIMITS.message.max}
              rows={6}
              required
            />
            {errorFor('message') && (
              <p id="contact-message-error" className="contact__error">
                {errorFor('message')}
              </p>
            )}
          </div>

          {/* Honeypot: off-screen and out of the tab order — only a bot fills it in. */}
          <div className="contact__trap" aria-hidden="true">
            <label htmlFor="contact-website">Website</label>
            <input
              id="contact-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {status === 'failed' && (
            <p className="contact__error" role="alert">
              {t.failed} {mailLink}.
            </p>
          )}

          <button type="submit" className="btn btn--primary contact__send" disabled={status === 'sending'}>
            {status === 'sending' ? t.sending : t.send}
          </button>
        </form>
      )}
    </section>
  )
}
