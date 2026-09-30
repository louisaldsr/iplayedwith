import type { Metadata } from 'next'
import './globals.css'
import { RulesProvider } from '@/components/rules/RulesProvider'
import { MenuButton } from '@/components/menu/MenuButton'

export const metadata: Metadata = {
  title: 'I Played With',
  description: 'Link two players through the teammates they shared. A daily challenge for rugby and football.',
  // The image comes from src/app/opengraph-image.png; X only shows it large with this card.
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RulesProvider>
          <MenuButton />
          {children}
        </RulesProvider>
      </body>
    </html>
  )
}
