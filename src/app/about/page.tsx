import type { Metadata } from 'next'
import { AboutScreen } from '@/components/about/AboutScreen'

export const metadata: Metadata = {
  title: 'About',
  description: 'Where the data of I Played With comes from, and who made it.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <div className="game-page">
      <AboutScreen />
    </div>
  )
}
