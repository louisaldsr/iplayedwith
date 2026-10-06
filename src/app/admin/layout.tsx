import type { Metadata } from 'next'

/** The back-office is never indexed — robots.txt keeps crawlers out, this keeps it out of results. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
