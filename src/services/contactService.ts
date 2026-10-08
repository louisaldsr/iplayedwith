import { ContactMessage } from '@/domain/contactMessage'
import { CONTACT_EMAIL, SITE_NAME } from '@/lib/siteUrl'
import { sendEmail } from '@/lib/mailer'

/** The form's sender: any address on the verified domain works; this one says what it is. */
export const CONTACT_FROM = `${SITE_NAME} <contact-form@iplayedwith.com>`

/**
 * Emails a contact message to the contact address. With the sender's email as Reply-To, answering
 * in the mail client answers the visitor; without it, there is no one to answer.
 */
export async function sendContactMessage(contact: ContactMessage): Promise<void> {
  const from = contact.name ?? contact.email ?? 'a visitor'
  const lines = [
    contact.message,
    '',
    '—',
    `Name: ${contact.name ?? '(not given)'}`,
    `Email: ${contact.email ?? '(not given — no reply possible)'}`,
    `Visitor id: ${contact.visitorId ?? '(none)'}`,
  ]
  await sendEmail({
    from: CONTACT_FROM,
    to: CONTACT_EMAIL,
    subject: `[${SITE_NAME}] Message from ${from}`,
    text: lines.join('\n'),
    replyTo: contact.email ?? undefined,
  })
}
