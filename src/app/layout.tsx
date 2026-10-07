import type { Metadata } from 'next'
import './globals.css'
import { RulesProvider } from '@/components/rules/RulesProvider'
import { MenuButton } from '@/components/menu/MenuButton'
import { SiteAnalytics } from '@/components/shared/SiteAnalytics'
import { SITE_NAME, SITE_URL } from '@/lib/siteUrl'

const DESCRIPTION =
  'I Played With — the teammates game. Connect two players through the teammates they shared, club by club, ' +
  'season by season. A daily challenge for rugby and football.'

export const metadata: Metadata = {
  // Every relative URL below — canonicals, the Open Graph image — is built on the real domain.
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — the teammates game for rugby and football`, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  // The image comes from src/app/opengraph-image.png.
  openGraph: { type: 'website', siteName: SITE_NAME, url: '/', title: SITE_NAME, description: DESCRIPTION },
  // X only shows the image large with this card.
  twitter: { card: 'summary_large_image' },
}

/** What makes Google show the site's name — and know "IPlayedWith" is the same site. */
const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  alternateName: ['IPlayedWith', 'iplayedwith'],
  url: SITE_URL,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }} />
        <RulesProvider>
          <MenuButton />
          {children}
        </RulesProvider>
        <SiteAnalytics />
      </body>
    </html>
  )
}
