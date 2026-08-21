'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ReactNode } from 'react'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <div className="admin-shell">
      <header className="admin-nav">
        <Link href="/admin" className="admin-nav__title">iplayedwith admin</Link>
        <nav className="admin-nav__links">
          <Link href="/admin/clubs/new">Add club</Link>
          <Link href="/admin/players/new">Add player</Link>
        </nav>
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  )
}
