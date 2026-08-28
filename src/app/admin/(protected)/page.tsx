import Link from 'next/link'

export default function AdminDashboard() {
  return (
    <div className="admin-dashboard">
      <Link href="/admin/clubs/new" className="admin-card">
        <span className="admin-card__title">Add club</span>
        <span className="admin-card__desc">Create a new club</span>
      </Link>
      <Link href="/admin/players/new" className="admin-card">
        <span className="admin-card__title">Add player</span>
        <span className="admin-card__desc">Create a player and build their career</span>
      </Link>
      <Link href="/admin/clubs" className="admin-card">
        <span className="admin-card__title">Clubs</span>
        <span className="admin-card__desc">Build a club&rsquo;s season-by-season roster</span>
      </Link>
    </div>
  )
}
