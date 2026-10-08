import { isSportId } from '@/domain/sport'
import { SportProvider } from '@/i18n/SportContext'

type Props = {
  children: React.ReactNode
  params: Promise<{ sport: string }>
}

/**
 * Every page of a sport — its daily challenge, free play, archive, shared links — and the pop-ups
 * they open speak that sport's words (`useTranslations`). An unknown sport is the page's to 404.
 */
export default async function SportLayout({ children, params }: Props) {
  const { sport } = await params
  if (!isSportId(sport)) return children
  return <SportProvider sport={sport}>{children}</SportProvider>
}
