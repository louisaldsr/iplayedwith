import type { Metadata } from 'next'
import './globals.css'
import { RulesProvider } from '@/components/rules/RulesProvider'
import { MenuButton } from '@/components/menu/MenuButton'

export const metadata: Metadata = {
  title: 'I Played With',
  description: 'Rugby six degrees of separation game',
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
