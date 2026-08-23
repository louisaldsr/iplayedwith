import * as cheerio from 'cheerio'

export type ListedPlayer = {
  allrugbyId: string
  slug: string
  profileUrl: string
  lastName: string
  firstName: string
  name: string
}

function titleCase(str: string): string {
  return str.toLowerCase().replace(/(^|[\s'-])([a-zà-öø-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

const PROFILE_URL_RE = /\/joueurs\/(.+)-(\d+)\.html$/

export function parsePlayersListHtml(html: string): ListedPlayer[] {
  const $ = cheerio.load(html)
  const players: ListedPlayer[] = []

  $('div.bloc.jou').each((_, block) => {
    const $a = $(block).find('a[href*="/joueurs/"]').first()
    const href = $a.attr('href') || ''
    const match = href.match(PROFILE_URL_RE)
    if (!match) return

    const [, slug, allrugbyId] = match
    const lastName = $a.find('b').text().trim()

    const contents = $a.contents().toArray()
    const brIndex = contents.findIndex((n) => n.type === 'tag' && n.name === 'br')
    const firstNameNode = brIndex >= 0 ? contents[brIndex + 1] : undefined
    const firstName = firstNameNode && firstNameNode.type === 'text' ? (firstNameNode.data || '').trim() : ''

    if (!lastName || !firstName) return

    players.push({
      allrugbyId,
      slug,
      profileUrl: href,
      lastName,
      firstName,
      name: `${firstName} ${titleCase(lastName)}`,
    })
  })

  return players
}
